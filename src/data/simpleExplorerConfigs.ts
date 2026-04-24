import type { ExplorerQuickFormula } from './explorerTypes';

export interface SimpleExplorerConfig {
  id: string;
  title: string;
  searchPlaceholder: string;
  popularFormulas: ExplorerQuickFormula[];
  emptyTitle: string;
  emptyDescription: string;
  ctaFormula: string;
  modelingPromptPrefix: string;
}

export const SIMPLE_EXPLORER_CONFIGS: Record<string, SimpleExplorerConfig> = {
  battery: {
    id: 'battery',
    title: 'Battery Materials Explorer',
    searchPlaceholder: 'Enter a chemical formula (e.g. LiFePO4, NaCoO2, Li3PS4)...',
    popularFormulas: [
      { formula: 'LiFePO4', label: 'LFP cathode' },
      { formula: 'LiCoO2', label: 'LCO cathode' },
      { formula: 'NaCoO2', label: 'Na cathode' },
      { formula: 'LiMn2O4', label: 'Spinel cathode' },
      { formula: 'Li3PS4', label: 'Sulfide SE' },
      { formula: 'Li7La3Zr2O12', label: 'Garnet SE' },
      { formula: 'LiTiO2', label: 'Anode' },
      { formula: 'Na3V2(PO4)3', label: 'NASICON' },
    ],
    emptyTitle: 'Search Battery Materials',
    emptyDescription:
      'Search across connected structure sources for cathodes, anodes, and solid electrolytes. Find crystal structures, formation energies, band gaps, and stability data.',
    ctaFormula: 'LiFePO4',
    modelingPromptPrefix: 'Build a bulk model for',
  },
  nuclear: {
    id: 'nuclear',
    title: 'Nuclear Materials Explorer',
    searchPlaceholder: 'Enter a chemical formula (e.g. UO2, U3Si2, UN, SiC)...',
    popularFormulas: [
      { formula: 'UO2', label: 'oxide fuel' },
      { formula: 'U3Si2', label: 'ATF candidate' },
      { formula: 'UN', label: 'nitride fuel' },
      { formula: 'ThO2', label: 'thorium oxide' },
      { formula: 'ZrO2', label: 'cladding oxide' },
      { formula: 'SiC', label: 'ATF cladding' },
      { formula: 'B4C', label: 'control material' },
      { formula: 'Li2TiO3', label: 'tritium breeder' },
    ],
    emptyTitle: 'Search Nuclear Materials',
    emptyDescription:
      'Search connected structure sources for fuels, cladding candidates, ceramics, and breeder materials. Use the results as quick starter structures for modeling.',
    ctaFormula: 'UO2',
    modelingPromptPrefix: 'Build a nuclear materials starter model for',
  },
  supercapacitor: {
    id: 'supercapacitor',
    title: 'Supercapacitor Materials Explorer',
    searchPlaceholder: 'Enter a chemical formula (e.g. MnO2, RuO2, NiCo2O4, Ti3C2)...',
    popularFormulas: [
      { formula: 'MnO2', label: 'pseudocapacitive oxide' },
      { formula: 'RuO2', label: 'benchmark oxide' },
      { formula: 'NiCo2O4', label: 'mixed oxide' },
      { formula: 'Ti3C2', label: 'MXene phase' },
      { formula: 'V2O5', label: 'layered oxide' },
      { formula: 'MoS2', label: '2D sulfide' },
      { formula: 'Fe3O4', label: 'spinel oxide' },
      { formula: 'Co3O4', label: 'oxide electrode' },
    ],
    emptyTitle: 'Search Supercapacitor Materials',
    emptyDescription:
      'Search connected structure sources for oxide, sulfide, carbide, and nitride electrode candidates used in EDLC and pseudocapacitive systems.',
    ctaFormula: 'MnO2',
    modelingPromptPrefix: 'Build a supercapacitor materials starter model for',
  },
  'hydrogen-storage': {
    id: 'hydrogen-storage',
    title: 'Hydrogen Storage Materials Explorer',
    searchPlaceholder: 'Enter a chemical formula (e.g. MgH2, NaAlH4, LaNi5, TiFe)...',
    popularFormulas: [
      { formula: 'MgH2', label: 'metal hydride' },
      { formula: 'NaAlH4', label: 'alanate' },
      { formula: 'LaNi5', label: 'AB5 alloy' },
      { formula: 'TiFe', label: 'reversible alloy' },
      { formula: 'LiBH4', label: 'borohydride' },
      { formula: 'AlH3', label: 'alane' },
      { formula: 'Mg2Ni', label: 'hydride precursor' },
      { formula: 'Pd', label: 'host metal' },
    ],
    emptyTitle: 'Search Hydrogen Storage Materials',
    emptyDescription:
      'Search connected structure sources for hydrides, host alloys, and adsorbent candidates. Use the results as quick structural starting points for storage studies.',
    ctaFormula: 'MgH2',
    modelingPromptPrefix: 'Build a hydrogen storage materials starter model for',
  },
  'thermal-storage': {
    id: 'thermal-storage',
    title: 'Thermal Storage Materials Explorer',
    searchPlaceholder: 'Enter a chemical formula (e.g. NaNO3, KNO3, NaCl, Li2CO3)...',
    popularFormulas: [
      { formula: 'NaNO3', label: 'solar salt' },
      { formula: 'KNO3', label: 'solar salt' },
      { formula: 'NaCl', label: 'molten salt' },
      { formula: 'Li2CO3', label: 'carbonate salt' },
      { formula: 'MgCl2', label: 'chloride salt' },
      { formula: 'Al2O3', label: 'ceramic storage' },
      { formula: 'SiO2', label: 'silica matrix' },
      { formula: 'NaF', label: 'fluoride salt' },
    ],
    emptyTitle: 'Search Thermal Storage Materials',
    emptyDescription:
      'Search connected structure sources for molten salts, ceramics, and phase-change material candidates. Use the results as a clean starting point before deeper property work.',
    ctaFormula: 'NaNO3',
    modelingPromptPrefix: 'Build a thermal storage materials starter model for',
  },
  'flow-battery': {
    id: 'flow-battery',
    title: 'Flow Battery Materials Explorer',
    searchPlaceholder: 'Enter a chemical formula (e.g. VO2, V2O5, Fe2O3, TiO2)...',
    popularFormulas: [
      { formula: 'VO2', label: 'vanadium family' },
      { formula: 'V2O5', label: 'vanadium oxide' },
      { formula: 'Fe2O3', label: 'iron family' },
      { formula: 'TiO2', label: 'support oxide' },
      { formula: 'MnO2', label: 'manganese chemistry' },
      { formula: 'NaCl', label: 'supporting salt' },
      { formula: 'Zn', label: 'hybrid anode' },
      { formula: 'Br2', label: 'bromine chemistry' },
    ],
    emptyTitle: 'Search Flow Battery Materials',
    emptyDescription:
      'Search connected structure sources for inorganic hosts, catalysts, and supporting materials around flow-battery chemistry, then hand promising structures into modeling.',
    ctaFormula: 'VO2',
    modelingPromptPrefix: 'Build a flow battery materials starter model for',
  },
};
