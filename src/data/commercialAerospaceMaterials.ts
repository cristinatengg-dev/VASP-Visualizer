export type AerospaceMaterialFamily =
  | 'Lightweight Structures'
  | 'High-Temperature Alloys'
  | 'Propulsion & Heat Transfer'
  | 'Thermal Protection'
  | 'Ceramics & Coatings'
  | 'Lubricants & Polymers'
  | 'Optomechanics & Thermal Control'
  | 'Electronic Packaging';

export type AerospaceMission =
  | 'Launch Vehicles'
  | 'Satellite Platforms'
  | 'Liquid Rocket Engines'
  | 'Reentry Vehicles'
  | 'Deep Space Exploration'
  | 'LEO Constellations';

export type AerospaceEvidence = 'In-Service / Legacy' | 'Engineering Maturity' | 'Experimental Validation' | 'R&D Candidate';

export interface CommercialAerospaceMaterial {
  id: string;
  name: string;
  designation: string;
  composition: string;
  searchFormula?: string;
  family: AerospaceMaterialFamily;
  missions: AerospaceMission[];
  applications: string[];
  maxServiceTempC: number;
  density: string;
  evidence: AerospaceEvidence;
  trl: number;
  advantages: string[];
  watchouts: string[];
  qualification: string[];
  sourceLabel: string;
  sourceUrl: string;
}

export interface AerospaceOfficialSource {
  id: string;
  name: string;
  organization: string;
  access: 'Public' | 'Register / Apply' | 'Standard / License';
  coverage: string;
  url: string;
}

const NASA_MAPTIS = 'https://maptis.nasa.gov/Features';
const NASA_OUTGASSING = 'https://outgassing.nasa.gov/';
const NASA_TPS = 'https://www.nasa.gov/thermal-protection-materials-branch/';
const NASA_UHTC = 'https://ntrs.nasa.gov/citations/20150022996';
const NASA_NTRS = 'https://ntrs.nasa.gov/';

export const AEROSPACE_MISSIONS: AerospaceMission[] = [
  'Launch Vehicles',
  'Satellite Platforms',
  'Liquid Rocket Engines',
  'Reentry Vehicles',
  'Deep Space Exploration',
  'LEO Constellations',
];

export const AEROSPACE_FAMILIES: AerospaceMaterialFamily[] = [
  'Lightweight Structures',
  'High-Temperature Alloys',
  'Propulsion & Heat Transfer',
  'Thermal Protection',
  'Ceramics & Coatings',
  'Lubricants & Polymers',
  'Optomechanics & Thermal Control',
  'Electronic Packaging',
];

export const COMMERCIAL_AEROSPACE_MATERIALS: CommercialAerospaceMaterial[] = [
  {
    id: 'al-2219-t851', name: '2219 Aluminum Alloy', designation: 'Al 2219-T851', composition: 'Al-Cu System', searchFormula: 'Al', family: 'Lightweight Structures',
    missions: ['Launch Vehicles', 'Liquid Rocket Engines'], applications: ['Cryogenic Tanks', 'Welded Shells', 'Propellant Tanks'], maxServiceTempC: 175, density: '2.84 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Mature Welding System', 'Cryogenic Toughness', 'Heat-Treatable'], watchouts: ['Weld seam and HAZ require separate property sampling', 'Corrosion & Stress Corrosion Evaluation'], qualification: ['Cryogenic Tensile Test', 'Fracture Toughness', 'Welding Procedure Qualification'], sourceLabel: 'NASA MAPTIS / MMPDS Path', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'al-li-2195', name: '2195 Al-Li Alloy', designation: 'Al-Li 2195', composition: 'Al-Cu-Li-Mg-Ag-Zr', searchFormula: 'Al', family: 'Lightweight Structures',
    missions: ['Launch Vehicles'], applications: ['Cryogenic Tanks', 'Large-Diameter Cylindrical Sections'], maxServiceTempC: 150, density: '2.71 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['High Specific Strength', 'Low Density', 'Cryogenic Structural Legacy'], watchouts: ['Anisotropy', 'Weld Window & Defect Sensitivity'], qualification: ['Cryogenic Fatigue', 'Welded Joints', 'Fracture Control'], sourceLabel: 'NASA Materials / MAPTIS', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'al-7075-t73', name: '7075 Aluminum Alloy', designation: 'Al 7075-T73', composition: 'Al-Zn-Mg-Cu', searchFormula: 'Al', family: 'Lightweight Structures',
    missions: ['Launch Vehicles', 'Satellite Platforms', 'LEO Constellations'], applications: ['Load-Bearing Frame', 'Bracket', 'Spacecraft-rocket adapter'], maxServiceTempC: 120, density: '2.81 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['High specific strength', 'Mature supply chain', 'Easy to machine'], watchouts: ['Stress corrosion', 'Unsuitable for high-temperature primary load-bearing'], qualification: ['SCC', 'Fatigue', 'Surface treatment compatibility'], sourceLabel: 'NASA MAPTIS / MMPDS Path', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'ti-6al-4v', name: 'Ti-6Al-4V titanium alloy', designation: 'Ti-6Al-4V / Grade 5', composition: 'Ti-6Al-4V', searchFormula: 'Ti', family: 'Lightweight Structures',
    missions: ['Launch Vehicles', 'Satellite Platforms', 'Liquid Rocket Engines', 'Deep Space Exploration'], applications: ['Pressure vessel interface', 'Fasteners', 'Engine mount', 'AM components'], maxServiceTempC: 350, density: '4.43 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['High specific strength', 'Corrosion resistance', 'High additive manufacturing maturity'], watchouts: ['Oxygen and hydrogen embrittlement', 'Friction galling', 'High-temperature strength degradation'], qualification: ['Hydrogen compatibility', 'AM defect / NDE', 'Fatigue'], sourceLabel: 'NASA MAPTIS / NTRS', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'ti-6242', name: 'Near-alpha high-temperature titanium alloy', designation: 'Ti-6Al-2Sn-4Zr-2Mo', composition: 'Ti-6Al-2Sn-4Zr-2Mo', searchFormula: 'Ti', family: 'High-Temperature Alloys',
    missions: ['Launch Vehicles', 'Liquid Rocket Engines'], applications: ['Compressor components', 'Intermediate-temperature load-bearing parts'], maxServiceTempC: 500, density: '4.54 g/cm³', evidence: 'Engineering Maturity', trl: 8,
    advantages: ['Intermediate-temperature creep performance', 'Lighter than nickel-base alloys'], watchouts: ['Long-term high-temperature oxidation', 'Sensitive to forged microstructure'], qualification: ['Creep', 'Rupture strength', 'Microstructure'], sourceLabel: 'NASA aerospace materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'inconel-718', name: 'Inconel 718', designation: 'UNS N07718', composition: 'Ni-Cr-Fe-Nb-Mo', searchFormula: 'Ni', family: 'High-Temperature Alloys',
    missions: ['Launch Vehicles', 'Liquid Rocket Engines'], applications: ['Turbopump', 'Flange', 'Combustion chamber structure', 'Fasteners'], maxServiceTempC: 700, density: '8.19 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['High-temperature strength', 'Good weldability', 'Mature design data'], watchouts: ['High density', 'Laves/δ phase and heat treatment window', 'Requires validation in hydrogen environment'], qualification: ['Low-cycle fatigue', 'Creep', 'Heat treatment batch'], sourceLabel: 'NASA MAPTIS / MMPDS Path', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'inconel-625', name: 'Inconel 625', designation: 'UNS N06625', composition: 'Ni-Cr-Mo-Nb', searchFormula: 'Ni', family: 'High-Temperature Alloys',
    missions: ['Liquid Rocket Engines', 'Satellite Platforms'], applications: ['Bellows', 'Propulsion piping', 'Nozzles and welded components'], maxServiceTempC: 650, density: '8.44 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Corrosion resistance', 'Weld-friendly', 'Solid-solution strengthening'], watchouts: ['Long-term microstructural stability at high temperatures', 'Higher quality cost'], qualification: ['Propellant compatibility', 'Weld fatigue', 'Leakage'], sourceLabel: 'NASA materials database path', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'haynes-230', name: 'HAYNES 230', designation: 'UNS N06230', composition: 'Ni-Cr-W-Mo', searchFormula: 'Ni', family: 'High-Temperature Alloys',
    missions: ['Liquid Rocket Engines', 'Reentry Vehicles'], applications: ['High-temperature liner', 'Nozzle accessories', 'Thermal structure'], maxServiceTempC: 1150, density: '8.97 g/cm³', evidence: 'Engineering Maturity', trl: 8,
    advantages: ['High-temperature oxidation resistance', 'Creep strength', 'Thermal cycling capability'], watchouts: ['Density and cost', 'Work hardening'], qualification: ['Thermal cycling', 'High-temperature oxidation', 'Creep'], sourceLabel: 'NASA MAPTIS / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'nasa-hr1', name: 'NASA HR-1', designation: 'Fe-Ni-Cr HR-1', composition: 'Fe-Ni-Cr-based hydrogen-resistant alloy', searchFormula: 'Fe', family: 'Propulsion & Heat Transfer',
    missions: ['Liquid Rocket Engines'], applications: ['Liquid hydrogen combustion chamber', 'Regenerative cooling channel', 'Additive manufactured propulsion components'], maxServiceTempC: 700, density: 'Approx. 8.1 g/cm³', evidence: 'Experimental Validation', trl: 6,
    advantages: ['Designed for high-pressure hydrogen environments', 'AM-compatible', 'High strength-toughness balance'], watchouts: ['Limited public design allowables', 'Strong coupling between AM process and heat treatment'], qualification: ['High-pressure hydrogen embrittlement', 'AM process qualification', 'Thermal-cryogenic cycling'], sourceLabel: 'NASA NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'grcop-42', name: 'GRCop-42 copper alloy', designation: 'Cu-4Cr-2Nb', composition: 'Cu-4Cr-2Nb', searchFormula: 'Cu', family: 'Propulsion & Heat Transfer',
    missions: ['Liquid Rocket Engines'], applications: ['Combustion chamber liner', 'Injector', 'High-heat-flux heat exchanger wall'], maxServiceTempC: 700, density: 'Approx. 8.8 g/cm³', evidence: 'Engineering Maturity', trl: 7,
    advantages: ['High thermal conductivity', 'High-temperature strength superior to pure copper', 'Compatible with laser powder bed fusion'], watchouts: ['Oxygen and powder quality control', 'Heat treatment and anisotropy'], qualification: ['Heat flux cycling', 'AM porosity / NDE', 'Brazing / jacket interface'], sourceLabel: 'NASA additive manufacturing / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'c103', name: 'C-103 niobium alloy', designation: 'Nb-10Hf-1Ti', composition: 'Nb-10Hf-1Ti', searchFormula: 'Nb', family: 'Propulsion & Heat Transfer',
    missions: ['Liquid Rocket Engines', 'Deep Space Exploration'], applications: ['Attitude and orbit control nozzle', 'Radiation-cooled nozzle', 'High-temperature thin-walled parts'], maxServiceTempC: 1370, density: '8.89 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Vacuum high-temperature strength', 'Thin-wall forming'], watchouts: ['Rapid oxidation in air', 'Requires reliable anti-oxidation coating'], qualification: ['Coating integrity', 'Vacuum thermal cycling', 'Firing life'], sourceLabel: 'NASA propulsion materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'cfrp-cyanate', name: 'Cyanate ester-based CFRP', designation: 'High-modulus CFRP / cyanate ester', composition: 'Carbon fiber / cyanate ester resin', family: 'Lightweight Structures',
    missions: ['Satellite Platforms', 'Deep Space Exploration', 'LEO Constellations'], applications: ['Primary load-bearing cylinder', 'Truss', 'Antenna backing structure', 'Optomechanical support'], maxServiceTempC: 180, density: '1.5–1.7 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Extremely high specific stiffness', 'Tailored low thermal expansion', 'Low-moisture-absorption formulation available'], watchouts: ['Interlaminar damage', 'Atomic oxygen / radiation', 'Resin outgassing and microcracking'], qualification: ['ASTM E595 outgassing', 'Thermal vacuum cycling', 'Post-impact strength'], sourceLabel: 'NASA MAPTIS / Outgassing', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'sic-sic-cmc', name: 'SiC/SiC ceramic matrix composites', designation: 'SiC fiber / SiC matrix CMC', composition: 'SiC/SiC', searchFormula: 'SiC', family: 'Ceramics & Coatings',
    missions: ['Liquid Rocket Engines', 'Reentry Vehicles'], applications: ['Thermal structure', 'Nozzle extension', 'High-temperature load-bearing panel'], maxServiceTempC: 1400, density: 'Approx. 2.6 g/cm³', evidence: 'Experimental Validation', trl: 6,
    advantages: ['Low density and high-temperature resistance', 'Higher damage tolerance than monolithic ceramics'], watchouts: ['Environmental barrier coating', 'Joints and seals', 'High-temperature moisture degradation'], qualification: ['High-temperature oxidation', 'Thermal shock', 'Fasteners'], sourceLabel: 'NASA NTRS high-temperature materials', sourceUrl: NASA_NTRS,
  },
  {
    id: 'pica', name: 'PICA ablative material', designation: 'Phenolic Impregnated Carbon Ablator', composition: 'Phenolic-impregnated carbon felt', family: 'Thermal Protection',
    missions: ['Reentry Vehicles', 'Deep Space Exploration'], applications: ['Re-entry capsule heat shield', 'Planetary entry thermal protection'], maxServiceTempC: 2500, density: 'Low-density ablator', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['High-heat-flux ablative protection', 'Extensive flight heritage'], watchouts: ['Single-use ablation', 'Material response depends on heat flux, pressure, and atmosphere'], qualification: ['Arc-jet tunnel', 'Ablative response', 'Bonding and gaps'], sourceLabel: 'NASA Thermal Protection Materials', sourceUrl: NASA_TPS,
  },
  {
    id: 'tufroc', name: 'TUFROC reusable thermal protection', designation: 'Toughened Uni-piece Fibrous Reinforced Oxidation-Resistant Composite', composition: 'Fibrous insulation / oxidation-resistant surface layer', family: 'Thermal Protection',
    missions: ['Reentry Vehicles'], applications: ['Wing leading edge', 'Nose cone', 'Reusable thermal protection'], maxServiceTempC: 1700, density: 'Low-density composite TPS', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Reusable', 'Withstands high surface temperatures', 'Balances thermal insulation'], watchouts: ['Impact damage', 'Local repair and seam design'], qualification: ['Arc-jet tunnel', 'Repeated thermal cycling', 'Impact / rain erosion'], sourceLabel: 'NASA TPS testing and fabrication', sourceUrl: NASA_TPS,
  },
  {
    id: 'li900', name: 'LI-900 thermal insulation tile', designation: 'LI-900 silica tile', composition: 'High-Purity Porous SiO₂', searchFormula: 'SiO2', family: 'Thermal Protection',
    missions: ['Reentry Vehicles'], applications: ['Large-Area Reusable Thermal Insulation', 'Low-Load Thermal Protection Surface'], maxServiceTempC: 1260, density: 'Approx. 0.14 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Ultra-Low Thermal Conductivity and Density', 'Proven Flight Heritage'], watchouts: ['Fragile', 'Waterproof Coating and Impact Damage', 'Non-Primary-Load-Bearing'], qualification: ['Thermal cycling', 'Coating integrity', 'Acoustic Vibration/Impact'], sourceLabel: 'NASA Thermal Protection Systems', sourceUrl: NASA_TPS,
  },
  {
    id: 'rcc', name: 'Reinforced Carbon-Carbon', designation: 'Reinforced Carbon-Carbon', composition: 'C/C + SiC Anti-Oxidation Layer', searchFormula: 'C', family: 'Thermal Protection',
    missions: ['Reentry Vehicles'], applications: ['Wing leading edge', 'Nose Cap', 'Extreme Heat Flux Thermal Structure'], maxServiceTempC: 1650, density: 'Approx. 1.6 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['High-Temperature Load-Bearing', 'Low Thermal Expansion'], watchouts: ['Sensitive to Anti-Oxidation Coating Defects', 'High Impact and Inspection Costs'], qualification: ['Coating Oxidation', 'Nondestructive Testing', 'Post-Impact Thermal Cycling'], sourceLabel: 'NASA TPS references', sourceUrl: NASA_TPS,
  },
  {
    id: 'zrb2-sic', name: 'ZrB₂-SiC Ultra-High Temperature Ceramic', designation: 'ZrB2-SiC UHTC', composition: 'ZrB₂-SiC', searchFormula: 'ZrB2', family: 'Ceramics & Coatings',
    missions: ['Reentry Vehicles', 'Deep Space Exploration'], applications: ['Sharp Leading Edge', 'High-Enthalpy Heat Flux Component', 'Thermal Protection Coating'], maxServiceTempC: 2000, density: 'Approx. 5.5–6.0 g/cm³', evidence: 'R&D Candidate', trl: 4,
    advantages: ['Ultra-High Melting Point', 'High-Temperature Thermal Conductivity and Anti-Ablation Potential'], watchouts: ['Fracture Toughness', 'Oxide Layer Stability', 'Large-Scale Manufacturing'], qualification: ['Arc-jet tunnel', 'Oxidation Kinetics', 'Thermal Shock/Fracture'], sourceLabel: 'NASA UHTC overview', sourceUrl: NASA_UHTC,
  },
  {
    id: 'hfb2-sic', name: 'HfB₂-SiC Ultra-High Temperature Ceramic', designation: 'HfB2-SiC UHTC', composition: 'HfB₂-SiC', searchFormula: 'HfB2', family: 'Ceramics & Coatings',
    missions: ['Reentry Vehicles', 'Deep Space Exploration'], applications: ['Sharp Leading Edge', 'Ultra-High Temperature Nozzle', 'Anti-Ablation Component'], maxServiceTempC: 2200, density: 'Approx. 9–10 g/cm³', evidence: 'R&D Candidate', trl: 3,
    advantages: ['Extreme Temperature Potential', 'Excellent High-Temperature Stability'], watchouts: ['High Density and Cost', 'Brittleness', 'Difficult Machining and Joining'], qualification: ['High-Enthalpy Oxidation', 'Thermal shock', 'Joining Interface'], sourceLabel: 'NASA UHTC overview', sourceUrl: NASA_UHTC,
  },
  {
    id: 'ysz-tbc', name: 'YSZ Thermal Barrier Coating', designation: '7–8 wt% YSZ', composition: 'Y₂O₃-Stabilized ZrO₂', searchFormula: 'ZrO2', family: 'Ceramics & Coatings',
    missions: ['Liquid Rocket Engines', 'Reentry Vehicles'], applications: ['Thermal Barrier Coating', 'Metallic Thermal Structure Insulation Layer'], maxServiceTempC: 1200, density: 'Approx. 5.8–6.1 g/cm³', evidence: 'Engineering Maturity', trl: 8,
    advantages: ['Low Thermal Conductivity', 'Mature Thermal Spraying Process'], watchouts: ['Thermally Grown Oxide', 'Spallation', 'High-Temperature Phase Stability'], qualification: ['Thermal Cycle Life', 'Bonding Strength', 'Oxide Layer'], sourceLabel: 'NASA materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'mos2', name: 'Molybdenum Disulfide Solid Lubricant', designation: 'MoS2 coating', composition: 'MoS₂', searchFormula: 'MoS2', family: 'Lubricants & Polymers',
    missions: ['Satellite Platforms', 'Deep Space Exploration', 'LEO Constellations'], applications: ['Bearing/Gear Coating', 'Deployment Mechanism', 'Vacuum Tribological Pair'], maxServiceTempC: 400, density: '5.06 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Low Friction in Vacuum', 'Mature Space Mechanism Applications'], watchouts: ['Moist Air Storage Degradation', 'Atomic Oxygen and Film Thickness/Substrate Sensitivity'], qualification: ['Vacuum Tribological Life', 'Storage Environment', 'Particle Shedding'], sourceLabel: 'NASA MAPTIS / MISSE', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'ws2', name: 'Tungsten Disulfide Solid Lubricant', designation: 'WS2 coating', composition: 'WS₂', searchFormula: 'WS2', family: 'Lubricants & Polymers',
    missions: ['Satellite Platforms', 'Deep Space Exploration'], applications: ['High-Load Vacuum Coating', 'Release and Lock Mechanism'], maxServiceTempC: 450, density: '7.5 g/cm³', evidence: 'Engineering Maturity', trl: 8,
    advantages: ['Vacuum Tribological Performance', 'Wide Temperature Window'], watchouts: ['Coating Density and Adhesion', 'Ground Humidity Sensitivity'], qualification: ['Vacuum Life', 'Adhesion Strength', 'Thermal cycling'], sourceLabel: 'NASA materials references', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'hbn', name: 'Hexagonal Boron Nitride', designation: 'h-BN', composition: 'BN', searchFormula: 'BN', family: 'Lubricants & Polymers',
    missions: ['Satellite Platforms', 'Liquid Rocket Engines', 'Deep Space Exploration'], applications: ['Solid Lubrication', 'Electrically Insulating and Thermally Conductive Filler', 'High-Temperature Isolation'], maxServiceTempC: 900, density: '2.1 g/cm³', evidence: 'Engineering Maturity', trl: 7,
    advantages: ['Electrically Insulating and Thermally Conductive', 'Chemically Stable', 'Layered Lubrication'], watchouts: ['High Variation Across Polymorphs/Purity', 'Humid Environment and Interface Control'], qualification: ['Purity', 'Dielectric Strength', 'Thermal Vacuum'], sourceLabel: 'NASA / structure databases', sourceUrl: NASA_NTRS,
  },
  {
    id: 'peek', name: 'PEEK Engineering Plastic', designation: 'PEEK', composition: 'Polyether Ether Ketone', family: 'Lubricants & Polymers',
    missions: ['Satellite Platforms', 'LEO Constellations'], applications: ['Insulating Components', 'Light-Load Bracket', 'Cables and Bearing Cages'], maxServiceTempC: 250, density: '1.30 g/cm³', evidence: 'Engineering Maturity', trl: 8,
    advantages: ['Temperature and Chemical Resistance', 'Machinable / Injection Moldable', 'Reinforced Grades Available'], watchouts: ['Outgassing Depends on Grade and Treatment', 'Irradiation and Creep'], qualification: ['ASTM E595 outgassing', 'Irradiation', 'Long-Term Creep'], sourceLabel: 'NASA Outgassing Database', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'polyimide', name: 'Polyimide', designation: 'Kapton / Vespel family', composition: 'Aromatic Polyimide', family: 'Lubricants & Polymers',
    missions: ['Satellite Platforms', 'Deep Space Exploration', 'LEO Constellations'], applications: ['Flexible Circuits', 'Thermal Control Film', 'Insulating Gasket', 'Dry Friction Parts'], maxServiceTempC: 300, density: '1.42 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Wide Temperature Range', 'Electrical Insulation', 'Available in Diverse Film and Bulk Forms'], watchouts: ['Atomic Oxygen Erosion', 'Outgassing and Moisture Absorption Depend on Grade'], qualification: ['Outgassing', 'Atomic Oxygen', 'Thermal Cycling / Bending'], sourceLabel: 'NASA Outgassing / MISSE', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'aln', name: 'Aluminum Nitride', designation: 'AlN ceramic', composition: 'AlN', searchFormula: 'AlN', family: 'Electronic Packaging',
    missions: ['Satellite Platforms', 'Liquid Rocket Engines', 'LEO Constellations'], applications: ['Power Electronics Substrate', 'High Thermal Conductivity Electrically Insulating Packaging', 'Sensor Substrate'], maxServiceTempC: 800, density: '3.26 g/cm³', evidence: 'Engineering Maturity', trl: 8,
    advantages: ['High Thermal Conductivity and Electrical Insulation', 'Thermal Expansion Matched to Semiconductors'], watchouts: ['Hydrolysis Sensitive', 'Brittleness and Metallization Interface'], qualification: ['Dielectric', 'Thermal cycling', 'Packaging Hermeticity'], sourceLabel: 'NASA electronics materials / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'si3n4', name: 'Silicon Nitride Ceramics', designation: 'Si3N4', composition: 'Si₃N₄', searchFormula: 'Si3N4', family: 'Ceramics & Coatings',
    missions: ['Liquid Rocket Engines', 'Satellite Platforms'], applications: ['High-Temperature Bearings', 'Insulating Structural Components', 'Wear-Resistant Parts'], maxServiceTempC: 1000, density: '3.2 g/cm³', evidence: 'Engineering Maturity', trl: 8,
    advantages: ['High Fracture Toughness Ceramic', 'Wear Resistance', 'Low Thermal Expansion'], watchouts: ['Sintering Aid Impact', 'Brittle Failure and Inspection'], qualification: ['Rolling Contact Fatigue', 'Thermal shock', 'NDE'], sourceLabel: 'NASA materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'fused-silica', name: 'Fused Silica', designation: 'Fused silica', composition: 'SiO₂', searchFormula: 'SiO2', family: 'Optomechanics & Thermal Control',
    missions: ['Satellite Platforms', 'Deep Space Exploration', 'LEO Constellations'], applications: ['Window', 'Optical Substrate', 'Laser / Star Tracker Optical Path'], maxServiceTempC: 900, density: '2.20 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Ultra-Low Thermal Expansion', 'Broad Spectral Transmittance', 'High Thermal Stability'], watchouts: ['Radiation-Induced Color Centers', 'Surface / Subsurface Damage'], qualification: ['Irradiated Transmittance', 'Thermal Shock', 'Coating Adhesion'], sourceLabel: 'NASA optical materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'zerodur', name: 'Glass-Ceramic Optical Substrate', designation: 'ZERODUR class glass-ceramic', composition: 'Lithium Aluminosilicate Glass-Ceramic', family: 'Optomechanics & Thermal Control',
    missions: ['Satellite Platforms', 'Deep Space Exploration'], applications: ['High-Stability Mirror', 'Optical Platform', 'Precision Datum'], maxServiceTempC: 600, density: 'Approx. 2.53 g/cm³', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Near-zero CTE grades available', 'Long-term dimensional stability'], watchouts: ['Brittleness', 'Large-scale lightweight machining and support design'], qualification: ['Thermal stability', 'Acoustic vibration', 'Mirror blank defect'], sourceLabel: 'NASA optical systems references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'mli-kapton', name: 'Aluminized polyimide MLI', designation: 'Aluminized Kapton MLI', composition: 'Al/Polyimide multilayer film', family: 'Optomechanics & Thermal Control',
    missions: ['Satellite Platforms', 'Deep Space Exploration', 'LEO Constellations'], applications: ['Multilayer insulation', 'Thermal control wrapping', 'Propulsion line insulation'], maxServiceTempC: 200, density: 'System areal density calculation', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['High-vacuum thermal insulation efficiency', 'Flexible and lightweight'], watchouts: ['Compaction/layers/edge heat leakage', 'Atomic oxygen and electrostatic discharge'], qualification: ['Effective emissivity', 'Outgassing', 'Atomic oxygen/charging and discharging'], sourceLabel: 'NASA Outgassing / MISSE', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'beta-cloth', name: 'Beta Cloth', designation: 'PTFE-coated silica fabric', composition: 'PTFE-coated quartz fiber', family: 'Optomechanics & Thermal Control',
    missions: ['Satellite Platforms', 'LEO Constellations'], applications: ['Outer surface thermal control', 'MLI outer layer', 'Fireproof/atomic oxygen-resistant fabric'], maxServiceTempC: 290, density: 'Areal density by specification', evidence: 'In-Service / Legacy', trl: 9,
    advantages: ['Temperature-resistant and flame-retardant', 'Space outer surface flight heritage'], watchouts: ['Folding wear', 'Contamination and surface optical property changes'], qualification: ['Solar absorptance/emissivity', 'Atomic Oxygen', 'Thermal cycling'], sourceLabel: 'NASA MISSE / MAPTIS', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'gan', name: 'GaN wide-bandgap semiconductor', designation: 'GaN', composition: 'GaN', searchFormula: 'GaN', family: 'Electronic Packaging',
    missions: ['Satellite Platforms', 'LEO Constellations', 'Deep Space Exploration'], applications: ['High-frequency power amplifier', 'Power conversion', 'Phased array RF'], maxServiceTempC: 250, density: '6.15 g/cm³', evidence: 'Engineering Maturity', trl: 7,
    advantages: ['High power density', 'High frequency', 'High breakdown field'], watchouts: ['Total ionizing dose / single-event effects require device-level validation', 'Thermal management'], qualification: ['TID/SEE', 'Power cycling', 'Package thermal resistance'], sourceLabel: 'NASA electronics / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'sic-electronics', name: 'SiC wide-bandgap semiconductor', designation: '4H-SiC', composition: 'SiC', searchFormula: 'SiC', family: 'Electronic Packaging',
    missions: ['Liquid Rocket Engines', 'Satellite Platforms', 'Deep Space Exploration'], applications: ['High-temperature sensing', 'High-voltage power devices', 'Electric propulsion power supply'], maxServiceTempC: 300, density: '3.21 g/cm³', evidence: 'Engineering Maturity', trl: 7,
    advantages: ['High-temperature and high-voltage capability', 'High thermal conductivity', 'Radiation resistance potential'], watchouts: ['Gate oxide/interface reliability', 'Packaging becomes the temperature bottleneck'], qualification: ['TID/SEE', 'High-temperature bias', 'Package thermal cycling'], sourceLabel: 'NASA electronics / structure databases', sourceUrl: NASA_NTRS,
  },
];

export const AEROSPACE_OFFICIAL_SOURCES: AerospaceOfficialSource[] = [
  { id: 'nasa-outgassing', name: 'Spacecraft Materials Outgassing', organization: 'NASA GSFC', access: 'Public', coverage: 'ASTM E595 vacuum outgassing, TML/CVCM engineering screening portal.', url: NASA_OUTGASSING },
  { id: 'nasa-maptis', name: 'MAPTIS', organization: 'NASA', access: 'Register / Apply', coverage: 'Portal for material selection, testing, MISSE, restricted substances, and commercial handbooks.', url: NASA_MAPTIS },
  { id: 'nasa-misse', name: 'MISSE Space Exposure', organization: 'NASA', access: 'Register / Apply', coverage: 'LEO atomic oxygen, UV, thermal cycling, and long-term exposure test data.', url: 'https://www.nasa.gov/news-release/nasa-launches-comprehensive-database-of-materials-tested-on-international-space-station/' },
  { id: 'nasa-tps', name: 'Thermal Protection Materials', organization: 'NASA Ames/JSC', access: 'Public', coverage: 'PICA, TUFROC, heat shield tiles, thermal response, and ground test capabilities.', url: NASA_TPS },
  { id: 'nasa-ntrs', name: 'NASA Technical Reports Server', organization: 'NASA', access: 'Public', coverage: 'Propulsion, thermal protection, additive manufacturing, and materials testing technical reports.', url: NASA_NTRS },
  { id: 'ecss-q70', name: 'ECSS-Q-ST-70 Materials & Processes', organization: 'ESA / ECSS', access: 'Standard / License', coverage: 'European space materials, mechanical components, and process assurance framework.', url: 'https://ecss.nl/standard/ecss-q-st-70c-rev-2-materials-mechanical-parts-and-processes-15-september-2022/' },
  { id: 'nist-jarvis', name: 'JARVIS-DFT', organization: 'NIST', access: 'Public', coverage: 'Inorganic crystal structures and computed properties for preliminary screening of ceramics, coatings, and electronic materials.', url: 'https://jarvis.nist.gov/' },
  { id: 'materials-project', name: 'Materials Project', organization: 'DOE / LBNL', access: 'Public', coverage: 'Inorganic crystal structures, stability, and basic computed properties.', url: 'https://materialsproject.org/' },
];
