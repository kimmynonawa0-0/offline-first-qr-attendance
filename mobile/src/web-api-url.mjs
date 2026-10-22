export function validateProductionApiUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Set EXPO_PUBLIC_API_URL to the public API base URL before building the PWA.');
  }

  let parsed;
  try { parsed = new URL(value.trim()); }
  catch { throw new Error('EXPO_PUBLIC_API_URL must be a valid HTTPS URL.'); }

  if (parsed.protocol !== 'https:') throw new Error('The production PWA API URL must use HTTPS.');
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('Use the API root URL only, not /health, /manager, credentials, or extra URL parts.');
  }

  return parsed.origin;
}
