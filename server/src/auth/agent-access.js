const { AGENT_ACCESS } = require('../../config');
const { getUser } = require('../../utils/db');
const { readTokenIdentity } = require('./token-auth');

/**
 * Extract the authenticated user's phone identifier from the request.
 * Prefers a verified Authorization token, then falls back to an explicit user id
 * for endpoints that still support local/demo access.
 */
function extractUserId(req) {
  const authHeader = String(req.headers?.authorization || '').trim();
  const tokenIdentity = readTokenIdentity(authHeader, process.env.TOKEN_SECRET || '');
  if (tokenIdentity.valid) return tokenIdentity.userId;
  if (req.body?.userId) return String(req.body.userId).trim();
  if (req.query?.userId) return String(req.query.userId).trim();
  return '';
}

const LOCAL_OWNER_ID_PATTERN = /^local-[a-zA-Z0-9-]{12,160}$/;

/**
 * Resolve the storage owner for endpoints that support both signed-in users and
 * anonymous local workspaces. Phone-number owners always require a verified
 * bearer token; anonymous callers may only use high-entropy `local-*` ids.
 */
function resolveAgentOwnerId(req) {
  if (req.agentAuthenticated) {
    const authenticatedOwner = String(
      req.agentUser?.phone || req.agentUser?.id || req.agentUser?._id || '',
    ).trim();
    if (authenticatedOwner) return authenticatedOwner;
  }

  const requestedOwner = String(
    req.body?.ownerId || req.body?.userId || req.query?.ownerId || req.query?.userId || '',
  ).trim();
  if (LOCAL_OWNER_ID_PATTERN.test(requestedOwner)) return requestedOwner;

  const error = new Error('A valid login token or local owner id is required');
  error.statusCode = 401;
  throw error;
}

/**
 * Agent capabilities are public. This function remains as the shared policy
 * boundary so subscription controls can be reintroduced without changing every
 * route, while the current response is intentionally independent of user tier.
 */
async function checkAgentAccess(_user, agentName) {
  return {
    allowed: true,
    public_access: true,
    agent: String(agentName || ''),
  };
}

/**
 * Public agent access does not consume subscription or daily quota counters.
 */
async function recordAgentUsage(_userId, _agentName) {
  return { recorded: false, public_access: true };
}

/**
 * Express middleware factory. Checks agent access before proceeding.
 * Attaches `req.agentAccess` with the check result.
 */
function requireAgentAccess(agentName) {
  return async (req, res, next) => {
    const tokenIdentity = readTokenIdentity(req.headers?.authorization, process.env.TOKEN_SECRET || '');
    if (tokenIdentity.present && !tokenIdentity.valid) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = extractUserId(req);
    const user = userId
      ? await getUser(userId) || { id: userId, phone: userId, tier: 'personal' }
      : null;
    req.agentAccess = await checkAgentAccess(user, agentName);
    req.agentUser = user;
    req.agentAuthenticated = tokenIdentity.valid;
    req.agentName = agentName;
    next();
  };
}

/**
 * Authenticate a request without applying an agent subscription/quota policy.
 * Runtime persistence uses this so users can always save and inspect a task,
 * even when a downstream agent action is blocked by quota.
 */
function requireAgentIdentity() {
  return async (req, res, next) => {
    const tokenIdentity = readTokenIdentity(req.headers?.authorization, process.env.TOKEN_SECRET || '');
    if (tokenIdentity.present && !tokenIdentity.valid) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    req.agentAuthenticated = tokenIdentity.valid;
    if (tokenIdentity.valid) {
      req.agentUser = await getUser(tokenIdentity.userId)
        || { id: tokenIdentity.userId, phone: tokenIdentity.userId, tier: 'personal' };
    }
    next();
  };
}

/**
 * GET endpoint to check agent access status without consuming usage.
 */
async function handleAgentAccessCheck(req, res) {
  const userId = extractUserId(req);
  const agentName = req.query?.agent || '';

  const user = userId ? await getUser(userId) : null;

  if (agentName) {
    const result = await checkAgentAccess(user, agentName);
    return res.json({ success: true, agent: agentName, ...result });
  }

  // Check all agents
  const agents = {};
  for (const name of AGENT_ACCESS.AGENTS) {
    agents[name] = await checkAgentAccess(user, name);
  }
  return res.json({ success: true, agents });
}

module.exports = {
  checkAgentAccess,
  recordAgentUsage,
  requireAgentAccess,
  requireAgentIdentity,
  resolveAgentOwnerId,
  handleAgentAccessCheck,
};
