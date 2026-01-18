import { fetchJson } from './core/api.js';
import { normalizeDigits } from './core/normalizeDigits.js';
import { showToast } from './ui/toast.js';

const LS_ADMIN_SESSION = 'math:admin:session';
const LS_ADMIN_CARDS = 'math:admin:cards';
const CARDS_PATH = '/api/cards-mng';

const ITEM_TYPES = [
  { value: 'question', label: 'سؤال' },
  { value: 'example', label: 'مثال' },
  { value: 'explain', label: 'شرح' },
  { value: 'note', label: 'ملاحظة' },
  { value: 'goal', label: 'هدف' },
];

const QUESTION_TYPES = [
  { value: 'mcq', label: 'اختيار من متعدد' },
  { value: 'true-false', label: 'صواب وخطأ' },
  { value: 'number', label: 'ادخل الجواب (عدد)' },
  { value: 'short-text', label: 'إجابة قصيرة' },
  { value: 'long-text', label: 'فقرة طويلة' },
  { value: 'matching', label: 'توصيل' },
  { value: 'ordering', label: 'ترتيب (سحب وإفلات)' },
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
  const inputGoals = document.getElementById('cardGoals');
  const inputPrerequisites = document.getElementById('cardPrerequisites');
  const inputAssessmentTitle = document.getElementById('assessmentTitle');
  const inputAssessmentDescription = document.getElementById('assessmentDescription');

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
    const weekId = Number(cardId);
    if (Number.isFinite(weekId)) {
      activeCard = cards.find((card) => Number(card.week) === weekId);
    }
  }

  if (!activeCard) {
    showToast('خطأ', 'هذه البطاقة غير موجودة', 'error');
    document.body.classList.remove('is-loading');
    return;
  }

  normalizeCard(activeCard);

  inputWeek.value = String(activeCard.week ?? '');
  inputTitle.value = String(activeCard.title ?? '');
  inputPrereq.value = activeCard.prereq == null ? '' : String(activeCard.prereq);
  inputGoals.value = (activeCard.form.goals || []).join('\n');
  inputPrerequisites.value = (activeCard.form.prerequisites || []).join('\n');
  inputAssessmentTitle.value = activeCard.form.assessment?.title || '';
  inputAssessmentDescription.value = activeCard.form.assessment?.description || '';

  document.body.classList.remove('is-loading');

  renderSections(sectionsList);

  btnAddSection?.addEventListener('click', () => {
    activeCard.form.sections.push(createSection());
    renderSections(sectionsList);
    persistCards();
  });

  btnSaveBuilder?.addEventListener('click', async () => {
    if (!btnSaveBuilder) return;
    const original = btnSaveBuilder.textContent;
    btnSaveBuilder.disabled = true;
    btnSaveBuilder.textContent = 'جارٍ الحفظ...';
    try {
      persistCards();
      await saveWeekToApi(activeCard);
      updateCardsCache(activeCard);
      showToast('تم الحفظ', 'تم حفظ نموذج البطاقة بنجاح', 'success');
    } catch (error) {
      showToast('خطأ', error.message || 'تعذر حفظ نموذج البطاقة', 'error');
    } finally {
      btnSaveBuilder.disabled = false;
      btnSaveBuilder.textContent = original || 'حفظ النموذج';
    }
  });

  inputWeek?.addEventListener('input', () => {
    if (!activeCard) return;
    const cleaned = normalizeDigits(inputWeek.value).replace(/[^0-9]/g, '');
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
    const cleaned = normalizeDigits(inputPrereq.value).replace(/[^0-9]/g, '');
    inputPrereq.value = cleaned;
    activeCard.prereq = cleaned === '' ? null : Number(cleaned);
    persistCards();
  });

  inputGoals?.addEventListener('input', () => {
    if (!activeCard) return;
    activeCard.form.goals = splitLines(inputGoals.value);
    persistCards();
  });

  inputPrerequisites?.addEventListener('input', () => {
    if (!activeCard) return;
    activeCard.form.prerequisites = splitLines(inputPrerequisites.value);
    persistCards();
  });

  inputAssessmentTitle?.addEventListener('input', () => {
    if (!activeCard) return;
    activeCard.form.assessment.title = inputAssessmentTitle.value.trim();
    persistCards();
  });

  inputAssessmentDescription?.addEventListener('input', () => {
    if (!activeCard) return;
    activeCard.form.assessment.description = inputAssessmentDescription.value.trim();
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

    const itemIndex = Number(target.dataset.itemIndex);
    if (!Number.isFinite(itemIndex)) return;
    const item = section.items[itemIndex];
    if (!item) return;

    const field = target.dataset.field;
    if (!field) return;

    if (item.type !== 'question') {
      if (field === 'text') {
        item.text = target.value.trim();
      } else if (field === 'details') {
        item.details = splitLines(target.value);
      }
      persistCards();
      return;
    }

    if (field === 'prompt' || field === 'description') {
      item[field] = target.value.trim();
    } else if (field === 'answer') {
      item.answer = target.value.trim();
    } else if (field === 'numeric-answer') {
      item.answer = target.value === '' ? null : Number(target.value);
    } else if (field === 'option') {
      const optionIndex = Number(target.dataset.optionIndex);
      if (!Number.isFinite(optionIndex)) return;
      item.options[optionIndex] = target.value.trim();
    } else if (field === 'pair-left' || field === 'pair-right') {
      const pairIndex = Number(target.dataset.pairIndex);
      if (!Number.isFinite(pairIndex)) return;
      const pair = item.pairs[pairIndex];
      if (!pair) return;
      if (field === 'pair-left') pair.left = target.value.trim();
      if (field === 'pair-right') pair.right = target.value.trim();
    } else if (field === 'order-item') {
      const listIndex = Number(target.dataset.listIndex);
      if (!Number.isFinite(listIndex)) return;
      item.items[listIndex] = target.value.trim();
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
    const itemIndex = Number(target.dataset.itemIndex);
    if (!Number.isFinite(itemIndex)) return;
    const item = section.items[itemIndex];
    if (!item) return;

    const field = target.dataset.field;
    if (!field) return;

    if (field === 'question-type') {
      const nextType = target.value;
      section.items[itemIndex] = applyQuestionType(item, nextType);
      persistCards();
      renderSections(container);
      return;
    }

    if (field === 'required') {
      item.required = target.checked;
      persistCards();
      return;
    }

    if (field === 'correct-index') {
      const optionIndex = Number(target.dataset.optionIndex);
      if (!Number.isFinite(optionIndex)) return;
      item.correctIndex = optionIndex;
      persistCards();
    }

    if (field === 'true-false-answer') {
      item.answer = target.value;
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

    if (action === 'add-item') {
      const typeSelect = target.previousElementSibling;
      const itemType = typeSelect instanceof HTMLSelectElement ? typeSelect.value : 'question';
      section.items.push(createItem(itemType));
      renderSections(container);
      persistCards();
      return;
    }

    const itemIndex = Number(target.dataset.itemIndex);
    if (!Number.isFinite(itemIndex)) return;
    const item = section.items[itemIndex];
    if (!item) return;

    if (action === 'delete-item') {
      section.items.splice(itemIndex, 1);
      renderSections(container);
      persistCards();
      return;
    }

    if (item.type !== 'question') return;

    if (action === 'add-option') {
      item.options.push('');
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'remove-option') {
      const optionIndex = Number(target.dataset.optionIndex);
      if (!Number.isFinite(optionIndex)) return;
      item.options.splice(optionIndex, 1);
      if (item.correctIndex >= item.options.length) {
        item.correctIndex = Math.max(0, item.options.length - 1);
      }
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'add-pair') {
      item.pairs.push({ left: '', right: '' });
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'remove-pair') {
      const pairIndex = Number(target.dataset.pairIndex);
      if (!Number.isFinite(pairIndex)) return;
      item.pairs.splice(pairIndex, 1);
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'add-order-item') {
      item.items.push('');
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'remove-order-item') {
      const listIndex = Number(target.dataset.listIndex);
      if (!Number.isFinite(listIndex)) return;
      item.items.splice(listIndex, 1);
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
  }

  try {
    const data = await fetchJson(CARDS_PATH, { noStore: true });
    const list = Array.isArray(data) ? data : data?.cards;
    if (Array.isArray(list)) {
      cards = list;
      ensureCardsShape(cards);
      persistCards();
    }
  } catch (error) {
    showToast('تنبيه', 'تعذر تحميل بيانات البطاقات من الخادم', 'warning');
  }
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
            ${ITEM_TYPES.map((type) => `<option value="${type.value}">${type.label}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" type="button" data-action="add-item" data-section-index="${sectionIndex}">إضافة عنصر</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-section" data-section-index="${sectionIndex}">حذف القسم</button>
        </div>
      </div>
    `;

    const questionsWrap = document.createElement('div');
    questionsWrap.className = 'builder-sections';

    section.items.forEach((item, itemIndex) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'builder-question';
      itemEl.innerHTML = `
        <div class="builder-question-header">
          <div class="builder-question-meta">
            ${item.type === 'question'
              ? `
            <div class="field">
              <label class="label">نوع السؤال</label>
              <select class="input" data-field="question-type" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">
                ${QUESTION_TYPES.map(
                  (type) =>
                    `<option value="${type.value}" ${type.value === item.questionType ? 'selected' : ''}>${type.label}</option>`,
                ).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label">نص السؤال</label>
              <input class="input" data-field="prompt" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.prompt)}" placeholder="اكتب السؤال هنا" />
            </div>
            <div class="field">
              <label class="label">وصف إضافي</label>
              <input class="input" data-field="description" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.description)}" placeholder="شرح أو تلميح" />
            </div>
            <label class="row">
              <input type="checkbox" data-field="required" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" ${item.required ? 'checked' : ''} />
              <span class="small">سؤال مطلوب</span>
            </label>
            `
              : `
            <div class="field">
              <label class="label">نص العنصر</label>
              <textarea class="input" data-field="text" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" placeholder="اكتب النص هنا">${escapeValue(item.text ?? '')}</textarea>
            </div>
            <div class="field">
              <label class="label">تفاصيل إضافية</label>
              <textarea class="input" rows="2" data-field="details" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" placeholder="كل تفصيل في سطر">${escapeValue((item.details || []).join('\n'))}</textarea>
            </div>
            `}
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">حذف العنصر</button>
        </div>
        ${item.type === 'question' ? renderQuestionBody(item, sectionIndex, itemIndex) : ''}
      `;

      questionsWrap.appendChild(itemEl);
    });

    sectionEl.appendChild(questionsWrap);
    container.appendChild(sectionEl);
  });
}

function renderQuestionBody(item, sectionIndex, itemIndex) {
  if (item.questionType === 'true-false') {
    return `
      <div class="field">
        <label class="label">الإجابة الصحيحة</label>
        <select class="input" data-field="true-false-answer" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">
          <option value="true" ${item.answer === 'true' ? 'selected' : ''}>صواب</option>
          <option value="false" ${item.answer === 'false' ? 'selected' : ''}>خطأ</option>
        </select>
      </div>
    `;
  }

  if (item.questionType === 'number') {
    return `
      <div class="field">
        <label class="label">الإجابة الرقمية</label>
        <input class="input ltr" type="number" data-field="numeric-answer" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.answer ?? '')}" />
      </div>
    `;
  }

  if (item.questionType === 'mcq') {
    return `
      <div class="builder-question-options">
        <div class="builder-helper">حدد الإجابة الصحيحة من الخيارات.</div>
        ${item.options
          .map(
            (option, optionIndex) => `
              <div class="builder-option">
                <input class="input" data-field="option" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-option-index="${optionIndex}" value="${escapeValue(option)}" placeholder="خيار ${optionIndex + 1}" />
                <div class="builder-option-controls">
                  <label class="row">
                    <input type="radio" name="mcq-correct-${sectionIndex}-${itemIndex}" data-field="correct-index" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-option-index="${optionIndex}" ${item.correctIndex === optionIndex ? 'checked' : ''} />
                    <span class="small">صحيح</span>
                  </label>
                  <button class="btn btn-ghost btn-sm" type="button" data-action="remove-option" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-option-index="${optionIndex}">حذف</button>
                </div>
              </div>
            `,
          )
          .join('')}
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-option" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">إضافة خيار</button>
      </div>
    `;
  }

  if (item.questionType === 'matching') {
    return `
      <div class="builder-pairs">
        ${item.pairs
          .map(
            (pair, pairIndex) => `
              <div class="builder-pair">
                <input class="input" data-field="pair-left" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-pair-index="${pairIndex}" value="${escapeValue(pair.left)}" placeholder="عنصر" />
                <input class="input" data-field="pair-right" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-pair-index="${pairIndex}" value="${escapeValue(pair.right)}" placeholder="الإجابة" />
                <button class="btn btn-ghost btn-sm" type="button" data-action="remove-pair" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-pair-index="${pairIndex}">حذف</button>
              </div>
            `,
          )
          .join('')}
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-pair" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">إضافة توصيل</button>
      </div>
    `;
  }

  if (item.questionType === 'ordering') {
    return `
      <div class="builder-order">
        <div class="builder-helper">اسحب العناصر لإعادة ترتيبها.</div>
        ${item.items
          .map(
            (orderItem, listIndex) => `
              <div class="builder-order-item" draggable="true" data-drag-type="ordering" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-list-index="${listIndex}">
                <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                <input class="input" data-field="order-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-list-index="${listIndex}" value="${escapeValue(orderItem)}" placeholder="عنصر ${listIndex + 1}" />
                <button class="btn btn-ghost btn-sm" type="button" data-action="remove-order-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-list-index="${listIndex}">حذف</button>
              </div>
            `,
          )
          .join('')}
        <button class="btn btn-ghost btn-sm" type="button" data-action="add-order-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">إضافة عنصر ترتيب</button>
      </div>
    `;
  }

  if (item.questionType === 'long-text') {
    return `
      <div class="field">
        <label class="label">الإجابة المتوقعة (اختياري)</label>
        <textarea class="input" data-field="answer" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" placeholder="نص الإجابة الطويلة">${escapeValue(item.answer ?? '')}</textarea>
      </div>
    `;
  }

  return `
    <div class="field">
      <label class="label">الإجابة المتوقعة (اختياري)</label>
      <input class="input" data-field="answer" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.answer ?? '')}" placeholder="إجابة قصيرة" />
    </div>
  `;
}

function handleDragStart(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.dragType !== 'ordering') return;
  const sectionIndex = Number(target.dataset.sectionIndex);
  const itemIndex = Number(target.dataset.itemIndex);
  const listIndex = Number(target.dataset.listIndex);
  if (!Number.isFinite(sectionIndex) || !Number.isFinite(itemIndex) || !Number.isFinite(listIndex)) return;
  dragState = { sectionIndex, itemIndex, listIndex };
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
  const itemIndex = Number(dropTarget.dataset.itemIndex);
  const listIndex = Number(dropTarget.dataset.listIndex);

  if (!Number.isFinite(sectionIndex) || !Number.isFinite(itemIndex) || !Number.isFinite(listIndex)) return;
  if (!activeCard) return;

  const item = activeCard.form.sections[sectionIndex]?.items[itemIndex];
  if (!item || !Array.isArray(item.items)) return;

  const [moved] = item.items.splice(dragState.listIndex, 1);
  item.items.splice(listIndex, 0, moved);
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
  if (!card.id) {
    card.id = card.week != null ? `week-${card.week}` : generateId('card');
  }
  if (!card.form || typeof card.form !== 'object') {
    card.form = {
      sections: [],
      goals: [],
      prerequisites: [],
      assessment: { title: '', description: '' },
    };
  }
  if (!Array.isArray(card.form.sections)) card.form.sections = [];
  if (!Array.isArray(card.form.goals)) card.form.goals = [];
  if (!Array.isArray(card.form.prerequisites)) card.form.prerequisites = [];
  if (!card.form.assessment || typeof card.form.assessment !== 'object') {
    card.form.assessment = { title: '', description: '' };
  }

  card.form.sections.forEach((section) => normalizeSection(section));
}

function normalizeSection(section) {
  if (!section.id) section.id = generateId('section');
  if (!section.title) section.title = 'قسم جديد';
  if (!section.description) section.description = '';
  if (!Array.isArray(section.items)) {
    const legacyQuestions = Array.isArray(section.questions) ? section.questions : [];
    section.items = legacyQuestions.map((question) => ({
      ...applyQuestionType(question, question.type || question.questionType || 'short-text'),
      type: 'question',
      questionType: question.type || question.questionType || 'short-text',
    }));
    delete section.questions;
  }
  section.items.forEach((item) => applyItemDefaults(item));
}

function createSection() {
  return {
    id: generateId('section'),
    title: 'قسم جديد',
    description: '',
    items: [],
  };
}

function createItem(type) {
  if (type === 'question') {
    return createQuestionItem('mcq');
  }

  return {
    id: generateId('item'),
    type,
    text: '',
    details: [],
  };
}

function createQuestionItem(questionType) {
  return applyQuestionType(
    {
      id: generateId('question'),
      type: 'question',
      questionType,
      prompt: 'سؤال جديد',
      description: '',
      required: false,
    },
    questionType,
  );
}

function applyQuestionType(question, questionType) {
  const base = {
    id: question.id || generateId('question'),
    type: 'question',
    questionType,
    prompt: question.prompt || 'سؤال جديد',
    description: question.description || '',
    required: question.required ?? false,
  };

  if (questionType === 'true-false') {
    return {
      ...base,
      answer: question.answer ?? 'true',
    };
  }

  if (questionType === 'number') {
    return {
      ...base,
      answer: Number.isFinite(question.answer) ? question.answer : null,
    };
  }

  if (questionType === 'mcq') {
    const options = Array.isArray(question.options) && question.options.length ? question.options : [''];
    return {
      ...base,
      options,
      correctIndex: Number.isFinite(question.correctIndex) ? question.correctIndex : 0,
    };
  }

  if (questionType === 'matching') {
    return {
      ...base,
      pairs: Array.isArray(question.pairs) && question.pairs.length ? question.pairs : [{ left: '', right: '' }],
    };
  }

  if (questionType === 'ordering') {
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

function applyItemDefaults(item) {
  if (item.type === 'question') {
    const normalized = applyQuestionType(item, item.questionType || 'short-text');
    Object.assign(item, normalized);
    return;
  }

  item.id = item.id || generateId('item');
  item.type = item.type || 'note';
  item.text = item.text ?? '';
  item.details = Array.isArray(item.details) ? item.details : [];
}

function persistCards() {
  try {
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
  } catch {
    showToast('خطأ', 'تعذر حفظ بيانات البطاقات في المتصفح', 'error');
  }
}

async function saveWeekToApi(card) {
  if (!card?.week) {
    throw new Error('رقم الأسبوع مطلوب قبل الحفظ');
  }

  const payload = buildWeekPayload(card);
  await fetchJson(`/api/weeks/${encodeURIComponent(card.week)}`, {
    method: 'PUT',
    body: payload,
  });
}

function buildWeekPayload(card) {
  const goals = Array.isArray(card.form.goals) ? card.form.goals : [];
  const prerequisites = Array.isArray(card.form.prerequisites)
    ? card.form.prerequisites
    : [];

  const concepts = card.form.sections.map((section) => ({
    title: section.title || 'قسم',
    flow: section.items.map((item) => mapItemToFlow(item)),
  }));

  const assessmentQuestions = card.form.sections.flatMap((section) =>
    section.items
      .filter((item) => item.type === 'question')
      .map((item) => mapQuestionToAssessment(item)),
  );

  return {
    week: Number(card.week),
    title: String(card.title || '').trim(),
    prereq: card.prereq == null ? null : Number(card.prereq),
    goals,
    prerequisites,
    concepts,
    assessment: {
      title: card.form.assessment?.title || `تقييم الأسبوع ${card.week}`,
      description: card.form.assessment?.description || '',
      questions: assessmentQuestions,
    },
  };
}

function mapItemToFlow(item) {
  if (item.type !== 'question') {
    const mapped = {
      type: item.type || 'note',
      text: item.text || '',
    };
    if (Array.isArray(item.details) && item.details.length) {
      mapped.details = item.details;
    }
    return mapped;
  }

  return mapQuestionToFlow(item);
}

function mapQuestionToFlow(question) {
  const base = {
    type: 'question',
    text: question.prompt || 'سؤال',
    title: question.description || '',
  };

  if (question.questionType === 'mcq') {
    return {
      ...base,
      choices: Array.isArray(question.options) ? question.options : [],
      correctIndex: Number.isFinite(question.correctIndex) ? question.correctIndex : 0,
    };
  }

  if (question.questionType === 'true-false') {
    return {
      ...base,
      choices: ['صواب', 'خطأ'],
      correctIndex: question.answer === 'false' ? 1 : 0,
    };
  }

  if (question.questionType === 'number') {
    return { ...base, answer: question.answer == null ? '' : String(question.answer) };
  }

  return { ...base, answer: question.answer ?? '' };
}

function mapQuestionToAssessment(question) {
  if (question.questionType === 'mcq') {
    return {
      type: 'mcq',
      text: question.prompt || 'سؤال',
      choices: Array.isArray(question.options) ? question.options : [],
      correctIndex: Number.isFinite(question.correctIndex) ? question.correctIndex : 0,
      points: 1,
    };
  }

  if (question.questionType === 'true-false') {
    return {
      type: 'mcq',
      text: question.prompt || 'سؤال',
      choices: ['صواب', 'خطأ'],
      correctIndex: question.answer === 'false' ? 1 : 0,
      points: 1,
    };
  }

  return {
    type: 'input',
    text: question.prompt || 'سؤال',
    answer: question.answer == null ? '' : String(question.answer),
    points: 1,
  };
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function updateCardsCache(card) {
  const stored = readLocalJson(LS_ADMIN_CARDS);
  const list = Array.isArray(stored) ? stored : [];
  const index = list.findIndex((item) => String(item.id) === String(card.id));
  const normalized = {
    ...card,
    week: card.week,
    title: card.title,
    prereq: card.prereq,
  };

  if (index === -1) {
    list.unshift(normalized);
  } else {
    list[index] = normalized;
  }

  try {
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(list));
  } catch {}
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
