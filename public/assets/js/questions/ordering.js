/* =========================================================
   ordering.js — Ordering Question (Tap/Drag into slots)
   - Horizontal pool + vertical slots
   - Keeps order state on question._order
   ========================================================= */

export function renderOrderingQuestion({ mountEl, question }) {
  mountEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'q q-ordering';

  const desc = document.createElement('div');
  desc.className = 'q-desc';
  desc.textContent = question.text || '';

  const pool = document.createElement('div');
  pool.className = 'ordering-pool';

  const slots = document.createElement('div');
  slots.className = 'ordering-slots';

  const feedback = document.createElement('div');
  feedback.className = 'q-feedback';

  wrap.appendChild(desc);
  wrap.appendChild(pool);
  wrap.appendChild(slots);
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

  function getInitialPool() {
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

  let order = Array.isArray(question._order)
    ? question._order.map((item) => (item == null ? null : String(item)))
    : Array(originalItems.length).fill(null);
  let poolItems = Array.isArray(question._pool)
    ? question._pool.map((item) => String(item ?? ''))
    : [];

  if (order.length !== originalItems.length) {
    order = Array(originalItems.length).fill(null);
  }

  const normalizedOriginal = originalItems.map((item) => String(item ?? ''));
  const used = new Set(order.filter(Boolean));

  if (!poolItems.length) {
    poolItems = getInitialPool();
  }

  poolItems = poolItems.filter((item) => !used.has(item));
  if (!poolItems.length && used.size !== normalizedOriginal.length) {
    poolItems = normalizedOriginal.filter((item) => !used.has(item));
  }

  question._order = order;
  question._pool = poolItems;

  pool.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  pool.addEventListener('drop', (event) => {
    event.preventDefault();
    const source = event.dataTransfer?.getData('application/x-order-source');
    if (source !== 'slot') return;
    const fromIndex = Number(event.dataTransfer?.getData('application/x-order-index'));
    if (!Number.isFinite(fromIndex)) return;
    removeFromSlot(fromIndex);
  });

  function getNextEmptyIndex() {
    return order.findIndex((item) => item == null);
  }

  function setActiveSlot() {
    const nextEmpty = getNextEmptyIndex();
    slots.querySelectorAll('.ordering-slot').forEach((slotEl, index) => {
      slotEl.classList.toggle('is-active', index === nextEmpty);
    });
  }

  function updateState(nextOrder, nextPool) {
    order = nextOrder;
    poolItems = nextPool;
    question._order = order;
    question._pool = poolItems;
    render();
  }

  function placeInSlot(value, slotIndex) {
    if (slotIndex < 0 || slotIndex >= order.length) return;
    const nextOrder = [...order];
    const nextPool = [...poolItems];

    const existing = nextOrder[slotIndex];
    if (existing) {
      nextPool.push(existing);
    }

    nextOrder[slotIndex] = value;
    const poolIndex = nextPool.indexOf(value);
    if (poolIndex !== -1) {
      nextPool.splice(poolIndex, 1);
    }

    updateState(nextOrder, nextPool);
  }

  function removeFromSlot(slotIndex) {
    const nextOrder = [...order];
    const nextPool = [...poolItems];
    const existing = nextOrder[slotIndex];
    if (!existing) return;
    nextOrder[slotIndex] = null;
    nextPool.push(existing);
    updateState(nextOrder, nextPool);
  }

  function moveSlotItem(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    if (toIndex < 0 || toIndex >= order.length) return;

    const nextOrder = [...order];
    const fromValue = nextOrder[fromIndex];
    const toValue = nextOrder[toIndex];

    nextOrder[toIndex] = fromValue ?? null;
    nextOrder[fromIndex] = toValue ?? null;

    updateState(nextOrder, [...poolItems]);
  }

  function renderPool() {
    pool.innerHTML = '';

    if (!normalizedOriginal.length) {
      const empty = document.createElement('div');
      empty.className = 'ordering-empty';
      empty.textContent = 'لا توجد عناصر للترتيب.';
      pool.appendChild(empty);
      return;
    }

    poolItems.forEach((item) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'ordering-choice';
      pill.textContent = item;
      pill.draggable = true;

      pill.addEventListener('click', () => {
        const nextEmpty = getNextEmptyIndex();
        if (nextEmpty === -1) return;
        placeInSlot(item, nextEmpty);
      });

      pill.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', item);
        event.dataTransfer?.setData('application/x-order-source', 'pool');
      });

      pool.appendChild(pill);
    });

  }

  function renderSlots() {
    slots.innerHTML = '';

    normalizedOriginal.forEach((_, index) => {
      const slot = document.createElement('div');
      slot.className = 'ordering-slot';
      slot.dataset.index = String(index);

      const value = order[index];
      if (value) {
        const pill = document.createElement('div');
        pill.className = 'ordering-slot-item';
        pill.textContent = value;
        pill.draggable = true;

        pill.addEventListener('dragstart', (event) => {
          event.dataTransfer?.setData('text/plain', value);
          event.dataTransfer?.setData('application/x-order-source', 'slot');
          event.dataTransfer?.setData('application/x-order-index', String(index));
        });

        pill.addEventListener('click', () => {
          removeFromSlot(index);
        });

        slot.appendChild(pill);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'ordering-placeholder';
        placeholder.textContent = 'ضع العنصر هنا';
        slot.appendChild(placeholder);
      }

      slot.addEventListener('dragover', (event) => {
        event.preventDefault();
        slot.classList.add('is-dragover');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('is-dragover');
      });

      slot.addEventListener('drop', (event) => {
        event.preventDefault();
        slot.classList.remove('is-dragover');
        const source = event.dataTransfer?.getData('application/x-order-source');
        const value = event.dataTransfer?.getData('text/plain');
        if (!value) return;

        if (source === 'pool') {
          placeInSlot(value, index);
          return;
        }

        if (source === 'slot') {
          const fromIndex = Number(event.dataTransfer?.getData('application/x-order-index'));
          if (!Number.isFinite(fromIndex)) return;
          moveSlotItem(fromIndex, index);
        }
      });

      slot.addEventListener('click', () => {
        if (!value) {
          const nextItem = poolItems[0];
          if (!nextItem) return;
          placeInSlot(nextItem, index);
        }
      });

      slots.appendChild(slot);
    });

    setActiveSlot();
  }

  function render() {
    renderPool();
    renderSlots();
  }

  render();

  function check() {
    if (!originalItems.length) {
      feedback.textContent = 'لا توجد عناصر للترتيب.';
      feedback.classList.remove('ok', 'err');
      return true;
    }

    if (order.some((item) => item == null)) {
      feedback.textContent = 'رتّب كل العناصر أولًا.';
      feedback.classList.remove('ok');
      feedback.classList.add('err');
      return false;
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
