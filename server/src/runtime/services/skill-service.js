const { SkillDefinitionModel } = require('../persistence/models');
const {
  BUILTIN_RUNTIME_SKILLS,
  getBuiltinSkillDisplay,
  toPersistedSkillDefinition,
} = require('../skills/builtin-skill-definitions');

function enrichSkillDocument(skillDoc) {
  const plain = typeof skillDoc?.toObject === 'function' ? skillDoc.toObject() : skillDoc;
  if (!plain) {
    return null;
  }

  return {
    ...plain,
    display: getBuiltinSkillDisplay(plain.skillId, plain.version),
  };
}

function createSkillService() {
  async function ensureBuiltinSkills(tx) {
    for (const skill of BUILTIN_RUNTIME_SKILLS) {
      await SkillDefinitionModel.updateMany(
        {
          skillId: skill.skillId,
          version: { $ne: skill.version },
        },
        {
          $set: { latest: false },
        },
        { session: tx }
      );

      await SkillDefinitionModel.findOneAndUpdate(
        {
          skillId: skill.skillId,
          version: skill.version,
        },
        {
          $set: {
            ...toPersistedSkillDefinition(skill),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          session: tx,
        }
      );
    }
  }

  async function listSkills({ status, skillIds, tx } = {}) {
    const query = {};
    if (status) {
      query.status = status;
    }
    if (Array.isArray(skillIds) && skillIds.length > 0) {
      query.skillId = { $in: skillIds };
    }

    const skills = await SkillDefinitionModel.find(query, null, { session: tx }).sort({ skillId: 1, version: -1 });
    return skills.map(enrichSkillDocument).filter(Boolean);
  }

  async function getSkill({ skillId, version, tx } = {}) {
    if (!skillId) {
      return null;
    }

    const query = version
      ? { skillId, version }
      : { skillId, latest: true };

    const skill = await SkillDefinitionModel.findOne(query, null, { session: tx });
    return enrichSkillDocument(skill);
  }

  return {
    ensureBuiltinSkills,
    listSkills,
    getSkill,
  };
}

module.exports = {
  createSkillService,
};
