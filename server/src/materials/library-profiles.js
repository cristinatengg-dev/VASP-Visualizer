const COMMON_LIVE_STRUCTURE_SOURCES = [
  'mp',
  'oqmd',
  'aflow',
  'jarvis',
  'alexandria',
  'nomad',
  'mcloud_mc3d',
  'omdb',
];

const profiles = [
  {
    id: 'battery',
    label: 'Battery Materials',
    liveStructureSources: COMMON_LIVE_STRUCTURE_SOURCES,
    domainSources: [
      {
        id: 'mp-battery-explorer',
        label: 'Materials Project battery apps',
        mode: 'metadata',
        category: 'battery-property',
        access: 'public account',
        homepage: 'https://materialsproject.org/',
        notes: 'Battery-specific computed voltage, insertion, stability, and structure workflows in the Materials Project ecosystem.',
      },
      {
        id: 'battery-archive',
        label: 'Battery Archive',
        mode: 'metadata',
        category: 'cell-test-data',
        access: 'open download',
        homepage: 'https://www.batteryarchive.org/',
        notes: 'Public battery cycling and device test data. Useful for evidence links, not formula-to-crystal search.',
      },
    ],
  },
  {
    id: 'nuclear',
    label: 'Nuclear Materials',
    liveStructureSources: COMMON_LIVE_STRUCTURE_SOURCES,
    domainSources: [
      {
        id: 'iaea-nuclear-data',
        label: 'IAEA Nuclear Data Services',
        mode: 'metadata',
        category: 'nuclear-data',
        access: 'open portal',
        homepage: 'https://nds.iaea.org/',
        notes: 'Nuclear data and references; not a crystal-structure API.',
      },
      {
        id: 'nist-thermo',
        label: 'NIST thermodynamic references',
        mode: 'metadata',
        category: 'thermodynamics',
        access: 'mixed public/reference',
        homepage: 'https://www.nist.gov/srd',
        notes: 'Thermodynamic and reference databases relevant to fuels and reactor materials.',
      },
    ],
  },
  {
    id: 'supercapacitor',
    label: 'Supercapacitor Materials',
    liveStructureSources: COMMON_LIVE_STRUCTURE_SOURCES,
    domainSources: [
      {
        id: 'nims-mdr-supercapacitor',
        label: 'NIMS Materials Data Repository',
        mode: 'metadata',
        category: 'device-data',
        access: 'open download',
        homepage: 'https://mdr.nims.go.jp/',
        notes: 'Public deposited datasets, including electrochemical and supercapacitor studies.',
      },
      {
        id: 'openkim',
        label: 'OpenKIM',
        mode: 'metadata',
        category: 'interatomic-models',
        access: 'open API',
        homepage: 'https://openkim.org/',
        notes: 'Curated atomistic potentials for MD workflows after structure selection.',
      },
    ],
  },
  {
    id: 'hydrogen-storage',
    label: 'Hydrogen Storage Materials',
    liveStructureSources: COMMON_LIVE_STRUCTURE_SOURCES,
    domainSources: [
      {
        id: 'hymarc-datahub',
        label: 'HyMARC Data Hub',
        mode: 'metadata',
        category: 'storage-properties',
        access: 'open portal',
        homepage: 'https://datahub-hymarc.nrel.gov/',
        notes: 'Hydrogen storage materials data and tools from the HyMARC consortium.',
      },
      {
        id: 'sandia-hmtd',
        label: 'Sandia Hydrogen Materials Technical Database',
        mode: 'apply-first',
        category: 'compatibility',
        access: 'portal / registration',
        homepage: 'https://www.sandia.gov/matlstechref/hydrogen-materials-technical-database/',
        notes: 'Engineering compatibility data measured in hydrogen; use official access route before deep integration.',
      },
    ],
  },
  {
    id: 'thermal-storage',
    label: 'Thermal Storage Materials',
    liveStructureSources: COMMON_LIVE_STRUCTURE_SOURCES,
    domainSources: [
      {
        id: 'nist-thermoml',
        label: 'NIST ThermoML Archive',
        mode: 'metadata',
        category: 'thermophysical-data',
        access: 'open download',
        homepage: 'https://www.nist.gov/mml/acmd/trc/thermoml/thermoml-archive',
        notes: 'XML archive for experimental thermophysical and thermochemical property data.',
      },
      {
        id: 'ornl-mstdb',
        label: 'ORNL Molten Salt Database',
        mode: 'apply-first',
        category: 'molten-salt-data',
        access: 'public no-cost / account-gated',
        homepage: 'https://msd.ornl.gov/',
        notes: 'MSTDB-TP and MSTDB-TC molten salt property databases; official access workflow required.',
      },
      {
        id: 'nims-cpddb',
        label: 'NIMS CPDDB',
        mode: 'metadata',
        category: 'phase-equilibria',
        access: 'open portal',
        homepage: 'https://cpddb.nims.go.jp/en/',
        notes: 'Computational phase diagram database useful for salts, alloys, and storage materials.',
      },
    ],
  },
  {
    id: 'flow-battery',
    label: 'Flow Battery Materials',
    liveStructureSources: COMMON_LIVE_STRUCTURE_SOURCES,
    domainSources: [
      {
        id: 'd3tales',
        label: 'D3TaLES',
        mode: 'metadata',
        category: 'redox-molecules',
        access: 'public account',
        homepage: 'https://d3tales.as.uky.edu/',
        notes: 'Redox-active molecule platform for non-aqueous flow battery research.',
      },
      {
        id: 'reddb',
        label: 'RedDB',
        mode: 'metadata',
        category: 'redox-molecules',
        access: 'open download',
        homepage: 'https://www.nature.com/articles/s41597-022-01832-2',
        notes: 'Public redox-active organic molecule dataset for aqueous redox flow batteries.',
      },
      {
        id: 'doe-vrfb',
        label: 'DOE VRFB Experimental Dataset',
        mode: 'metadata',
        category: 'device-data',
        access: 'open download',
        homepage: 'https://www.osti.gov/dataexplorer/biblio/dataset/1862881-experimental-database-cell-performance-vanadium-redox-flow-battery',
        notes: 'Public cell-performance data for vanadium redox flow batteries.',
      },
    ],
  },
  {
    id: 'aerospace',
    label: 'Aerospace Materials',
    liveStructureSources: COMMON_LIVE_STRUCTURE_SOURCES,
    domainSources: [
      {
        id: 'nasa-outgassing',
        label: 'NASA Spacecraft Material Outgassing Data',
        mode: 'metadata',
        category: 'outgassing',
        access: 'open download',
        homepage: 'https://data.nasa.gov/dataset/spacecraft-material-outgassing-data',
        notes: 'GSFC spacecraft material outgassing data for vacuum and contamination screening.',
      },
      {
        id: 'nasa-maptis',
        label: 'NASA MAPTIS',
        mode: 'apply-first',
        category: 'space-qualification',
        access: 'portal / registration',
        homepage: 'https://maptis.nasa.gov/',
        notes: 'NASA Materials and Processes Technical Information System; official sign-in route required.',
      },
      {
        id: 'nasa-misse',
        label: 'NASA MISSE Database',
        mode: 'apply-first',
        category: 'space-environment',
        access: 'portal / registration',
        homepage: 'https://www.nasa.gov/news-release/nasa-launches-comprehensive-database-of-materials-tested-on-international-space-station/',
        notes: 'Space exposure data for materials tested on the International Space Station.',
      },
    ],
  },
];

const MATERIAL_LIBRARY_PROFILES = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));

function getMaterialLibraryProfile(id) {
  return MATERIAL_LIBRARY_PROFILES[String(id || '').trim()] || null;
}

function listMaterialLibraryProfiles() {
  return profiles;
}

module.exports = {
  COMMON_LIVE_STRUCTURE_SOURCES,
  MATERIAL_LIBRARY_PROFILES,
  getMaterialLibraryProfile,
  listMaterialLibraryProfiles,
};
