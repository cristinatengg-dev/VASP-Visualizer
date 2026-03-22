const mongoose = require('mongoose');

function isUnsupportedTransactionError(error) {
  return /Transaction numbers are only allowed on a replica set member or mongos/i.test(
    String(error?.message || error || ''),
  );
}

async function withTransaction(work) {
  if (process.env.RUNTIME_DISABLE_TRANSACTIONS === '1') {
    return work(null);
  }

  try {
    const tx = await mongoose.startSession();
    let result;

    try {
      await tx.withTransaction(async () => {
        result = await work(tx);
      });
      return result;
    } catch (error) {
      if (isUnsupportedTransactionError(error)) {
        return work(null);
      }
      throw error;
    } finally {
      await tx.endSession();
    }
  } catch (error) {
    if (isUnsupportedTransactionError(error)) {
      return work(null);
    }
    throw error;
  }
}

module.exports = {
  withTransaction,
};
