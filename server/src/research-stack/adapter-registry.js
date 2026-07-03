'use strict';

const { spawnSync } = require('child_process');
const { recipeIndexStatus } = require('./recipe-index');

const PYTHON_MODULES = [
  'paperqa',
  'chemdataextractor',
  'rxn_network',
  'baybe',
  'bofire',
  'atomate2',
  'pymatgen',
  'ase',
  'networkx',
];

const ADAPTER_DEFINITIONS = [
  {
    id: 'paperqa2',
    name: 'PaperQA2',
    project: 'Future-House/paper-qa',
    url: 'https://github.com/Future-House/paper-qa',
    role: '文献问答、证据链和 citation-grounded synthesis',
    integration: 'citation_rag_adapter',
    kind: 'python-package',
    modules: ['paperqa'],
    fallback: '使用当前检索到的 DOI/URL 文献证据包；不伪造 PaperQA2 运行结果。',
  },
  {
    id: 'chemdataextractor2',
    name: 'ChemDataExtractor2',
    project: 'CambridgeMolecularEngineering/chemdataextractor2',
    url: 'https://github.com/CambridgeMolecularEngineering/chemdataextractor2',
    role: '从论文抽取前驱体、温度、时间、气氛、表格和谱图信息',
    integration: 'literature_extraction_adapter',
    kind: 'python-package',
    modules: ['chemdataextractor'],
    fallback: '使用 Ceder 数据集中已经抽取好的 precursors / operations / conditions 字段。',
  },
  {
    id: 'ceder_synthesis',
    name: 'Ceder solid-state recipes',
    project: 'CederGroupHub/text-mined-synthesis_public',
    url: 'https://github.com/CederGroupHub/text-mined-synthesis_public',
    role: '无机固相和 sol-gel 合成路线、条件和 DOI 来源',
    integration: 'local_recipe_index',
    kind: 'local-dataset',
    datasetKeys: ['ceder_solid_state_20200713', 'ceder_sol_gel_20200713'],
  },
  {
    id: 'ceder_solution_synthesis',
    name: 'Ceder solution recipes',
    project: 'CederGroupHub/text-mined-solution-synthesis_public',
    url: 'https://github.com/CederGroupHub/text-mined-solution-synthesis_public',
    role: '溶液法合成配方、前驱体、动作序列和 DOI 来源',
    integration: 'local_recipe_index',
    kind: 'local-dataset',
    datasetKey: 'ceder_solution_20210805',
  },
  {
    id: 'rxn_network',
    name: 'rxn_network',
    project: 'materialsproject/reaction-network',
    url: 'https://github.com/materialsproject/reaction-network',
    role: '无机反应网络和合成路径规划',
    integration: 'reaction_pathway_adapter',
    kind: 'python-package',
    modules: ['rxn_network'],
    fallback: '当前只给出 Ceder 命中路线和人工核对建议；不伪造反应能排序。',
  },
  {
    id: 'baybe',
    name: 'BayBE',
    project: 'emdgroup/baybe',
    url: 'https://github.com/emdgroup/baybe',
    role: '实验变量空间、约束和 Bayesian optimization 下一轮推荐',
    integration: 'doe_optimizer_adapter',
    kind: 'python-package',
    modules: ['baybe'],
    fallback: '使用项目内确定性 DoE 首批矩阵；不会声称已运行 BayBE 优化器。',
  },
  {
    id: 'bofire',
    name: 'BoFire',
    project: 'experimental-design/bofire',
    url: 'https://github.com/experimental-design/bofire',
    role: '实验设计、多目标优化和 REST 友好的 DoE 接口',
    integration: 'doe_optimizer_adapter',
    kind: 'python-package',
    modules: ['bofire'],
    fallback: '使用项目内确定性 DoE 首批矩阵；不会声称已运行 BoFire 优化器。',
  },
  {
    id: 'atomate2',
    name: 'atomate2 + pymatgen',
    project: 'materialsproject/atomate2',
    url: 'https://github.com/materialsproject/atomate2',
    role: 'VASP/材料计算 workflow、结构处理和计算 provenance',
    integration: 'compute_workflow_adapter',
    kind: 'python-package',
    modules: ['atomate2', 'pymatgen', 'ase'],
    fallback: 'pymatgen/ASE 已用于 POSCAR/INCAR/KPOINTS 编译；atomate2 workflow 未安装时不创建 FireWorks/Jobflow 作业。',
  },
];

let probeCache = null;

function runPythonModuleProbe() {
  if (probeCache) return probeCache;
  const python = process.env.PYTHON_BIN || 'python3';
  const script = `
import importlib.util, json, sys
mods = ${JSON.stringify(PYTHON_MODULES)}
print(json.dumps({m: importlib.util.find_spec(m) is not None for m in mods}))
`;
  const result = spawnSync(python, ['-c', script], {
    encoding: 'utf8',
    timeout: 8000,
  });
  if (result.error || result.status !== 0) {
    probeCache = {
      ok: false,
      python,
      modules: {},
      error: result.error ? result.error.message : (result.stderr || 'python probe failed').trim(),
    };
    return probeCache;
  }
  try {
    probeCache = {
      ok: true,
      python,
      modules: JSON.parse(result.stdout || '{}'),
      error: null,
    };
  } catch (error) {
    probeCache = {
      ok: false,
      python,
      modules: {},
      error: error.message,
    };
  }
  return probeCache;
}

function statusFromAvailability(available, fallbackAvailable = false) {
  if (available) return 'active';
  if (fallbackAvailable) return 'fallback';
  return 'missing';
}

function buildAdapterRegistry() {
  const probe = runPythonModuleProbe();
  const recipeIndex = recipeIndexStatus();
  return ADAPTER_DEFINITIONS.map((adapter) => {
    if (adapter.kind === 'local-dataset') {
      const datasetKeys = adapter.datasetKeys || [adapter.datasetKey];
      const count = datasetKeys.reduce((sum, key) => sum + Number(recipeIndex.source_counts?.[key] || 0), 0);
      const available = recipeIndex.status === 'ready' && count > 0;
      return {
        ...adapter,
        status: statusFromAvailability(available),
        available,
        backing: available ? `${count} local records` : 'local dataset missing',
        probe: {
          index_status: recipeIndex.status,
          record_count: count,
          dataset_keys: datasetKeys,
          total_records: recipeIndex.total,
        },
      };
    }

    const moduleStates = (adapter.modules || []).reduce((acc, moduleName) => {
      acc[moduleName] = Boolean(probe.modules?.[moduleName]);
      return acc;
    }, {});
    const requiredAvailable = adapter.id === 'atomate2'
      ? Boolean(moduleStates.pymatgen && moduleStates.ase)
      : (adapter.modules || []).every((moduleName) => moduleStates[moduleName]);
    const primaryAvailable = (adapter.modules || []).every((moduleName) => moduleStates[moduleName]);
    const fallbackCapable = ['paperqa2', 'chemdataextractor2', 'baybe', 'bofire', 'atomate2'].includes(adapter.id);
    const fallbackAvailable = Boolean(adapter.fallback)
      && fallbackCapable
      && (adapter.id !== 'atomate2' || requiredAvailable)
      && (adapter.id !== 'chemdataextractor2' || recipeIndex.status === 'ready');

    return {
      ...adapter,
      status: statusFromAvailability(primaryAvailable, fallbackAvailable),
      available: primaryAvailable,
      backing: primaryAvailable
        ? `python module: ${(adapter.modules || []).join(', ')}`
        : adapter.fallback,
      probe: {
        python: probe.python,
        probe_ok: probe.ok,
        probe_error: probe.error,
        modules: moduleStates,
        primary_available: primaryAvailable,
        fallback_available: fallbackAvailable,
      },
    };
  });
}

function adapterSummary(adapters = buildAdapterRegistry()) {
  return adapters.reduce((acc, adapter) => {
    acc[adapter.status] = (acc[adapter.status] || 0) + 1;
    return acc;
  }, {});
}

module.exports = {
  ADAPTER_DEFINITIONS,
  adapterSummary,
  buildAdapterRegistry,
};
