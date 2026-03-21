const path = require('path');
const { parseSciencePdfFile } = require('../../../rendering/parse-pdf');
const { runRenderingReportTask } = require('./run-rendering-report-task');

async function runParsePdfTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  filePath,
  originalName,
}) {
  return runRenderingReportTask({
    runtimeCore,
    policyEngine,
    session,
    goalArtifact,
    planArtifact,
    taskRun,
    validatorHints: ['pdf_science_parse_report'],
    failureReason: 'parse_pdf_failed',
    artifactSummaryFallback: 'Scientific PDF parsing result',
    execute: async () => {
      const parsedResult = await parseSciencePdfFile({ filePath });
      return {
        parsed: parsedResult.parsed,
        preview: {
          sourceType: 'pdf',
          sourceFileName: String(originalName || path.basename(filePath || '') || '').trim() || null,
          sourceTextExcerpt: parsedResult.trimmedText.slice(0, 280),
          sourceTextLength: parsedResult.trimmedLength,
          sourceTextOriginalLength: parsedResult.originalLength,
          sourceByteLength: parsedResult.byteLength,
          sourceWasTrimmed: parsedResult.wasTrimmed,
        },
        metrics: {
          textLength: parsedResult.trimmedLength,
          originalTextLength: parsedResult.originalLength,
          sourceByteLength: parsedResult.byteLength,
          sourceWasTrimmed: parsedResult.wasTrimmed ? 1 : 0,
        },
      };
    },
  });
}

module.exports = {
  runParsePdfTask,
};
