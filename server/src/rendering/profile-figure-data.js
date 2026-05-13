const { runFigureWorker } = require('./figure-python-runtime');

async function profileFigureData({ filePath, originalName }) {
  if (!filePath) {
    throw new Error('Figure data file is required');
  }

  const result = await runFigureWorker({
    action: 'profile',
    filePath,
    originalName,
  });

  if (!result.profile || typeof result.profile !== 'object') {
    throw new Error('Figure worker did not return a data profile');
  }

  return result.profile;
}

module.exports = {
  profileFigureData,
};
