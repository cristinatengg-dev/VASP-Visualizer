const { EventModel } = require('../persistence/models');
const { makeRuntimeId } = require('../persistence/ids');

function createEventService({ sessionService }) {
  async function emitEvent(input, tx) {
    const sequence = input.sequence != null
      ? input.sequence
      : await sessionService.allocateNextEventSequence(input.sessionId, tx);

    const doc = new EventModel({
      _id: input._id || makeRuntimeId('evt'),
      sessionId: input.sessionId,
      taskRunId: input.taskRunId,
      jobRunId: input.jobRunId,
      category: input.category,
      type: input.type,
      ts: input.ts || new Date(),
      producerType: input.producerType,
      correlationId: input.correlationId,
      causationId: input.causationId,
      sequence,
      dedupeKey: input.dedupeKey,
      streamPartition: input.streamPartition,
      payload: input.payload || {},
    });

    return doc.save({ session: tx });
  }

  async function emitEvents(inputs, tx) {
    const out = [];
    for (const input of inputs) {
      out.push(await emitEvent(input, tx));
    }
    return out;
  }

  return {
    emitEvent,
    emitEvents,
  };
}

module.exports = {
  createEventService,
};
