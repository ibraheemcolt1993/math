/* =========================================================
   api.js — JSON Loader (cards & weeks)
   ========================================================= */

export async function fetchJson(url, { noStore = false } = {}) {
  const opts = {
    headers: {},
  };

  if (noStore) {
    opts.cache = 'no-store';
    opts.headers['Cache-Control'] = 'no-store';
    opts.headers['Pragma'] = 'no-cache';
  }

  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`فشل تحميل البيانات: ${url}`);
  }
  return await res.json();
}
