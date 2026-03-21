const { parseScienceText } = require('../../../rendering/parse-science');
const { runRenderingReportTask } = require('./run-rendering-report-task');

async function runParseScienceTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  text,
}) {
  return runRenderingReportTask({
    runtimeCore,
    policyEngine,
    session,
    goalArtifact,
    planArtifact,
    taskRun,
    validatorHints: ['science_parse_report'],
    failureReason: 'parse_science_failed',
    artifactSummaryFallback: 'Scientific parsing result',
    execute: async () => {
      const parsed = await parseScienceText({ text });
      return {
        parsed,
        preview: {
          sourceType: 'science_text',
          sourceTextExcerpt: String(text || '').trim().slice(0, 280),
        },
        metrics: {
          textLength: String(text || '').trim().length,
        },
      };
    },
  });
}

module.exports = {
  runParseScienceTask,
};
