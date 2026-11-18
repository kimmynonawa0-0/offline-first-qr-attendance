export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api(path, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('Could not reach the attendance server. Check the connection and try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.error || `Request failed (${response.status}).`, response.status);
  return result;
}
