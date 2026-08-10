const { AGENT_ACCESS } = require('../../config');
const { getUser, updateUser } = require('../../utils/db');
const { isAdminUser } = require('./admin');
const { readTokenIdentity } = require('./token-auth');

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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

/**
 * Check whether a user can access a given agent.
 */
async function checkAgentAccess(user, agentName) {
  if (!user) {
    return { allowed: false, reason: 'login_required', message: '请先登录' };
  }

  let tier = String(user.tier || 'personal').toLowerCase();

  // Configured admin phone numbers always get enterprise access
  if (isAdminUser(user)) {
    tier = 'enterprise';
  }

  // Academic / enterprise — unlimited access to everything
  if (AGENT_ACCESS.UNLIMITED_TIERS.includes(tier)) {
    return { allowed: true };
  }

  // Personal tier — check per-agent subscription
  const subscribedAgents = Array.isArray(user.subscribed_agents) ? user.subscribed_agents : [];
  const isSubscribed = subscribedAgents.includes(agentName);

  // Check subscription expiry
  if (isSubscribed && user.subscription_expires_at) {
    if (new Date(user.subscription_expires_at) < new Date()) {
      return {
        allowed: false,
        reason: 'subscription_expired',
        message: `${agentName} 订阅已过期，请续费`,
        upgrade_hint: 'renew',
      };
    }
  }

  // Cover agent — must be subscribed, no free usage
  if (agentName === 'cover') {
    if (!isSubscribed) {
      return {
        allowed: false,
        reason: 'not_subscribed',
        message: 'Cover Agent 需要订阅后才能使用',
        upgrade_hint: 'subscribe_cover',
      };
    }

    // Check monthly quota
    const monthKey = currentMonthKey();
    let coverUsed = user.cover_used_this_month || 0;
    if ((user.cover_month_key || '') !== monthKey) {
      coverUsed = 0;
    }

    const monthlyLimit = AGENT_ACCESS.MONTHLY_QUOTA.cover || 10;
    if (coverUsed >= monthlyLimit) {
      return {
        allowed: false,
        reason: 'monthly_quota_exceeded',
        message: `本月 Cover 配额已用完 (${coverUsed}/${monthlyLimit})`,
        upgrade_hint: 'upgrade_academic',
        quota: { used: coverUsed, limit: monthlyLimit },
      };
    }

    return {
      allowed: true,
      quota: { used: coverUsed, limit: monthlyLimit, remaining: monthlyLimit - coverUsed },
    };
  }

  // Compute agent — must be subscribed, no free usage
  if (agentName === 'compute') {
    if (!isSubscribed) {
      return {
        allowed: false,
        reason: 'not_subscribed',
        message: 'Compute Agent 需要订阅后才能使用',
        upgrade_hint: 'subscribe_compute',
      };
    }
    return { allowed: true };
  }

  // Other agents (modeling, rendering, retrieval) — subscribed = unlimited, otherwise daily limit
  if (isSubscribed) {
    return { allowed: true };
  }

  // Daily free usage for non-subscribed users
  const dailyLimit = AGENT_ACCESS.DAILY_FREE[agentName];
  if (dailyLimit === 0) {
    return {
      allowed: false,
      reason: 'not_subscribed',
      message: `${agentName} Agent 需要订阅后才能使用`,
      upgrade_hint: `subscribe_${agentName}`,
    };
  }

  const today = todayKey();
  const dailyUsage = user.agent_daily_usage || {};
  const agentUsageToday = dailyUsage[`${agentName}:${today}`] || 0;

  if (agentUsageToday >= dailyLimit) {
    return {
      allowed: false,
      reason: 'daily_limit_reached',
      message: `今日 ${agentName} 免费次数已用完 (${agentUsageToday}/${dailyLimit})`,
      upgrade_hint: `subscribe_${agentName}`,
      quota: { used: agentUsageToday, limit: dailyLimit },
    };
  }

  return {
    allowed: true,
    is_free_usage: true,
    quota: { used: agentUsageToday, limit: dailyLimit, remaining: dailyLimit - agentUsageToday },
  };
}

/**
 * Record one usage of an agent for a user. Call after successful agent execution.
 */
async function recordAgentUsage(userId, agentName) {
  const user = await getUser(userId);
  if (!user) return;

  const tier = String(user.tier || 'personal').toLowerCase();
  if (AGENT_ACCESS.UNLIMITED_TIERS.includes(tier)) return;

  const updates = { updatedAt: new Date() };

  if (agentName === 'cover') {
    const monthKey = currentMonthKey();
    if ((user.cover_month_key || '') !== monthKey) {
      updates.cover_month_key = monthKey;
      updates.cover_used_this_month = 1;
    } else {
      updates.cover_used_this_month = (user.cover_used_this_month || 0) + 1;
    }
  } else {
    const subscribedAgents = Array.isArray(user.subscribed_agents) ? user.subscribed_agents : [];
    if (!subscribedAgents.includes(agentName)) {
      const today = todayKey();
      const dailyUsage = user.agent_daily_usage || {};
      const key = `${agentName}:${today}`;
      dailyUsage[key] = (dailyUsage[key] || 0) + 1;
      updates.agent_daily_usage = dailyUsage;
    }
  }

  await updateUser(userId, updates);
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

    // If no userId can be extracted, skip access control (fail-open).
    // Frontend AgentGate already enforces access checks with the auth token.
    if (!userId) {
      req.agentAccess = { allowed: true, skipped: true };
      req.agentAuthenticated = false;
      req.agentName = agentName;
      return next();
    }

    let user = await getUser(userId);

    if (!user) {
      user = { id: userId, phone: userId, tier: 'personal', subscribed_agents: [], agent_daily_usage: {} };
    }

    const result = await checkAgentAccess(user, agentName);

    if (!result.allowed) {
      return res.status(403).json({
        success: false,
        error: result.message,
        agent_blocked: true,
        reason: result.reason,
        upgrade_hint: result.upgrade_hint,
        quota: result.quota || null,
      });
    }

    req.agentAccess = result;
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

  if (!userId) {
    return res.json({ success: true, agents: {} });
  }

  const user = await getUser(userId);
  if (!user) {
    return res.json({ success: true, agents: {} });
  }

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
  handleAgentAccessCheck,
};
