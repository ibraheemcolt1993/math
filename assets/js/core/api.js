/* =========================================================
   api.js — JSON Loader (cards & weeks)
   ========================================================= */

const LOCAL_OVERRIDES = {
  '/data/students.json': 'math:admin:students',
  '/data/cards.json': 'math:admin:cards',
};

export async function fetchJson(url, { noStore = false } = {}) {
  const overrideKey = LOCAL_OVERRIDES[url];
  if (overrideKey) {
    try {
      const stored = localStorage.getItem(overrideKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fall back to network fetch when parsing fails.
    }
  }

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
