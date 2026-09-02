function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

function createWindowRateLimit({
  windowMs,
  max,
  key = requestIp,
  message = '请求过于频繁，请稍后再试。',
}) {
  const buckets = new Map();
  let lastSweep = 0;

  const middleware = (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep >= windowMs) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
      lastSweep = now;
    }

    const bucketKey = String(key(req) || requestIp(req));
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, bucket);
    }

    if (bucket.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set?.('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }

    bucket.count += 1;
    return next();
  };

  middleware.reset = () => {
    buckets.clear();
    lastSweep = 0;
  };
  return middleware;
}

function createConcurrencyLimit({
  max,
  message = '服务器正在处理其他大型任务，请稍后重试。',
}) {
  let active = 0;

  return (req, res, next) => {
    if (active >= max) {
      res.set?.('Retry-After', '5');
      return res.status(503).json({ error: message, retryAfter: 5 });
    }

    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
    };
    res.once('finish', release);
    res.once('close', release);
    return next();
  };
}

module.exports = {
  createConcurrencyLimit,
  createWindowRateLimit,
  requestIp,
};
