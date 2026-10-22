export function parseWebOrigins(configuredOrigins = '') {
  const origins = new Set();

  for (const configured of configuredOrigins.split(',').map(value => value.trim()).filter(Boolean)) {
    let parsed;
    try { parsed = new URL(configured); }
    catch { throw new Error(`Invalid WEB_ORIGINS entry: ${configured}`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== configured.replace(/\/$/, '')) {
      throw new Error(`WEB_ORIGINS entries must be exact HTTP(S) origins without paths: ${configured}`);
    }
    origins.add(parsed.origin);
  }

  return origins;
}

export function corsDecision(origin, allowedOrigins) {
  if (!origin) return { allowed: true, headers: {} };
  if (!allowedOrigins.has(origin)) return { allowed: false, headers: {} };

  return {
    allowed: true,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  };
}
