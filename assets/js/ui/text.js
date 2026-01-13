/* =========================================================
   text.js — Default Hint & Encouragement Texts (Arabic)
   Used when JSON does not provide custom text
   ========================================================= */

/* ---------- Encouragement (after success) ---------- */
export const ENCOURAGEMENTS = [
  'رائع 👏 كمل هيك!',
  'إجابة صحيحة 👍',
  'ممتاز! واضح إنك فاهم.',
  'أحسنت 🌟',
  'تمام، ننتقل للي بعدها.'
];

/* ---------- Hints (progressive) ---------- */
export const DEFAULT_HINTS = [
  'جرّب تفكّر بالخطوة الأساسية بالسؤال.',
  'راجع المثال المحلول فوق، فيه مفتاح الحل.',
  'ركّز على المطلوب بالضبط، بدون زيادة.'
];

/* ---------- Strong Hint (last attempt) ---------- */
export const FINAL_HINT = 'خذ نفس 😌 وراجع المعطيات بهدوء، الحل أبسط مما تتوقع.';

/* ---------- Helpers ---------- */
export function pickRandom(list = []) {
  if (!list.length) return '';
  return list[Math.floor(Math.random() * list.length)];
}
