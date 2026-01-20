/* =========================================================
   ordering.js — Ordering Question (Move up/down)
   - Keeps order state on question._order
   ========================================================= */

export function renderOrderingQuestion({ mountEl, question }) {
  mountEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'q q-ordering';

  const desc = document.createElement('div');
  desc.className = 'q-desc';
  desc.textContent = question.text || '';

  const list = document.createElement('div');
  list.className = 'ordering-list';

  const feedback = document.createElement('div');
  feedback.className = 'q-feedback';

  wrap.appendChild(desc);
  wrap.appendChild(list);
  wrap.appendChild(feedback);

  mountEl.appendChild(wrap);

  const originalItems = Array.isArray(question.items)
    ? question.items
    : Array.isArray(question.choices)
      ? question.choices
      : [];

  function normalizeValue(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function getInitialOrder() {
    const items = originalItems.map((item) => String(item ?? ''));
    if (!items.length) return [];

    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const sameOrder = shuffled.every((item, index) => item === items[index]);
    if (sameOrder && shuffled.length > 1) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }

    return shuffled;
  }

  let order = Array.isArray(question._order) && question._order.length
    ? question._order.map((item) => String(item ?? ''))
    : getInitialOrder();

  if (order.length !== originalItems.length) {
    order = getInitialOrder();
  }

  question._order = order;

  function updateOrder(nextOrder) {
    order = nextOrder;
    question._order = order;
    renderList();
  }

  function moveItem(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= order.length) return;
    const nextOrder = [...order];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    updateOrder(nextOrder);
  }

  function renderList() {
    list.innerHTML = '';

    if (!order.length) {
      const empty = document.createElement('div');
      empty.className = 'ordering-empty';
      empty.textContent = 'لا توجد عناصر للترتيب.';
      list.appendChild(empty);
      return;
    }

    order.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'ordering-item';

      const label = document.createElement('div');
      label.className = 'ordering-label';
      label.textContent = item;

      const controls = document.createElement('div');
      controls.className = 'ordering-controls';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'ordering-btn';
      btnUp.textContent = '▲';
      btnUp.disabled = index === 0;
      btnUp.addEventListener('click', () => moveItem(index, index - 1));

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'ordering-btn';
      btnDown.textContent = '▼';
      btnDown.disabled = index === order.length - 1;
      btnDown.addEventListener('click', () => moveItem(index, index + 1));

      controls.appendChild(btnUp);
      controls.appendChild(btnDown);

      row.appendChild(label);
      row.appendChild(controls);
      list.appendChild(row);
    });
  }

  renderList();

  function check() {
    if (!originalItems.length) {
      feedback.textContent = 'لا توجد عناصر للترتيب.';
      feedback.classList.remove('ok', 'err');
      return true;
    }

    const normalizedOrder = order.map(normalizeValue);
    const normalizedCorrect = originalItems.map(normalizeValue);
    const ok = normalizedOrder.every((value, index) => value === normalizedCorrect[index]);

    feedback.textContent = ok
      ? 'ترتيب صحيح ✅'
      : 'الترتيب غير صحيح، جرّب مرة ثانية';

    feedback.classList.toggle('ok', ok);
    feedback.classList.toggle('err', !ok);

    return ok;
  }

  return { check };
}
