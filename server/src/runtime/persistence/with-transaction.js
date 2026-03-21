const mongoose = require('mongoose');

async function withTransaction(work) {
  if (process.env.RUNTIME_DISABLE_TRANSACTIONS === '1') {
    return work(null);
  }

  const tx = await mongoose.startSession();
  let result;
  try {
    await tx.withTransaction(async () => {
      result = await work(tx);
    });
    return result;
  } finally {
    await tx.endSession();
  }
}

module.exports = {
  withTransaction,
};
