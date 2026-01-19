/* =========================================================
   api.js — JSON Loader (API helpers)
   ========================================================= */

export async function fetchJson(url, { noStore = false, method = 'GET', body, headers } = {}) {
  const opts = {
    method,
    headers: {
      ...(headers || {}),
    },
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }

  if (noStore) {
    opts.cache = 'no-store';
    opts.headers['Cache-Control'] = 'no-store';
    opts.headers['Pragma'] = 'no-cache';
  }

  const res = await fetch(url, opts);
  if (!res.ok) {
    let message = `فشل تحميل البيانات: ${url}`;
    try {
      const errorPayload = await res.json();
      if (errorPayload?.error) {
        message = errorPayload.error;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return await res.json();
}
