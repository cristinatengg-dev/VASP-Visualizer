const mongoose = require('mongoose');

function makeRuntimeId(prefix) {
  return `${prefix}_${new mongoose.Types.ObjectId().toHexString()}`;
}

module.exports = {
  makeRuntimeId,
};
