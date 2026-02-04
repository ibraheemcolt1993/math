/* =========================================================
   textAnswerJudge.js — Shared tolerant Arabic text judging
   ========================================================= */

export function normalizeArabic(text, opts = {}) {
  const options = { removeAl: true, ...opts };
  let value = String(text ?? '').trim();

  const digitMap = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };

  value = value
    .replace(/[٠-٩۰-۹]/g, (digit) => digitMap[digit] ?? digit)
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

  value = value.replace(/[^\p{L}\p{N}\s]/gu, '');
  value = value.replace(/\s+/g, ' ').trim();

  if (options.removeAl) {
    value = value
      .split(' ')
      .map((word) => (word.startsWith('ال') ? word.slice(2) : word))
      .join(' ');
  }

  return value.toLowerCase();
}

export function levenshtein(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left === right) return 0;
  const aLen = left.length;
  const bLen = right.length;
  if (!aLen) return bLen;
  if (!bLen) return aLen;

  const dp = Array.from({ length: aLen + 1 }, () => Array(bLen + 1).fill(0));
  for (let i = 0; i <= aLen; i += 1) dp[i][0] = i;
  for (let j = 0; j <= bLen; j += 1) dp[0][j] = j;

  for (let i = 1; i <= aLen; i += 1) {
    for (let j = 1; j <= bLen; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[aLen][bLen];
}

function normalizeList(list, options) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => normalizeArabic(entry ?? '', options))
    .filter((entry) => entry);
}

function findForbiddenWord(words, forbiddenWords) {
  if (!words.length || !forbiddenWords.length) return null;
  const wordSet = new Set(words);
  return forbiddenWords.find((word) => wordSet.has(word)) || null;
}

export function judgeTextAnswer(studentRaw, spec = {}) {
  const modelAnswer = String(spec.modelAnswer ?? '');
  const normalizeOptions = { removeAl: true, ...(spec.normalizeOptions || {}) };
  const showCorrection = spec.showCorrectionOnAccept !== false;

  const normalizedStudent = normalizeArabic(studentRaw ?? '', normalizeOptions);
  const normalizedModel = normalizeArabic(modelAnswer ?? '', normalizeOptions);

  const normalizedAccepted = normalizeList(spec.acceptedPhrases, normalizeOptions);
  const normalizedCore = normalizeList(spec.acceptedCore, normalizeOptions);
  const normalizedForbidden = normalizeList(spec.forbiddenWords, normalizeOptions);

  const studentWords = normalizedStudent ? normalizedStudent.split(' ') : [];

  if (findForbiddenWord(studentWords, normalizedForbidden)) {
    return {
      ok: false,
      reason: 'forbidden',
      corrected: modelAnswer || null,
      score: 0
    };
  }

  if (!normalizedStudent) {
    return {
      ok: false,
      reason: 'empty',
      corrected: null,
      score: 0
    };
  }

  if (normalizedStudent && normalizedModel && normalizedStudent === normalizedModel) {
    return {
      ok: true,
      reason: 'match',
      corrected: null,
      score: 100
    };
  }

  if (normalizedAccepted.includes(normalizedStudent)) {
    return {
      ok: true,
      reason: 'accepted',
      corrected: showCorrection && normalizedModel && normalizedStudent !== normalizedModel ? modelAnswer : null,
      score: 100
    };
  }

  const maxEditDistance = Number.isFinite(spec.maxEditDistance) ? spec.maxEditDistance : 2;
  if (normalizedModel) {
    const distance = levenshtein(normalizedStudent, normalizedModel);
    if (distance <= maxEditDistance) {
      return {
        ok: true,
        reason: 'distance',
        corrected: showCorrection && normalizedStudent !== normalizedModel ? modelAnswer : null,
        score: 90
      };
    }
  }

  if (normalizedCore.length) {
    const coreSet = new Set(normalizedCore);
    const hasCore = studentWords.some((word) => coreSet.has(word));
    if (hasCore) {
      return {
        ok: true,
        reason: 'core',
        corrected: showCorrection && normalizedStudent !== normalizedModel ? modelAnswer : null,
        score: 80
      };
    }
  }

  return {
    ok: false,
    reason: 'wrong',
    corrected: null,
    score: 0
  };
}

window.__textJudgeSelfTest = function __textJudgeSelfTest() {
  const cases = [
    {
      modelAnswer: 'الأكثر',
      student: 'الاكتر',
      expectOk: true
    },
    {
      modelAnswer: 'محيط المربع',
      student: 'المحيط',
      acceptedPhrases: ['محيط المربع', 'المحيط'],
      acceptedCore: ['محيط'],
      expectOk: true,
      expectCorrection: true
    },
    {
      modelAnswer: 'محيط المربع',
      student: 'مساحة المربع',
      forbiddenWords: ['مساحة', 'مساحه'],
      expectOk: false
    }
  ];

  return cases.map((entry) => {
    const result = judgeTextAnswer(entry.student, {
      modelAnswer: entry.modelAnswer,
      acceptedPhrases: entry.acceptedPhrases,
      acceptedCore: entry.acceptedCore,
      forbiddenWords: entry.forbiddenWords,
      showCorrectionOnAccept: true
    });
    return {
      student: entry.student,
      ok: result.ok,
      corrected: result.corrected,
      passed: result.ok === entry.expectOk && (!entry.expectCorrection || Boolean(result.corrected))
    };
  });
};
