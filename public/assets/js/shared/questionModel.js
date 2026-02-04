const DEFAULT_QUESTION_TEXT = 'سؤال';

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeBoolean(value, fallback = true) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lowered)) return true;
    if (['false', '0', 'no', 'n'].includes(lowered)) return false;
  }
  return Boolean(value);
}

function normalizeNumber(value) {
  if (Number.isFinite(value)) return Number(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function extractAnswerValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value.answer ?? value.text ?? value.value ?? '');
  }
  return String(value);
}

function normalizeList(values, { filterEmpty = true } = {}) {
  const normalized = normalizeArray(values).map((entry) => normalizeString(extractAnswerValue(entry)));
  return filterEmpty ? normalized.filter((entry) => entry !== '') : normalized;
}

function normalizePair(pair) {
  if (Array.isArray(pair)) {
    const left = normalizeString(extractAnswerValue(pair[0]));
    const right = normalizeString(extractAnswerValue(pair[1]));
    return { left, right };
  }
  if (pair && typeof pair === 'object') {
    const left = normalizeString(extractAnswerValue(pair.left ?? pair.l ?? pair.key ?? pair.question ?? pair.prompt ?? ''));
    const right = normalizeString(extractAnswerValue(pair.right ?? pair.r ?? pair.value ?? pair.answer ?? ''));
    return { left, right };
  }
  return { left: normalizeString(pair), right: '' };
}

function normalizePairs(values) {
  return normalizeArray(values).map(normalizePair);
}

function inferQuestionType(source) {
  const rawType = normalizeString(
    source?.type || source?.qtype || source?.questionType || source?.itemType
  ).toLowerCase();
  if (rawType) return rawType;
  if (Array.isArray(source?.choices) && source.choices.length) return 'mcq';
  if (Array.isArray(source?.items) && source.items.length) return 'ordering';
  if (Array.isArray(source?.pairs) && source.pairs.length) return 'match';
  if (Array.isArray(source?.blanks) && source.blanks.length) return 'fillblank';
  return 'input';
}

function splitSolutionList(solution) {
  if (!solution) return [];
  return String(solution)
    .split(/[\n،,]+/g)
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
}

function parseSolutionPairs(solution) {
  if (!solution) return [];
  const trimmed = String(solution).trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return normalizePairs(parsed);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.pairs)) return normalizePairs(parsed.pairs);
    }
  } catch {
    // ignore JSON parse errors
  }
  const entries = splitSolutionList(trimmed);
  return entries
    .map((entry) => {
      const [left, right] = entry.split(/[:=→>\-]+/g).map((part) => normalizeString(part));
      if (!left && !right) return null;
      return { left, right };
    })
    .filter(Boolean);
}

export function normalizeQuestion(q) {
  const source = q && typeof q === 'object' ? q : {};
  const type = inferQuestionType(source);
  const text = normalizeString(source.text || source.prompt || source.title) || DEFAULT_QUESTION_TEXT;
  const isRequired = normalizeBoolean(source.isRequired, true);
  const validation = source.validation && typeof source.validation === 'object' ? source.validation : null;
  const choices = normalizeList(source.choices);
  const items = normalizeList(source.items || (type === 'ordering' && choices.length ? choices : []));
  const blanks = normalizeList(source.blanks, { filterEmpty: false });
  const pairs = normalizePairs(source.pairs);
  const correctIndex = normalizeNumber(source.correctIndex);
  const answer = normalizeString(source.answer ?? '');
  const solution = normalizeString(source.solution ?? '');
  const hints = normalizeArray(source.hints).map((hint) => normalizeString(hint)).filter(Boolean);

  return {
    ...source,
    type,
    text,
    isRequired,
    validation,
    items,
    blanks,
    pairs,
    choices,
    correctIndex,
    answer,
    solution,
    hints,
  };
}

export function getExpectedAnswer(q) {
  const question = normalizeQuestion(q);
  const solution = question.solution;

  switch (question.type) {
    case 'fillblank': {
      let blanks = normalizeList(question.blanks, { filterEmpty: false });
      if (!blanks.length && solution) {
        blanks = splitSolutionList(solution);
      }
      return blanks;
    }
    case 'ordering': {
      let items = normalizeList(question.items);
      if (!items.length && solution) {
        items = splitSolutionList(solution);
      }
      return items;
    }
    case 'match': {
      let pairs = normalizePairs(question.pairs);
      if (!pairs.length && solution) {
        pairs = parseSolutionPairs(solution);
      }
      return pairs;
    }
    case 'mcq': {
      const choices = normalizeList(question.choices);
      let correctIndex = question.correctIndex;
      if (!Number.isFinite(correctIndex) && solution && choices.length) {
        const solutionIndex = choices.findIndex((choice) => normalizeString(choice) === solution);
        if (solutionIndex >= 0) correctIndex = solutionIndex;
      }
      return {
        choices,
        correctIndex: Number.isFinite(correctIndex) ? correctIndex : null,
      };
    }
    case 'input': {
      const answer = normalizeString(question.answer || solution);
      return answer;
    }
    default: {
      const fallback = normalizeString(question.answer || solution);
      return fallback;
    }
  }
}

export function getSolutionText(q) {
  const question = normalizeQuestion(q);
  const expected = getExpectedAnswer(question);

  switch (question.type) {
    case 'mcq': {
      const choices = expected?.choices || [];
      const index = Number.isFinite(expected?.correctIndex) ? expected.correctIndex : null;
      if (index != null && choices[index] != null) {
        return normalizeString(choices[index]);
      }
      return question.solution || '';
    }
    case 'ordering':
    case 'fillblank': {
      const list = Array.isArray(expected) ? expected : [];
      return list.filter(Boolean).join('، ');
    }
    case 'match': {
      const pairs = Array.isArray(expected) ? expected : [];
      return pairs
        .map((pair) => {
          const left = normalizeString(pair?.left || '');
          const right = normalizeString(pair?.right || '');
          if (!left && !right) return '';
          if (!right) return left;
          if (!left) return right;
          return `${left} → ${right}`;
        })
        .filter(Boolean)
        .join('، ');
    }
    case 'input': {
      return normalizeString(expected);
    }
    default: {
      return normalizeString(question.solution || expected || '');
    }
  }
}

export function isAnswerCorrect(question, expectedAnswer, compareText) {
  const normalized = normalizeQuestion(question);
  const expected = expectedAnswer ?? getExpectedAnswer(normalized);
  const compare =
    typeof compareText === 'function'
      ? compareText
      : (userValue, answerValue) => normalizeString(userValue) === normalizeString(answerValue);

  switch (normalized.type) {
    case 'mcq': {
      if (!expected || typeof expected !== 'object') return false;
      if (!Number.isFinite(expected.correctIndex)) return false;
      return normalized._selectedIndex === expected.correctIndex;
    }
    case 'ordering': {
      const order = Array.isArray(normalized._order) ? normalized._order : [];
      const items = Array.isArray(expected) ? expected : [];
      if (!items.length) return true;
      if (order.length !== items.length) return false;
      if (order.some((item) => item == null)) return false;
      return order.every((value, index) => normalizeString(value) === normalizeString(items[index]));
    }
    case 'match': {
      const pairs = Array.isArray(expected) ? expected : [];
      const selections = Array.isArray(normalized._matches) ? normalized._matches : [];
      if (!pairs.length) return true;
      if (selections.length !== pairs.length) return false;
      if (selections.some((value) => !normalizeString(value))) return false;
      return pairs.every((pair, index) => {
        const expectedRight = normalizeString(pair?.right ?? '');
        const actual = normalizeString(selections[index] ?? '');
        return expectedRight !== '' && expectedRight === actual;
      });
    }
    case 'fillblank': {
      const blanks = Array.isArray(expected) ? expected : [];
      const values = Array.isArray(normalized._blanks) ? normalized._blanks : [];
      const validation = { fuzzyAutocorrect: true, ...(normalized.validation || {}) };
      if (!blanks.length) return true;
      if (values.length < blanks.length) return false;
      return blanks.every((ans, index) => {
        const spec = Array.isArray(normalized.textSpec)
          ? normalized.textSpec[index]
          : (normalized.textSpec || normalized.spec || normalized.answerSpec);
        return compare(values[index] ?? '', ans ?? '', validation, spec);
      });
    }
    default: {
      const user = normalized._value ?? '';
      const textSpec = normalized.textSpec || normalized.spec || normalized.answerSpec;
      return compare(user, expected ?? normalized.answer ?? '', normalized.validation || {}, textSpec);
    }
  }
}
