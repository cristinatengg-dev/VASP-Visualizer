const { runFigureWorker } = require('./figure-python-runtime');
const { validateFigureOutput } = require('./validate-figure');

async function runFigureRender({
  filePath,
  originalName,
  contract,
  exportOptions = {},
}) {
  if (!filePath) {
    throw new Error('Figure data file is required');
  }
  if (!contract || typeof contract !== 'object') {
    throw new Error('Figure contract is required');
  }

  const result = await runFigureWorker({
    action: 'render',
    filePath,
    originalName,
    contract,
    exportOptions,
  });

  const validation = validateFigureOutput({
    contract,
    renderResult: result,
  });

  return {
    figureScript: result.figureScript,
    figureSpec: result.figureSpec,
    svgBase64: result.svgBase64,
    pngBase64: result.pngBase64,
    renderSuccess: Boolean(result.renderSuccess),
    qaReport: {
      ...(result.qaReport && typeof result.qaReport === 'object' ? result.qaReport : {}),
      validation,
    },
  };
}

module.exports = {
  runFigureRender,
};
