/* =========================================================
   match.js — Matching Question
   - Pairs in question.pairs = [{ left, right }]
   - Stores selection in question._matches
   ========================================================= */

export function renderMatchQuestion({ mountEl, question }) {
  mountEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'q q-match';

  const desc = document.createElement('div');
  desc.className = 'q-desc';
  desc.textContent = question.text || '';

  const list = document.createElement('div');
  list.className = 'match-list';

  const feedback = document.createElement('div');
  feedback.className = 'q-feedback';

  wrap.appendChild(desc);
  wrap.appendChild(list);
  wrap.appendChild(feedback);

  mountEl.appendChild(wrap);

  const pairs = Array.isArray(question.pairs) ? question.pairs : [];
  const leftItems = pairs.map((pair) => String(pair?.left ?? ''));
  const rightItems = pairs.map((pair) => String(pair?.right ?? ''));

  const shuffledRight = [...rightItems];
  for (let i = shuffledRight.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledRight[i], shuffledRight[j]] = [shuffledRight[j], shuffledRight[i]];
  }

  if (!Array.isArray(question._matches)) {
    question._matches = leftItems.map(() => '');
  }

  list.innerHTML = '';

  leftItems.forEach((leftValue, index) => {
    const row = document.createElement('div');
    row.className = 'match-row';

    const left = document.createElement('div');
    left.className = 'match-left';
    left.textContent = leftValue || `عنصر ${index + 1}`;

    const select = document.createElement('select');
    select.className = 'input match-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'اختر المطابقة';
    select.appendChild(placeholder);

    shuffledRight.forEach((rightValue) => {
      const option = document.createElement('option');
      option.value = rightValue;
      option.textContent = rightValue || '—';
      select.appendChild(option);
    });

    select.value = question._matches[index] || '';
    select.addEventListener('change', () => {
      question._matches[index] = select.value;
    });

    row.appendChild(left);
    row.appendChild(select);
    list.appendChild(row);
  });

  function check() {
    if (!pairs.length) {
      feedback.textContent = 'لا توجد أزواج للمطابقة.';
      feedback.classList.remove('ok', 'err');
      return true;
    }

    const selections = question._matches || [];
    if (selections.some((value) => !String(value || '').trim())) {
      feedback.textContent = 'أكمل جميع المطابقات أولًا.';
      feedback.classList.remove('ok');
      feedback.classList.add('err');
      return false;
    }

    const ok = pairs.every((pair, index) => {
      const expected = String(pair?.right ?? '').trim();
      const actual = String(selections[index] ?? '').trim();
      return expected !== '' && expected === actual;
    });

    feedback.textContent = ok
      ? 'إجابات صحيحة ✅'
      : 'بعض المطابقات غير صحيحة، جرّب مرة ثانية';

    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);

    return ok;
  }

  return { check };
}
