function createDefaultPolicyHooks() {
  return {
    async runInitialPreflight() {
      return {
        ok: true,
        nextStatus: 'queued',
      };
    },
  };
}

module.exports = {
  createDefaultPolicyHooks,
};
