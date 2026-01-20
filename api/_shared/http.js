const DEFAULT_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function withHeaders(headers) {
  return { ...DEFAULT_HEADERS, ...(headers || {}) };
}

function response(status, body, headers) {
  return {
    status,
    headers: withHeaders(headers),
    body
  };
}

function ok(data, headers) {
  return response(200, data, headers);
}

function badRequest(message = 'BAD_REQUEST') {
  return response(400, { ok: false, error: message });
}

function unauthorized(message = 'UNAUTHORIZED') {
  return response(401, { ok: false, error: message });
}

function notFound(message = 'NOT_FOUND') {
  return response(404, { ok: false, error: message });
}

function methodNotAllowed(message = 'Method not allowed.') {
  return response(405, { ok: false, error: message });
}

function serverError(error) {
  return response(500, { ok: false, error: 'SERVER_ERROR', detail: error?.message });
}

module.exports = {
  DEFAULT_HEADERS,
  response,
  ok,
  badRequest,
  unauthorized,
  notFound,
  methodNotAllowed,
  serverError
};
