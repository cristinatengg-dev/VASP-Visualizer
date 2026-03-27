'use strict';

// ─── 8-shot storyboard: Battery Materials SCI Visualizer concept promo ───────
//
// Each prompt is optimized for Seedance 2.0 text-to-video generation.
// Style: cinematic concept film, deep space / microscopic aesthetic,
//        battery cathode materials focus (NMC, LFP, lithium-ion transport).

const PROMO_SHOTS = [
  {
    id: 'shot-1-opening',
    label: 'Opening — Crystal Lattice',
    agent: null,
    duration: 8,
    prompt: `In deep obsidian outer space, a massive complex crystal lattice network emerges — interwoven layered NMC nickel-manganese-cobalt cathode and olivine LFP lithium-iron-phosphate structures. Camera slowly orbits the lattice. Glowing blue lithium-ion particles stream continuously along specific ion channels within the lattice planes, converging into sharp geometric facets. The lattice pulses with soft blue-white energy. Cinematic lighting, shallow depth of field, ultra high definition, scientific visualization aesthetic.`,
  },
  {
    id: 'shot-2-idea-agent',
    label: 'Idea Agent — Data Cascade',
    agent: 'Idea Agent',
    duration: 8,
    prompt: `In a dark void, hundreds of translucent battery test data cards cascade downward like a waterfall. Each card clearly displays cyclic voltammetry curves, charge-discharge profiles, and X-ray diffraction patterns. The cards spiral inward and compress, condensing into a rotating multi-layered sphere composed of candidate material particles — NMC, LFP, and NCA cathode grains in distinct colors. As the cards dissolve into golden sparks, warm golden light radiates outward from the sphere. Smooth camera push-in, scientific data visualization aesthetic, dark background.`,
  },
  {
    id: 'shot-3-modeling-agent',
    label: 'Modeling Agent — Atomic Assembly',
    agent: 'Modeling Agent',
    duration: 8,
    prompt: `On a pure black background, individual color-coded atoms materialize one by one from thin air — lithium in bright blue, nickel in green, cobalt in deep blue, manganese in purple. They drift with precise trajectories into exact crystallographic positions, snapping into a perfect NMC-811 layered unit cell. Glowing bonds flash between atoms as the structure completes. Lithium atoms arrange precisely in the interlayer spaces. Macro lens perspective, hyper-clean scientific render, subtle ambient occlusion lighting.`,
  },
  {
    id: 'shot-4-compute-agent',
    label: 'Compute Agent — DFT Simulation',
    agent: 'Compute Agent',
    duration: 8,
    prompt: `Rivers of cyan data streams flow through a futuristic server corridor with dark monolithic computing nodes. On the node surfaces, molecular dynamics simulation results and density functional theory calculation data are displayed as glowing holographic projections. Energy pulses travel along fiber-optic pathways between nodes. A central core ignites, releasing concentric blue shockwaves that transform into a lithium-ion diffusion pathway heatmap showing ion transport through an SEI layer. Dramatic perspective, volumetric fog, deep blue and cyan color palette.`,
  },
  {
    id: 'shot-5-rendering-viz',
    label: 'Rendering Agent — Material Transition',
    agent: 'Rendering Agent',
    duration: 8,
    prompt: `A complex crystal structure composed of layered NMC cathode particles rotates slowly against a pure black background. Frame by frame, its material transitions smoothly: wireframe mesh to matte white ceramic to metallic chrome to transparent glass. Through the transparent phase, lithium-ion intercalation and deintercalation pathways are clearly visible as glowing blue trails. Smooth continuous rotation, professional studio lighting, scientific visualization quality, no text or labels.`,
  },
  {
    id: 'shot-6-rendering-trajectory',
    label: 'Rendering Agent — Ion Migration',
    agent: 'Rendering Agent',
    duration: 8,
    prompt: `Inside a battery cathode crystal lattice at the atomic scale. Atoms vibrate with thermal motion. The camera flies through layers of oscillating lithium ions migrating between cathode planes and across grain boundaries, finally passing through a complex solid-electrolyte interphase SEI layer. Electric blue motion trails follow each ion path, creating flowing luminescent ribbons. Time-lapse microscopic feel, warm-to-cool color gradient from amber to ice blue, molecular dynamics trajectory aesthetic.`,
  },
  {
    id: 'shot-7-illustration-agent',
    label: 'Illustration Agent — SEI Publication Art',
    agent: 'Illustration Agent',
    duration: 8,
    prompt: `A blank white canvas fills the frame. Deep blue and gold watercolor-like brushstrokes bleed across the surface, gradually forming a photorealistic microscopic battery interface structure — a solid-electrolyte interphase SEI layer on a lithium metal anode surface, with clearly visible crystalline components of Li2CO3 and LiF grains. The image transitions from abstract artistic strokes to a publication-quality scientific illustration. Elegant painterly-to-photorealistic morphing, warm lighting, journal cover aesthetic.`,
  },
  {
    id: 'shot-8-finale',
    label: 'Finale — Logo Convergence',
    agent: null,
    duration: 8,
    prompt: `All previous visual elements — layered cathode lattices, migrating blue lithium ions, data cascade cards, SEI layer illustration fragments — spiral inward from the edges of the frame, converging into a single luminous point at center. The point expands into a minimal geometric logo mark inspired by battery crystal structure — a hexagonal cathode symbol surrounded by orbiting lithium ion particles. Deep navy space background. Orbiting particles settle into a calm luminescent halo. Cinematic slow motion, fade to black at end.`,
  },
];

module.exports = { PROMO_SHOTS };
