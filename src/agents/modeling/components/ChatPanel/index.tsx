import React, { useEffect, useMemo, useState } from 'react';
import {
  MODELING_PROVIDER_OPTIONS,
  ModelingIntent,
  ModelingProviderName,
} from '../../types/modeling';
import { useModeling } from '../../hooks/useModeling';interface ChatPanelProps {
  onIntentChange: (intent: ModelingIntent) => void;
  currentIntent: ModelingIntent | null;
  prefillPrompt?: string | null;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onIntentChange, currentIntent, prefillPrompt }) => {
  const [input, setInput] = useState(prefillPrompt ?? '');
  const [providerOrderInput, setProviderOrderInput] = useState(MODELING_PROVIDER_OPTIONS.join(','));
  const [editMaterial, setEditMaterial] = useState('');
  const [editSurface, setEditSurface] = useState('');
  const [editVacuum, setEditVacuum] = useState('');
  const [editSupercellX, setEditSupercellX] = useState('1');
  const [editSupercellY, setEditSupercellY] = useState('1');
  const [editSupercellZ, setEditSupercellZ] = useState('1');
  const [editAdsorbateFormula, setEditAdsorbateFormula] = useState('');
  const [editAdsorbateSite, setEditAdsorbateSite] = useState('top');
  const [editAdsorbateCount, setEditAdsorbateCount] = useState('1');
  const [editDopingHost, setEditDopingHost] = useState('');
  const [editDopingDopant, setEditDopingDopant] = useState('');
  const [editDopingCount, setEditDopingCount] = useState('1');
  const [editDefectElement, setEditDefectElement] = useState('');
  const [editDefectCount, setEditDefectCount] = useState('1');
  const {
    parseIntent,
    buildModel,
    replanModel,
    isBuilding,
    error,
    diagnostics,
    latestBuildMeta,
    runtimeSession,
  } = useModeling();

  // Sync prefill prompt from handoff when it changes
  useEffect(() => {
    if (prefillPrompt) {
      setInput(prefillPrompt);
    }
  }, [prefillPrompt]);

  const normalizedProviders = useMemo(() => {
    const nextProviders: ModelingProviderName[] = [];
    for (const rawValue of providerOrderInput.split(',')) {
      const provider = rawValue.trim().toLowerCase();
      if (
        provider &&
        MODELING_PROVIDER_OPTIONS.includes(provider as ModelingProviderName) &&
        !nextProviders.includes(provider as ModelingProviderName)
      ) {
        nextProviders.push(provider as ModelingProviderName);
      }
    }
    return nextProviders;
  }, [providerOrderInput]);

  useEffect(() => {
    const currentProviderKey = currentIntent?.provider_preferences?.join(',') || '';
    if (currentProviderKey) {
      setProviderOrderInput(currentProviderKey);
      return;
    }

    if (!providerOrderInput.trim() && diagnostics?.defaultOrder?.length) {
      setProviderOrderInput(diagnostics.defaultOrder.join(','));
    }
  }, [currentIntent?.provider_preferences, diagnostics?.defaultOrder, providerOrderInput]);

  useEffect(() => {
    if (!currentIntent) {
      return;
    }

    setEditMaterial(currentIntent.substrate?.material || '');
    setEditSurface(currentIntent.substrate?.surface || '');
    setEditVacuum(
      currentIntent.substrate?.vacuum != null
        ? String(currentIntent.substrate.vacuum)
        : '',
    );
    setEditSupercellX(String(currentIntent.substrate?.supercell?.[0] || 1));
    setEditSupercellY(String(currentIntent.substrate?.supercell?.[1] || 1));
    setEditSupercellZ(String(currentIntent.substrate?.supercell?.[2] || 1));
    setEditAdsorbateFormula(currentIntent.adsorbates?.[0]?.formula || '');
    setEditAdsorbateSite(currentIntent.adsorbates?.[0]?.initial_site || 'top');
    setEditAdsorbateCount(String(currentIntent.adsorbates?.[0]?.count || 1));
    setEditDopingHost(currentIntent.doping?.host_element || '');
    setEditDopingDopant(currentIntent.doping?.dopant_element || '');
    setEditDopingCount(String(currentIntent.doping?.count || 1));
    setEditDefectElement(currentIntent.defect?.element || '');
    setEditDefectCount(String(currentIntent.defect?.count || 1));
  }, [currentIntent]);

  const handleSend = async () => {
    if (!input.trim() || isBuilding) return;
    
    console.log('Sending to Gemini for parsing:', input);
    try {
      const parsedIntent = await parseIntent(input, normalizedProviders);
      if (parsedIntent) {
        onIntentChange({
          ...parsedIntent,
          provider_preferences: parsedIntent.provider_preferences?.length
            ? parsedIntent.provider_preferences
            : normalizedProviders,
        });
      }
    } catch (e) {
      console.error('handleSend error:', e);
    }
    
    setInput('');
  };

  const buildEditablePromptFromIntent = (intent: ModelingIntent | null) => {
    if (!intent) {
      return '';
    }

    const parts: string[] = [];
    const material = intent.substrate?.material;
    const surface = intent.substrate?.surface;
    const layers = intent.substrate?.layers;
    const supercell = intent.substrate?.supercell?.join('x');
    const vacuum = intent.substrate?.vacuum;

    if (intent.task_type === 'slab' && material) {
      parts.push(`Build a ${material}${surface ? `(${surface})` : ''} slab`);
      if (layers) {
        parts.push(`with ${layers} layers`);
      }
      if (supercell) {
        parts.push(`using a ${supercell} supercell`);
      }
      if (vacuum) {
        parts.push(`and ${vacuum} A vacuum`);
      }
    } else if (intent.task_type === 'crystal' && material) {
      parts.push(`Build a bulk ${material} crystal`);
      if (supercell) {
        parts.push(`with a ${supercell} supercell`);
      }
    } else if (material) {
      parts.push(`Build a ${intent.task_type} structure for ${material}`);
    } else {
      parts.push(`Modify the current ${intent.task_type} structure`);
    }

    if (intent.adsorbates?.length) {
      parts.push(
        `with ${intent.adsorbates
          .map((item) => {
            const countPrefix = item.count && item.count > 1 ? `${item.count} ` : '';
            const sitePart = item.initial_site ? ` on ${item.initial_site} sites` : '';
            return `${countPrefix}${item.formula}${sitePart}`;
          })
          .join(', ')}`
      );
    }

    if (intent.doping) {
      const dopingCount = intent.doping.count && intent.doping.count > 1
        ? ` (${intent.doping.count} substitutions)`
        : '';
      parts.push(`and dope ${intent.doping.host_element} with ${intent.doping.dopant_element}${dopingCount}`);
    }

    if (intent.defect?.type === 'vacancy' && intent.defect.element) {
      const defectCount = intent.defect.count && intent.defect.count > 1
        ? `${intent.defect.count} `
        : '';
      parts.push(`and create ${defectCount}${intent.defect.element} vacancy defects`);
    }

    return parts.join(' ');
  };

  const supportsStructuredEdit = currentIntent?.task_type === 'slab' || currentIntent?.task_type === 'crystal';

  const buildStructuredEditIntent = (intent: ModelingIntent): ModelingIntent => {
    const parsePositiveInteger = (value: string, fallback: number) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
      }
      return Math.max(1, Math.round(parsed));
    };

    const parsePositiveNumber = (value: string, fallback?: number) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
      }
      return parsed;
    };

    const nextAdsorbateFormula = editAdsorbateFormula.trim();
    const nextAdsorbateSite = editAdsorbateSite.trim().toLowerCase() || 'top';
    const nextAdsorbateCount = parsePositiveInteger(editAdsorbateCount, 1);
    const nextDopingHost = editDopingHost.trim();
    const nextDopingDopant = editDopingDopant.trim();
    const nextDopingCount = parsePositiveInteger(editDopingCount, intent.doping?.count || 1);
    const nextDefectElement = editDefectElement.trim();
    const nextDefectCount = parsePositiveInteger(editDefectCount, intent.defect?.count || 1);

    return {
      ...intent,
      provider_preferences: normalizedProviders.length
        ? normalizedProviders
        : intent.provider_preferences,
      substrate: {
        ...(intent.substrate || {}),
        material: editMaterial.trim() || intent.substrate?.material || '',
        surface: editSurface.trim() || intent.substrate?.surface || '(111)',
        vacuum: parsePositiveNumber(editVacuum, intent.substrate?.vacuum ?? 15),
        supercell: [
          parsePositiveInteger(editSupercellX, intent.substrate?.supercell?.[0] || 1),
          parsePositiveInteger(editSupercellY, intent.substrate?.supercell?.[1] || 1),
          parsePositiveInteger(editSupercellZ, intent.substrate?.supercell?.[2] || 1),
        ],
      },
      adsorbates: intent.task_type === 'slab'
        ? (nextAdsorbateFormula
          ? [
              {
                formula: nextAdsorbateFormula,
                initial_site: nextAdsorbateSite,
                count: nextAdsorbateCount,
              },
            ]
          : [])
        : intent.adsorbates,
      doping: nextDopingHost && nextDopingDopant
        ? {
            host_element: nextDopingHost,
            dopant_element: nextDopingDopant,
            count: nextDopingCount,
          }
        : undefined,
      defect: nextDefectElement
        ? {
            type: 'vacancy',
            element: nextDefectElement,
            count: nextDefectCount,
          }
        : undefined,
    };
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 历史消息区 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-white">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[16px] p-3 text-xs text-red-600">
            ⚠️ {error}
          </div>
        )}
        <div className="bg-gray-50 border border-gray-200 rounded-[24px] p-6">
          <p className="text-sm text-gray-600">
            你好！我是您的 AI 建模助手。您可以尝试输入：
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {[
              '“帮我搭一个 Cu(111) 表面，4 层，3×3 超胞”',
              '“在表面放一个 CO2 分子”',
              '“把其中一个 Cu 换成 Zn”',
            ].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setInput(t.replace(/^[“”]+|[“”]+$/g, ''))}
                className="text-left text-xs text-[#2E4A8E] hover:text-[#0A1128] bg-white border border-gray-100 rounded-[16px] px-3 py-2 transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {currentIntent && (
          <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Ready to Build</h3>
            <div className="rounded-[20px] border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-medium text-[#0A1128] leading-relaxed">
                {buildEditablePromptFromIntent(currentIntent) || '当前建模意图已解析完成，可以直接生成结构。'}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button 
                onClick={async () => {
                  const nextIntent: ModelingIntent = {
                    ...currentIntent,
                    provider_preferences: normalizedProviders.length
                      ? normalizedProviders
                      : currentIntent.provider_preferences,
                  };
                  onIntentChange(nextIntent);
                  const success = await buildModel(nextIntent, normalizedProviders);
                  if (success) {
                    console.log('Model built successfully');
                  }
                }}
                disabled={isBuilding}
                className="flex-1 px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isBuilding ? '生成中...' : '确认生成'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const editablePrompt = buildEditablePromptFromIntent(currentIntent);
                  if (editablePrompt) {
                    setInput(editablePrompt);
                  }
                }}
                className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium"
              >
                进入修改
              </button>
            </div>
          </div>
        )}

        {currentIntent && supportsStructuredEdit ? (
          <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Structured Edit</h3>
                <p className="mt-2 text-sm text-gray-600">
                  这组编辑会直接更新当前参数并重新生成结构，不再重复让模型猜参数。
                </p>
              </div>
              <span className="rounded-[16px] px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-cyan-50 text-cyan-700 border border-cyan-200">
                Deterministic
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={editMaterial}
                onChange={(event) => setEditMaterial(event.target.value)}
                placeholder="Material"
                className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-300 focus:bg-white"
              />
              <input
                value={editSurface}
                onChange={(event) => setEditSurface(event.target.value)}
                placeholder="Surface e.g. (111)"
                className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-300 focus:bg-white"
              />
              <input
                value={editVacuum}
                onChange={(event) => setEditVacuum(event.target.value)}
                placeholder="Vacuum (A)"
                className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-300 focus:bg-white"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={editSupercellX}
                  onChange={(event) => setEditSupercellX(event.target.value)}
                  placeholder="a"
                  className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-300 focus:bg-white"
                />
                <input
                  value={editSupercellY}
                  onChange={(event) => setEditSupercellY(event.target.value)}
                  placeholder="b"
                  className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-300 focus:bg-white"
                />
                <input
                  value={editSupercellZ}
                  onChange={(event) => setEditSupercellZ(event.target.value)}
                  placeholder="c"
                  className="w-full rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-300 focus:bg-white"
                />
              </div>
            </div>

            {currentIntent.task_type === 'slab' ? (
              <div className="mt-4 rounded-[20px] border border-cyan-100 bg-cyan-50/60 p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-700">Adsorbate Patch</p>
                  <p className="mt-1 text-xs text-cyan-800">
                    第一版结构化编辑先支持一个主吸附体模板。清空 formula 即表示移除当前 adsorbate。
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input
                    value={editAdsorbateFormula}
                    onChange={(event) => setEditAdsorbateFormula(event.target.value)}
                    placeholder="CO2 / CO / H2O"
                    className="w-full rounded-[16px] border border-cyan-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-cyan-300"
                  />
                  <select
                    value={editAdsorbateSite}
                    onChange={(event) => setEditAdsorbateSite(event.target.value)}
                    className="w-full rounded-[16px] border border-cyan-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-cyan-300"
                  >
                    <option value="top">top</option>
                    <option value="bridge">bridge</option>
                    <option value="hollow">hollow</option>
                  </select>
                  <input
                    value={editAdsorbateCount}
                    onChange={(event) => setEditAdsorbateCount(event.target.value)}
                    placeholder="Count"
                    className="w-full rounded-[16px] border border-cyan-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-cyan-300"
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-[20px] border border-amber-100 bg-amber-50/60 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Substitutional Doping</p>
                <p className="mt-1 text-xs text-amber-800">
                  第一版先支持 host 元素被 dopant 元素替代。清空 host 或 dopant 即表示移除当前 doping patch。
                </p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <input
                  value={editDopingHost}
                  onChange={(event) => setEditDopingHost(event.target.value)}
                  placeholder="Host element e.g. Cu"
                  className="w-full rounded-[16px] border border-amber-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-amber-300"
                />
                <input
                  value={editDopingDopant}
                  onChange={(event) => setEditDopingDopant(event.target.value)}
                  placeholder="Dopant e.g. Zn"
                  className="w-full rounded-[16px] border border-amber-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-amber-300"
                />
                <input
                  value={editDopingCount}
                  onChange={(event) => setEditDopingCount(event.target.value)}
                  placeholder="Count"
                  className="w-full rounded-[16px] border border-amber-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-amber-300"
                />
              </div>
            </div>

            <div className="mt-4 rounded-[20px] border border-rose-100 bg-rose-50/60 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Vacancy Defect</p>
                <p className="mt-1 text-xs text-rose-800">
                  第一版 defect 先支持 vacancy。填 element 表示删除该元素的若干位点；清空 element 即表示移除 defect patch。
                </p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  value={editDefectElement}
                  onChange={(event) => setEditDefectElement(event.target.value)}
                  placeholder="Element to remove e.g. O"
                  className="w-full rounded-[16px] border border-rose-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-rose-300"
                />
                <input
                  value={editDefectCount}
                  onChange={(event) => setEditDefectCount(event.target.value)}
                  placeholder="Count"
                  className="w-full rounded-[16px] border border-rose-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-rose-300"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!currentIntent) {
                    return;
                  }
                  const nextIntent = buildStructuredEditIntent(currentIntent);
                  onIntentChange(nextIntent);
                  const prompt = buildEditablePromptFromIntent(nextIntent) || 'Apply structured modeling edit';

                  if (runtimeSession?.sessionId) {
                    await replanModel(prompt, nextIntent, normalizedProviders);
                    return;
                  }

                  await buildModel(nextIntent, normalizedProviders);
                }}
                disabled={isBuilding}
                className="px-4 py-3 bg-[#173B7A] text-white rounded-[32px] hover:bg-[#224A91] transition-colors shadow-sm font-medium text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
              >
                应用结构化编辑并生成
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentIntent) {
                    return;
                  }
                  setEditMaterial(currentIntent.substrate?.material || '');
                  setEditSurface(currentIntent.substrate?.surface || '');
                  setEditVacuum(
                    currentIntent.substrate?.vacuum != null
                      ? String(currentIntent.substrate.vacuum)
                      : '',
                  );
                  setEditSupercellX(String(currentIntent.substrate?.supercell?.[0] || 1));
                  setEditSupercellY(String(currentIntent.substrate?.supercell?.[1] || 1));
                  setEditSupercellZ(String(currentIntent.substrate?.supercell?.[2] || 1));
                  setEditAdsorbateFormula(currentIntent.adsorbates?.[0]?.formula || '');
                  setEditAdsorbateSite(currentIntent.adsorbates?.[0]?.initial_site || 'top');
                  setEditAdsorbateCount(String(currentIntent.adsorbates?.[0]?.count || 1));
                  setEditDopingHost(currentIntent.doping?.host_element || '');
                  setEditDopingDopant(currentIntent.doping?.dopant_element || '');
                  setEditDopingCount(String(currentIntent.doping?.count || 1));
                  setEditDefectElement(currentIntent.defect?.element || '');
                  setEditDefectCount(String(currentIntent.defect?.count || 1));
                }}
                disabled={isBuilding}
                className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                重置为当前 Intent
              </button>
            </div>
          </div>
        ) : null}

        {latestBuildMeta && (
          <div className="bg-white border border-gray-100 rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Latest Build</h3>
              {latestBuildMeta.databaseSourceLabel || latestBuildMeta.databaseSource ? (
                <span className="rounded-[16px] px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-gray-50 border border-gray-200 text-gray-600">
                  {latestBuildMeta.databaseSourceLabel || latestBuildMeta.databaseSource}
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-700">
              <div>
                <div className="text-gray-400 uppercase tracking-widest text-[9px]">Source</div>
                <div className="mt-1 font-semibold">{latestBuildMeta.databaseSourceLabel || latestBuildMeta.databaseSource || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-gray-400 uppercase tracking-widest text-[9px]">Atoms</div>
                <div className="mt-1 font-semibold">{latestBuildMeta.totalAtoms ?? '--'}</div>
              </div>
              <div>
                <div className="text-gray-400 uppercase tracking-widest text-[9px]">Formula</div>
                <div className="mt-1 font-semibold">{latestBuildMeta.formula || '--'}</div>
              </div>
              <div>
                <div className="text-gray-400 uppercase tracking-widest text-[9px]">System</div>
                <div className="mt-1 font-semibold">{latestBuildMeta.system || '--'}</div>
              </div>
            </div>

            {latestBuildMeta.hkl?.length ? (
              <div className="mt-4 text-xs text-gray-600">
                HKL: <span className="font-mono">{latestBuildMeta.hkl.join(', ')}</span>
              </div>
            ) : null}

            <div className="mt-4 space-y-2 text-xs text-gray-600">
              {latestBuildMeta.adsorbates?.length ? (
                <div>
                  Adsorbates:{' '}
                  <span className="font-mono">
                    {latestBuildMeta.adsorbates
                      .map((item) => {
                        const countPrefix = item.count && item.count > 1 ? `${item.count}x` : '';
                        const placedPart = item.placedCount != null ? ` (placed ${item.placedCount})` : '';
                        return `${countPrefix}${item.formula}${item.initialSite ? `@${item.initialSite}` : ''}${placedPart}`;
                      })
                      .join(' | ')}
                  </span>
                </div>
              ) : null}
              {latestBuildMeta.doping?.dopantElement && latestBuildMeta.doping?.hostElement ? (
                <div>
                  Doping:{' '}
                  <span className="font-mono">
                    {latestBuildMeta.doping.hostElement}
                    {'->'}
                    {latestBuildMeta.doping.dopantElement}
                    {latestBuildMeta.doping.replacedCount != null
                      ? ` (${latestBuildMeta.doping.replacedCount}/${latestBuildMeta.doping.requestedCount || latestBuildMeta.doping.replacedCount})`
                      : ''}
                  </span>
                </div>
              ) : null}
              {latestBuildMeta.defect?.type === 'vacancy' && latestBuildMeta.defect?.element ? (
                <div>
                  Defect:{' '}
                  <span className="font-mono">
                    vacancy:{latestBuildMeta.defect.element}
                    {latestBuildMeta.defect.removedCount != null
                      ? ` (${latestBuildMeta.defect.removedCount}/${latestBuildMeta.defect.requestedCount || latestBuildMeta.defect.removedCount})`
                      : ''}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="px-6 py-4 border-t border-gray-100 bg-white">
        {isBuilding && !currentIntent && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-[16px]">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#0A1128] rounded-full animate-spin"></div>
            <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">AI is parsing your request...</p>
          </div>
        )}
        <div className="relative">
          <textarea
            value={input}
            disabled={isBuilding}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="描述您想构建的体系..."
            className="w-full p-3 text-xs border border-gray-100 rounded-[24px] font-mono focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600 disabled:bg-gray-50 disabled:text-gray-400"
            rows={5}
          />
          <button 
            onClick={handleSend}
            type="button"
            aria-label="发送"
            className="absolute bottom-3 right-3 px-3 py-2 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200"
            disabled={isBuilding || !input.trim()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-[10px] text-gray-400 text-center">
          Shift + Enter 换行 | Enter 发送
        </p>
      </div>
    </div>
  );
};

export default ChatPanel;
