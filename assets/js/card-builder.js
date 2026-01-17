import { fetchJson } from './core/api.js';
import { showToast } from './ui/toast.js';

const LS_ADMIN_SESSION = 'math:admin:session';
const LS_ADMIN_CARDS = 'math:admin:cards';
const CARDS_PATH = '/data/cards.json';

const QUESTION_TYPES = [
  { value: 'true-false', label: 'صواب وخطأ' },
  { value: 'number', label: 'ادخل الجواب (عدد)' },
  { value: 'mcq', label: 'اختيار من متعدد' },
  { value: 'matching', label: 'توصيل' },
  { value: 'ordering', label: 'ترتيب (سحب وإفلات)' },
  { value: 'short-text', label: 'إجابة قصيرة' },
  { value: 'long-text', label: 'فقرة طويلة' },
];

let cards = [];
let activeCard = null;
let dragState = null;

document.addEventListener('DOMContentLoaded', async () => {
  const sectionsList = document.getElementById('sectionsList');
  const btnAddSection = document.getElementById('btnAddSection');
  const btnSaveBuilder = document.getElementById('btnSaveBuilder');
  const inputWeek = document.getElementById('cardWeek');
  const inputTitle = document.getElementById('cardTitle');
  const inputPrereq = document.getElementById('cardPrereq');

  if (!localStorage.getItem(LS_ADMIN_SESSION)) {
    showToast('تنبيه', 'يجب تسجيل الدخول للإدارة أولًا', 'warning');
    window.setTimeout(() => {
      window.location.href = '/admin.html';
    }, 800);
    return;
  }

  const cardId = new URLSearchParams(window.location.search).get('id');
  if (!cardId) {
    showToast('خطأ', 'تعذر العثور على البطاقة المطلوبة', 'error');
    document.body.classList.remove('is-loading');
    return;
  }

  await loadCards();
  activeCard = cards.find((card) => card.id === cardId);

  if (!activeCard) {
    showToast('خطأ', 'هذه البطاقة غير موجودة', 'error');
    document.body.classList.remove('is-loading');
    return;
  }

  normalizeCard(activeCard);

  inputWeek.value = String(activeCard.week ?? '');
  inputTitle.value = String(activeCard.title ?? '');
  inputPrereq.value = activeCard.prereq == null ? '' : String(activeCard.prereq);

  document.body.classList.remove('is-loading');

  renderSections(sectionsList);

  btnAddSection?.addEventListener('click', () => {
    activeCard.form.sections.push(createSection());
    renderSections(sectionsList);
    persistCards();
  });

  btnSaveBuilder?.addEventListener('click', () => {
    persistCards();
    showToast('تم الحفظ', 'تم حفظ نموذج البطاقة بنجاح', 'success');
  });

  inputWeek?.addEventListener('input', () => {
    if (!activeCard) return;
    const cleaned = inputWeek.value.replace(/[^0-9]/g, '');
    inputWeek.value = cleaned;
    activeCard.week = cleaned === '' ? null : Number(cleaned);
    persistCards();
  });

  inputTitle?.addEventListener('input', () => {
    if (!activeCard) return;
    activeCard.title = inputTitle.value.trim();
    persistCards();
  });

  inputPrereq?.addEventListener('input', () => {
    if (!activeCard) return;
    const cleaned = inputPrereq.value.replace(/[^0-9]/g, '');
    inputPrereq.value = cleaned;
    activeCard.prereq = cleaned === '' ? null : Number(cleaned);
    persistCards();
  });

  sectionsList?.addEventListener('input', (event) => handleInput(event, sectionsList));
  sectionsList?.addEventListener('change', (event) => handleChange(event, sectionsList));
  sectionsList?.addEventListener('click', (event) => handleClick(event, sectionsList));
  sectionsList?.addEventListener('dragstart', handleDragStart);
  sectionsList?.addEventListener('dragover', handleDragOver);
  sectionsList?.addEventListener('drop', handleDrop);
  sectionsList?.addEventListener('dragend', handleDragEnd);

  function handleInput(event, container) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const scope = target.dataset.scope;
    const sectionIndex = Number(target.dataset.sectionIndex);
    if (!Number.isFinite(sectionIndex)) return;
    const section = activeCard?.form.sections[sectionIndex];
    if (!section) return;

    if (scope === 'section') {
      const field = target.dataset.field;
      if (!field) return;
      section[field] = target.value.trim();
      persistCards();
      return;
    }

    const questionIndex = Number(target.dataset.questionIndex);
    if (!Number.isFinite(questionIndex)) return;
    const question = section.questions[questionIndex];
    if (!question) return;

    const field = target.dataset.field;
    if (!field) return;

    if (field === 'prompt' || field === 'description') {
      question[field] = target.value.trim();
    } else if (field === 'answer') {
      question.answer = target.value.trim();
    } else if (field === 'numeric-answer') {
      question.answer = target.value === '' ? null : Number(target.value);
    } else if (field === 'option') {
      const optionIndex = Number(target.dataset.optionIndex);
      if (!Number.isFinite(optionIndex)) return;
      question.options[optionIndex] = target.value.trim();
    } else if (field === 'pair-left' || field === 'pair-right') {
      const pairIndex = Number(target.dataset.pairIndex);
      if (!Number.isFinite(pairIndex)) return;
      const pair = question.pairs[pairIndex];
      if (!pair) return;
      if (field === 'pair-left') pair.left = target.value.trim();
      if (field === 'pair-right') pair.right = target.value.trim();
    } else if (field === 'order-item') {
      const itemIndex = Number(target.dataset.itemIndex);
      if (!Number.isFinite(itemIndex)) return;
      question.items[itemIndex] = target.value.trim();
    }

    persistCards();
  }

  function handleChange(event, container) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const sectionIndex = Number(target.dataset.sectionIndex);
    if (!Number.isFinite(sectionIndex)) return;
    const section = activeCard?.form.sections[sectionIndex];
    if (!section) return;
    const questionIndex = Number(target.dataset.questionIndex);
    if (!Number.isFinite(questionIndex)) return;
    const question = section.questions[questionIndex];
    if (!question) return;

    const field = target.dataset.field;
    if (!field) return;

    if (field === 'type') {
      const nextType = target.value;
      section.questions[questionIndex] = applyQuestionType(question, nextType);
      persistCards();
      renderSections(container);
      return;
    }

    if (field === 'required') {
      question.required = target.checked;
      persistCards();
      return;
    }

    if (field === 'correct-index') {
      const optionIndex = Number(target.dataset.optionIndex);
      if (!Number.isFinite(optionIndex)) return;
      question.correctIndex = optionIndex;
      persistCards();
    }

    if (field === 'true-false-answer') {
      question.answer = target.value;
      persistCards();
    }
  }

  function handleClick(event, container) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = target.dataset.action;
    if (!action) return;

    const sectionIndex = Number(target.dataset.sectionIndex);
    if (!Number.isFinite(sectionIndex)) return;
    const section = activeCard?.form.sections[sectionIndex];
    if (!section) return;

    if (action === 'delete-section') {
      activeCard.form.sections.splice(sectionIndex, 1);
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'add-question') {
      const typeSelect = target.previousElementSibling;
      const type = typeSelect instanceof HTMLSelectElement ? typeSelect.value : 'mcq';
      section.questions.push(createQuestion(type));
      renderSections(container);
      persistCards();
      return;
    }

    const questionIndex = Number(target.dataset.questionIndex);
    if (!Number.isFinite(questionIndex)) return;
    const question = section.questions[questionIndex];
    if (!question) return;

    if (action === 'delete-question') {
      section.questions.splice(questionIndex, 1);
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'add-option') {
      question.options.push('');
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'remove-option') {
      const optionIndex = Number(target.dataset.optionIndex);
      if (!Number.isFinite(optionIndex)) return;
      question.options.splice(optionIndex, 1);
      if (question.correctIndex >= question.options.length) {
        question.correctIndex = Math.max(0, question.options.length - 1);
      }
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'add-pair') {
      question.pairs.push({ left: '', right: '' });
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'remove-pair') {
      const pairIndex = Number(target.dataset.pairIndex);
      if (!Number.isFinite(pairIndex)) return;
      question.pairs.splice(pairIndex, 1);
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'add-order-item') {
      question.items.push('');
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'remove-order-item') {
      const itemIndex = Number(target.dataset.itemIndex);
      if (!Number.isFinite(itemIndex)) return;
      question.items.splice(itemIndex, 1);
      renderSections(container);
      persistCards();
      return;
    }
  }
});

async function loadCards() {
  const stored = readLocalJson(LS_ADMIN_CARDS);
  if (stored && Array.isArray(stored)) {
    cards = stored;
    ensureCardsShape(cards);
    return;
  }

  const data = await fetchJson(CARDS_PATH, { noStore: true });
  cards = Array.isArray(data) ? data : [];
  ensureCardsShape(cards);
}

function renderSections(container) {
  if (!container || !activeCard) return;
  container.innerHTML = '';

  activeCard.form.sections.forEach((section, sectionIndex) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'builder-section';
    sectionEl.innerHTML = `
      <div class="builder-section-header">
        <div class="builder-question-meta">
          <div class="field">
            <label class="label">عنوان القسم</label>
            <input class="input" data-scope="section" data-field="title" data-section-index="${sectionIndex}" value="${escapeValue(section.title)}" placeholder="مثال: مقدمة" />
          </div>
          <div class="field">
            <label class="label">وصف القسم</label>
            <input class="input" data-scope="section" data-field="description" data-section-index="${sectionIndex}" value="${escapeValue(section.description)}" placeholder="نص إرشادي للقسم" />
          </div>
        </div>
        <div class="builder-section-actions">
          <select class="input" aria-label="نوع السؤال">
            ${QUESTION_TYPES.map((type) => `<option value="${type.value}">${type.label}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" type="button" data-action="add-question" data-section-index="${sectionIndex}">إضافة سؤال</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-section" data-section-index="${sectionIndex}">حذف القسم</button>
        </div>
      </div>
    `;

    const questionsWrap = document.createElement('div');
    questionsWrap.className = 'builder-sections';

    section.questions.forEach((question, questionIndex) => {
      const questionEl = document.createElement('div');
      questionEl.className = 'builder-question';
      questionEl.innerHTML = `
        <div class="builder-question-header">
          <div class="builder-question-meta">
            <div class="field">
              <label class="label">نوع السؤال</label>
              <select class="input" data-field="type" data-section-index="${sectionIndex}" data-question-index="${questionIndex}">
                ${QUESTION_TYPES.map(
                  (type) =>
                    `<option value="${type.value}" ${type.value === question.type ? 'selected' : ''}>${type.label}</option>`,
                ).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label">نص السؤال</label>
              <input class="input" data-field="prompt" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" value="${escapeValue(question.prompt)}" placeholder="اكتب السؤال هنا" />
            </div>
            <div class="field">
              <label class="label">وصف إضافي</label>
              <input class="input" data-field="description" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" value="${escapeValue(question.description)}" placeholder="شرح أو تلميح" />
            </div>
            <label class="row">
              <input type="checkbox" data-field="required" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" ${question.required ? 'checked' : ''} />
              <span class="small">سؤال مطلوب</span>
            </label>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-question" data-section-index="${sectionIndex}" data-question-index="${questionIndex}">حذف السؤال</button>
        </div>
        ${renderQuestionBody(question, sectionIndex, questionIndex)}
      `;

      questionsWrap.appendChild(questionEl);
    });

    sectionEl.appendChild(questionsWrap);
    container.appendChild(sectionEl);
  });
}

function renderQuestionBody(question, sectionIndex, questionIndex) {
  if (question.type === 'true-false') {
    return `
      <div class="field">
        <label class="label">الإجابة الصحيحة</label>
        <select class="input" data-field="true-false-answer" data-section-index="${sectionIndex}" data-question-index="${questionIndex}">
          <option value="true" ${question.answer === 'true' ? 'selected' : ''}>صواب</option>
          <option value="false" ${question.answer === 'false' ? 'selected' : ''}>خطأ</option>
        </select>
      </div>
    `;
  }

  if (question.type === 'number') {
    return `
      <div class="field">
        <label class="label">الإجابة الرقمية</label>
        <input class="input ltr" type="number" data-field="numeric-answer" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" value="${escapeValue(question.answer ?? '')}" />
      </div>
    `;
  }

  if (question.type === 'mcq') {
    return `
      <div class="builder-question-options">
        <div class="builder-helper">حدد الإجابة الصحيحة من الخيارات.</div>
        ${question.options
          .map(
            (option, optionIndex) => `
              <div class="builder-option">
                <input class="input" data-field="option" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-option-index="${optionIndex}" value="${escapeValue(option)}" placeholder="خيار ${optionIndex + 1}" />
                <div class="builder-option-controls">
                  <label class="row">
                    <input type="radio" name="mcq-correct-${sectionIndex}-${questionIndex}" data-field="correct-index" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-option-index="${optionIndex}" ${question.correctIndex === optionIndex ? 'checked' : ''} />
                    <span class="small">صحيح</span>
                  </label>
                  <button class="btn btn-ghost btn-sm" type="button" data-action="remove-option" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-option-index="${optionIndex}">حذف</button>
                </div>
              </div>
            `,
          )
          .join('')}
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-option" data-section-index="${sectionIndex}" data-question-index="${questionIndex}">إضافة خيار</button>
      </div>
    `;
  }

  if (question.type === 'matching') {
    return `
      <div class="builder-pairs">
        ${question.pairs
          .map(
            (pair, pairIndex) => `
              <div class="builder-pair">
                <input class="input" data-field="pair-left" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-pair-index="${pairIndex}" value="${escapeValue(pair.left)}" placeholder="عنصر" />
                <input class="input" data-field="pair-right" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-pair-index="${pairIndex}" value="${escapeValue(pair.right)}" placeholder="الإجابة" />
                <button class="btn btn-ghost btn-sm" type="button" data-action="remove-pair" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-pair-index="${pairIndex}">حذف</button>
              </div>
            `,
          )
          .join('')}
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-pair" data-section-index="${sectionIndex}" data-question-index="${questionIndex}">إضافة توصيل</button>
      </div>
    `;
  }

  if (question.type === 'ordering') {
    return `
      <div class="builder-order">
        <div class="builder-helper">اسحب العناصر لإعادة ترتيبها.</div>
        ${question.items
          .map(
            (item, itemIndex) => `
              <div class="builder-order-item" draggable="true" data-drag-type="ordering" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-item-index="${itemIndex}">
                <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                <input class="input" data-field="order-item" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item)}" placeholder="عنصر ${itemIndex + 1}" />
                <button class="btn btn-ghost btn-sm" type="button" data-action="remove-order-item" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" data-item-index="${itemIndex}">حذف</button>
              </div>
            `,
          )
          .join('')}
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-order-item" data-section-index="${sectionIndex}" data-question-index="${questionIndex}">إضافة عنصر ترتيب</button>
      </div>
    `;
  }

  if (question.type === 'long-text') {
    return `
      <div class="field">
        <label class="label">الإجابة المتوقعة (اختياري)</label>
        <textarea class="input" data-field="answer" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" placeholder="نص الإجابة الطويلة">${escapeValue(question.answer ?? '')}</textarea>
      </div>
    `;
  }

  return `
    <div class="field">
      <label class="label">الإجابة المتوقعة (اختياري)</label>
      <input class="input" data-field="answer" data-section-index="${sectionIndex}" data-question-index="${questionIndex}" value="${escapeValue(question.answer ?? '')}" placeholder="إجابة قصيرة" />
    </div>
  `;
}

function handleDragStart(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.dragType !== 'ordering') return;
  const sectionIndex = Number(target.dataset.sectionIndex);
  const questionIndex = Number(target.dataset.questionIndex);
  const itemIndex = Number(target.dataset.itemIndex);
  if (!Number.isFinite(sectionIndex) || !Number.isFinite(questionIndex) || !Number.isFinite(itemIndex)) return;
  dragState = { sectionIndex, questionIndex, itemIndex };
  target.classList.add('is-dragging');
}

function handleDragOver(event) {
  if (!dragState) return;
  event.preventDefault();
}

function handleDrop(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!dragState) return;
  const dropTarget = target.closest('[data-drag-type="ordering"]');
  if (!(dropTarget instanceof HTMLElement)) return;

  const sectionIndex = Number(dropTarget.dataset.sectionIndex);
  const questionIndex = Number(dropTarget.dataset.questionIndex);
  const itemIndex = Number(dropTarget.dataset.itemIndex);

  if (!Number.isFinite(sectionIndex) || !Number.isFinite(questionIndex) || !Number.isFinite(itemIndex)) return;
  if (!activeCard) return;

  const question = activeCard.form.sections[sectionIndex]?.questions[questionIndex];
  if (!question || !Array.isArray(question.items)) return;

  const [moved] = question.items.splice(dragState.itemIndex, 1);
  question.items.splice(itemIndex, 0, moved);
  dragState = null;
  persistCards();
  renderSections(document.getElementById('sectionsList'));
}

function handleDragEnd(event) {
  const target = event.target;
  if (target instanceof HTMLElement) {
    target.classList.remove('is-dragging');
  }
  dragState = null;
}

function ensureCardsShape(cardsList) {
  cardsList.forEach((card) => normalizeCard(card));
}

function normalizeCard(card) {
  if (!card.id) card.id = generateId('card');
  if (!card.form || typeof card.form !== 'object') card.form = { sections: [] };
  if (!Array.isArray(card.form.sections)) card.form.sections = [];

  card.form.sections.forEach((section) => normalizeSection(section));
}

function normalizeSection(section) {
  if (!section.id) section.id = generateId('section');
  if (!section.title) section.title = 'قسم جديد';
  if (!section.description) section.description = '';
  if (!Array.isArray(section.questions)) section.questions = [];
  section.questions.forEach((question) => applyQuestionDefaults(question));
}

function createSection() {
  return {
    id: generateId('section'),
    title: 'قسم جديد',
    description: '',
    questions: [],
  };
}

function createQuestion(type) {
  return applyQuestionType(
    {
      id: generateId('question'),
      type,
      prompt: 'سؤال جديد',
      description: '',
      required: false,
    },
    type,
  );
}

function applyQuestionType(question, type) {
  const base = {
    id: question.id || generateId('question'),
    type,
    prompt: question.prompt || 'سؤال جديد',
    description: question.description || '',
    required: question.required ?? false,
  };

  if (type === 'true-false') {
    return {
      ...base,
      answer: question.answer ?? 'true',
    };
  }

  if (type === 'number') {
    return {
      ...base,
      answer: Number.isFinite(question.answer) ? question.answer : null,
    };
  }

  if (type === 'mcq') {
    const options = Array.isArray(question.options) && question.options.length ? question.options : [''];
    return {
      ...base,
      options,
      correctIndex: Number.isFinite(question.correctIndex) ? question.correctIndex : 0,
    };
  }

  if (type === 'matching') {
    return {
      ...base,
      pairs: Array.isArray(question.pairs) && question.pairs.length ? question.pairs : [{ left: '', right: '' }],
    };
  }

  if (type === 'ordering') {
    return {
      ...base,
      items: Array.isArray(question.items) && question.items.length ? question.items : [''],
    };
  }

  return {
    ...base,
    answer: question.answer ?? '',
  };
}

function applyQuestionDefaults(question) {
  const normalized = applyQuestionType(question, question.type || 'short-text');
  Object.assign(question, normalized);
}

function persistCards() {
  try {
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
  } catch {
    showToast('خطأ', 'تعذر حفظ بيانات البطاقات في المتصفح', 'error');
  }
}

function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function generateId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeValue(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
