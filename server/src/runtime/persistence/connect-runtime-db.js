const mongoose = require('mongoose');

let connectPromise = null;

async function connectRuntimeDb() {
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return mongoose.connection;
  }

  if (!connectPromise) {
    const uri = process.env.RUNTIME_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      throw new Error('Runtime MongoDB URI is missing. Set RUNTIME_MONGODB_URI, MONGODB_URI, or MONGO_URI.');
    }

    connectPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  }

  try {
    await connectPromise;
    return mongoose.connection;
  } catch (err) {
    connectPromise = null;
    throw err;
  }
}

module.exports = {
  connectRuntimeDb,
};
