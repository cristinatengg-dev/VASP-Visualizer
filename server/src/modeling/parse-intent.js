const { geminiChat } = require('../rendering/parse-science');
const {
  DEFAULT_MODELING_PROVIDER_ORDER,
  normalizeModelingProviderPreferences,
} = require('./provider-registry');

const MODELING_INTENT_SYSTEM_PROMPT = `You are a molecular and crystal modeling expert.
Your task is to convert natural language descriptions into a structured JSON for atomistic modeling.
Supported task types: molecule, crystal, slab.

Return ONLY a valid JSON object. No markdown formatting, no code blocks, no explanation.
Schema:
{
  "task_type": "molecule|crystal|slab",
  "substrate": {
    "material": "string (e.g. Cu, TiO2)",
    "surface": "string (e.g. (111), (1,1,1))",
    "min_slab_size": number (minimum thickness in Angstroms, default 8.0),
    "supercell": [number, number, number] (default [1,1,1]),
    "vacuum": number (vacuum size in Angstroms, default 15.0)
  },
  "adsorbates": [
    {
      "formula": "string (e.g. CO2, CO, H2O)",
      "initial_site": "top|bridge|hollow (default top)",
      "count": number (default 1)
    }
  ],
  "doping": {
    "host_element": "string (e.g. Cu)",
    "dopant_element": "string (e.g. Zn)",
    "count": number (default 1),
    "concentration": number (optional fraction like 0.125 or percent like 12.5)
  },
  "defect": {
    "type": "vacancy",
    "element": "string (e.g. O, Cu)",
    "count": number (default 1)
  },
  "provider_preferences": ["materials_project","atomly","csd","icsd","optimade","fallback"]
}

Important defaults:
- If slab/surface is mentioned but thickness not specified, default min_slab_size to 8.0.
- If vacuum not specified, default to 15.0.
- If supercell not specified, default to [1,1,1].
- If the user asks to put a molecule on a surface, keep task_type as "slab" and populate the adsorbates array.
- If adsorbate site is not specified, default initial_site to "top".
- If adsorbate count is not specified, default count to 1.
- If the user asks for substitutional doping, keep task_type as "slab" or "crystal" based on the substrate, and populate the doping object.
- If doping count is not specified, default to 1.
- If the user asks to remove atoms or create vacancies, keep task_type as "slab" or "crystal" based on the substrate, and populate the defect object.
- For Phase 1, defect.type should be "vacancy".
- If defect count is not specified, default to 1.
- If material phase is ambiguous (e.g. "Fe"), prefer the standard state (e.g. bcc for Fe).
- If provider_preferences is not explicitly requested, keep the default search order.
- Preferred provider order defaults to: ${DEFAULT_MODELING_PROVIDER_ORDER.join(', ')}.`;

function safeJsonParse(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('Modeling intent parser returned empty content');
  }

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  }

  throw new Error(`Modeling intent parser returned invalid JSON: ${raw.slice(0, 240)}`);
}

function normalizeModelingIntent(intent, providerPreferences) {
  const nextIntent = intent && typeof intent === 'object' && !Array.isArray(intent)
    ? { ...intent }
    : {};

  nextIntent.task_type = String(nextIntent.task_type || 'slab').trim().toLowerCase() || 'slab';
  if (nextIntent.task_type === 'surface_adsorption') {
    nextIntent.task_type = 'slab';
  }
  if (nextIntent.task_type === 'doping') {
    nextIntent.task_type = nextIntent?.substrate?.surface ? 'slab' : 'crystal';
  }
  if (nextIntent.task_type === 'defect') {
    nextIntent.task_type = nextIntent?.substrate?.surface ? 'slab' : 'crystal';
  }

  if (nextIntent.substrate && typeof nextIntent.substrate === 'object' && !Array.isArray(nextIntent.substrate)) {
    nextIntent.substrate = { ...nextIntent.substrate };

    if (!Array.isArray(nextIntent.substrate.supercell)) {
      nextIntent.substrate.supercell = [1, 1, 1];
    } else {
      nextIntent.substrate.supercell = nextIntent.substrate.supercell
        .slice(0, 3)
        .map((value) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : 1;
        });
      while (nextIntent.substrate.supercell.length < 3) {
        nextIntent.substrate.supercell.push(1);
      }
    }

    if (nextIntent.substrate.min_slab_size == null) {
      nextIntent.substrate.min_slab_size = 8.0;
    }
    if (nextIntent.substrate.vacuum == null) {
      nextIntent.substrate.vacuum = 15.0;
    }
  }

  const siteAliases = {
    atop: 'top',
    top: 'top',
    bridge: 'bridge',
    hollow: 'hollow',
    center: 'hollow',
  };

  if (Array.isArray(nextIntent.adsorbates)) {
    nextIntent.adsorbates = nextIntent.adsorbates
      .map((adsorbate) => {
        if (!adsorbate || typeof adsorbate !== 'object' || Array.isArray(adsorbate)) {
          return null;
        }

        const formula = String(adsorbate.formula || '').trim();
        if (!formula) {
          return null;
        }

        const rawSite = String(adsorbate.initial_site || 'top').trim().toLowerCase();
        const initialSite = siteAliases[rawSite] || 'top';
        const parsedCount = Number(adsorbate.count);
        const count = Number.isFinite(parsedCount) && parsedCount > 0
          ? Math.max(1, Math.round(parsedCount))
          : 1;

        return {
          formula,
          initial_site: initialSite,
          count,
        };
      })
      .filter(Boolean);
  } else {
    nextIntent.adsorbates = [];
  }

  if (nextIntent.doping && typeof nextIntent.doping === 'object' && !Array.isArray(nextIntent.doping)) {
    const hostElement = String(nextIntent.doping.host_element || '').trim();
    const dopantElement = String(nextIntent.doping.dopant_element || '').trim();
    const parsedCount = Number(nextIntent.doping.count);
    const count = Number.isFinite(parsedCount) && parsedCount > 0
      ? Math.max(1, Math.round(parsedCount))
      : 1;
    const parsedConcentration = Number(nextIntent.doping.concentration);
    const concentration = Number.isFinite(parsedConcentration) && parsedConcentration > 0
      ? parsedConcentration
      : undefined;

    if (hostElement && dopantElement) {
      nextIntent.doping = {
        host_element: hostElement,
        dopant_element: dopantElement,
        count,
        ...(concentration != null ? { concentration } : {}),
      };
    } else {
      nextIntent.doping = undefined;
    }
  } else {
    nextIntent.doping = undefined;
  }

  if (nextIntent.defect && typeof nextIntent.defect === 'object' && !Array.isArray(nextIntent.defect)) {
    const type = String(nextIntent.defect.type || 'vacancy').trim().toLowerCase() || 'vacancy';
    const element = String(nextIntent.defect.element || '').trim();
    const parsedCount = Number(nextIntent.defect.count);
    const count = Number.isFinite(parsedCount) && parsedCount > 0
      ? Math.max(1, Math.round(parsedCount))
      : 1;

    if (element) {
      nextIntent.defect = {
        type: type === 'vacancy' ? 'vacancy' : 'vacancy',
        element,
        count,
      };
    } else {
      nextIntent.defect = undefined;
    }
  } else {
    nextIntent.defect = undefined;
  }

  nextIntent.provider_preferences = normalizeModelingProviderPreferences(
    nextIntent.provider_preferences || providerPreferences
  );

  return nextIntent;
}

async function parseModelingIntent({ prompt, providerPreferences } = {}) {
  const normalizedPrompt = String(prompt || '').trim();
  if (!normalizedPrompt) {
    throw new Error('Prompt is required');
  }

  const normalizedProviders = normalizeModelingProviderPreferences(providerPreferences);
  const content = await geminiChat(
    [
      {
        role: 'system',
        content: MODELING_INTENT_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `${normalizedPrompt}\n\nPreferred database order: ${normalizedProviders.join(', ')}`,
      },
    ],
    true
  );

  return normalizeModelingIntent(safeJsonParse(content), normalizedProviders);
}

module.exports = {
  MODELING_INTENT_SYSTEM_PROMPT,
  normalizeModelingIntent,
  parseModelingIntent,
  safeJsonParse,
};
