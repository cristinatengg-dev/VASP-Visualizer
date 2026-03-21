const { runBuildModelingTask } = require('./run-build-modeling-task');

function baseModelingIntent(intent) {
  return {
    ...intent,
    adsorbates: [],
    doping: undefined,
    defect: undefined,
  };
}

function deriveIntentForModelingSkill(intent, skillId) {
  const baseIntent = baseModelingIntent(intent);

  switch (skillId) {
    case 'build_bulk':
    case 'build_slab':
    case 'modeling_build_structure':
      return baseIntent;
    case 'place_adsorbate':
      return {
        ...baseIntent,
        adsorbates: Array.isArray(intent?.adsorbates) ? intent.adsorbates : [],
      };
    case 'substitutional_doping':
      return {
        ...baseIntent,
        doping: intent?.doping,
      };
    case 'vacancy_defect':
      return {
        ...baseIntent,
        defect: intent?.defect,
      };
    default:
      return intent;
  }
}

function getPrimaryModelingSkillId(intent) {
  if (intent?.defect?.type === 'vacancy' && intent?.defect?.element) {
    return 'vacancy_defect';
  }
  if (intent?.doping?.host_element && intent?.doping?.dopant_element) {
    return 'substitutional_doping';
  }
  if (Array.isArray(intent?.adsorbates) && intent.adsorbates.length > 0) {
    return 'place_adsorbate';
  }
  if (intent?.task_type === 'crystal' || intent?.task_type === 'bulk') {
    return 'build_bulk';
  }
  return 'build_slab';
}

function buildModelingPlanSteps(intent, { stepIdPrefix = `modeling-${Date.now()}` } = {}) {
  const steps = [];
  const baseSkillId = intent?.task_type === 'crystal' || intent?.task_type === 'bulk'
    ? 'build_bulk'
    : 'build_slab';

  steps.push({
    stepId: `${stepIdPrefix}-base`,
    skillId: baseSkillId,
    agentId: 'modeling-subagent',
    retryable: true,
    approvalRequired: false,
  });

  if (Array.isArray(intent?.adsorbates) && intent.adsorbates.length > 0) {
    steps.push({
      stepId: `${stepIdPrefix}-adsorbate`,
      skillId: 'place_adsorbate',
      agentId: 'modeling-subagent',
      retryable: true,
      approvalRequired: false,
    });
  }

  if (intent?.doping?.host_element && intent?.doping?.dopant_element) {
    steps.push({
      stepId: `${stepIdPrefix}-doping`,
      skillId: 'substitutional_doping',
      agentId: 'modeling-subagent',
      retryable: true,
      approvalRequired: false,
    });
  }

  if (intent?.defect?.type === 'vacancy' && intent?.defect?.element) {
    steps.push({
      stepId: `${stepIdPrefix}-defect`,
      skillId: 'vacancy_defect',
      agentId: 'modeling-subagent',
      retryable: true,
      approvalRequired: false,
    });
  }

  return steps;
}

function buildModelingPlanPreview(goalPrompt, intent, planSteps) {
  return {
    goalSummary: goalPrompt,
    taskType: intent?.task_type || null,
    primarySkillId: getPrimaryModelingSkillId(intent),
    providerPreferences: intent?.provider_preferences || [],
    steps: planSteps.map((step) => ({
      id: step.stepId,
      skillId: step.skillId,
      agentId: step.agentId,
    })),
  };
}

async function runModelingPlan({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  initialTaskRun,
  intent,
  planSteps,
}) {
  if (!Array.isArray(planSteps) || planSteps.length === 0) {
    throw new Error('Modeling plan requires at least one step');
  }

  const stepResults = [];
  let activeTaskRun = initialTaskRun;
  let latestStructureArtifact = null;
  let latestBuildMeta = null;

  for (let index = 0; index < planSteps.length; index += 1) {
    const step = planSteps[index];

    if (index > 0) {
      activeTaskRun = await runtimeCore.withTransaction(async (tx) =>
        runtimeCore.createAndStageTaskRun({
          session,
          goalArtifact,
          planArtifact,
          taskSpec: {
            ...step,
            inputArtifacts: [
              ...(goalArtifact ? [goalArtifact._id] : []),
              ...(latestStructureArtifact ? [latestStructureArtifact._id] : []),
            ],
          },
          tx,
        })
      );
    }

    if (activeTaskRun.status === 'blocked') {
      return {
        blocked: true,
        taskRun: activeTaskRun,
        finalTaskRun: activeTaskRun,
        finalStructureArtifact: latestStructureArtifact,
        finalBuildMeta: latestBuildMeta,
        stepResults,
      };
    }

    const stepIntent = deriveIntentForModelingSkill(intent, step.skillId);
    if (latestStructureArtifact?.payloadRef && index > 0) {
      const payloadDocument = await runtimeCore.artifactStorage.readJsonPayload(latestStructureArtifact.payloadRef);
      const priorPayload = payloadDocument?.payload || {};
      if (priorPayload?.structure) {
        stepIntent.initial_structure = priorPayload.structure;
      }
      if (priorPayload?.meta) {
        stepIntent.upstream_meta = priorPayload.meta;
      }
    }

    const result = await runBuildModelingTask({
      runtimeCore,
      policyEngine,
      session,
      goalArtifact,
      planArtifact,
      taskRun: activeTaskRun,
      intent: stepIntent,
    });

    stepResults.push({
      stepId: step.stepId,
      skillId: step.skillId,
      taskRun: result.taskRun,
      structureArtifact: result.structureArtifact,
      buildResult: result.buildResult,
    });

    activeTaskRun = result.taskRun;
    latestStructureArtifact = result.structureArtifact || latestStructureArtifact;
    latestBuildMeta = result.buildResult?.meta || latestBuildMeta;

    if (result.taskRun.status !== 'succeeded') {
      return {
        blocked: false,
        taskRun: activeTaskRun,
        finalTaskRun: activeTaskRun,
        finalStructureArtifact: latestStructureArtifact,
        finalBuildMeta: latestBuildMeta,
        stepResults,
      };
    }
  }

  return {
    blocked: false,
    taskRun: activeTaskRun,
    finalTaskRun: activeTaskRun,
    finalStructureArtifact: latestStructureArtifact,
    finalBuildMeta: latestBuildMeta,
    stepResults,
  };
}

module.exports = {
  buildModelingPlanPreview,
  buildModelingPlanSteps,
  deriveIntentForModelingSkill,
  getPrimaryModelingSkillId,
  runModelingPlan,
};
