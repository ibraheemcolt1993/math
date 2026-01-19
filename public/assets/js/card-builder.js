import { fetchJson } from './core/api.js';
import { normalizeDigits } from './core/normalizeDigits.js';
import { showToast } from './ui/toast.js';

const LS_ADMIN_SESSION = 'math:admin:session';
const LS_ADMIN_CARDS = 'math:admin:cards';
const CARDS_PATH = '/api/cards-mng';

const ITEM_TYPES = [
  { value: 'question', label: 'سؤال' },
  { value: 'example', label: 'مثال' },
  { value: 'non-example', label: 'لا مثال' },
  { value: 'explain', label: 'شرح' },
  { value: 'note', label: 'ملاحظة' },
  { value: 'goal', label: 'هدف' },
  { value: 'image', label: 'صورة' },
  { value: 'video', label: 'فيديو يوتيوب' },
];

const SECTION_TYPES = [
  { value: 'goal', label: 'هدف' },
  { value: 'prereq', label: 'متطلب سابق' },
  { value: 'goals', label: 'أهداف البطاقة' },
  { value: 'assessment', label: 'اختبر نفسي' },
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
let lastAutoSaveAttempt = 0;
let lastAutoSaveResult = 0;
const AUTO_SAVE_TOAST_WINDOW = 8000;

document.addEventListener('DOMContentLoaded', async () => {
  const sectionsList = document.getElementById('sectionsList');
  const inputWeek = document.getElementById('cardWeek');
  const inputClass = document.getElementById('cardClass');
  const inputSections = document.getElementById('cardSections');
  const inputTitle = document.getElementById('cardTitle');
  const inputPrereq = document.getElementById('cardPrereq');
  const inputAssessmentTitle = document.getElementById('assessmentTitle');
  const inputAssessmentDescription = document.getElementById('assessmentDescription');
  const goalsList = document.getElementById('goalsList');
  const prereqsList = document.getElementById('prereqsList');
  const btnAddGoal = document.getElementById('btnAddGoal');
  const btnAddPrereq = document.getElementById('btnAddPrereq');
  const toolbarSave = document.getElementById('toolbarSave');
  const floatingSave = document.getElementById('floatingSave');
  const floatingApply = document.getElementById('floatingApply');
  const floatingPreview = document.getElementById('floatingPreview');
  const floatingAdd = document.getElementById('floatingAdd');
  const floatingMenu = document.getElementById('floatingMenu');
  const builderLoading = document.getElementById('builderLoading');

  let saveState = 'saved';
  let saveTimer = null;
  let activeContext = 'card';
  let activeSectionIndex = null;
  let activeItemIndex = null;
  let isInitializing = true;
  let isNewCard = false;
  let hasPendingChanges = false;
  let isApplied = true;

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
    setLoading(builderLoading, false);
    document.body.classList.remove('is-loading');
    return;
  }

  setLoading(builderLoading, true, 'جاري تحميل بيانات البطاقة...');
  await loadCards();
  activeCard = cards.find((card) => card.id === cardId);
  if (!activeCard) {
    const weekId = Number(cardId);
    if (Number.isFinite(weekId)) {
      activeCard = cards.find((card) => Number(card.week) === weekId);
      if (!activeCard) {
        activeCard = {
          id: `week-${weekId}`,
          week: weekId,
          title: '',
          prereq: null,
          className: '',
          sections: [],
          form: {
            sections: [],
            goals: [],
            prerequisites: [],
            assessment: { title: '', description: '' },
          },
        };
        isNewCard = true;
        cards.unshift(activeCard);
        persistCards();
      }
    }
  }

  if (!activeCard) {
    showToast('خطأ', 'هذه البطاقة غير موجودة', 'error');
    setLoading(builderLoading, false);
    document.body.classList.remove('is-loading');
    return;
  }

  normalizeCard(activeCard);

  inputWeek.value = String(activeCard.week ?? '');
  inputClass.value = String(activeCard.className ?? '');
  inputSections.value = Array.isArray(activeCard.sections) ? activeCard.sections.join('، ') : '';
  inputTitle.value = String(activeCard.title ?? '');
  inputPrereq.value = activeCard.prereq == null ? '' : String(activeCard.prereq);
  inputAssessmentTitle.value = activeCard.form.assessment?.title || '';
  inputAssessmentDescription.value = activeCard.form.assessment?.description || '';

  document.body.classList.remove('is-loading');
  setLoading(builderLoading, false);

  renderGoals();
  renderPrereqs();
  renderSections(sectionsList);
  setSaveState(isNewCard ? 'dirty' : 'saved');
  if (isNewCard) {
    hasPendingChanges = true;
    isApplied = false;
  }
  isInitializing = false;
  updateSaveControls();

  inputWeek?.addEventListener('input', () => {
    if (!activeCard) return;
    const cleaned = normalizeDigits(inputWeek.value).replace(/[^0-9]/g, '');
    inputWeek.value = cleaned;
    activeCard.week = cleaned === '' ? null : Number(cleaned);
    persistCards();
  });

  inputClass?.addEventListener('input', () => {
    if (!activeCard) return;
    activeCard.className = inputClass.value.trim();
    persistCards();
  });

  inputSections?.addEventListener('input', () => {
    if (!activeCard) return;
    activeCard.sections = splitInlineList(inputSections.value);
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

  goalsList?.addEventListener('input', (event) => handleGoalInput(event));
  goalsList?.addEventListener('click', (event) => handleGoalActions(event));
  prereqsList?.addEventListener('input', (event) => handlePrereqInput(event));
  prereqsList?.addEventListener('click', (event) => handlePrereqActions(event));
  btnAddGoal?.addEventListener('click', () => addGoal());
  btnAddPrereq?.addEventListener('click', () => addPrereq());

  floatingSave?.addEventListener('click', async () => {
    await manualSave();
  });

  toolbarSave?.addEventListener('click', async () => {
    await manualSave();
  });

  floatingApply?.addEventListener('click', () => {
    applyChanges();
  });

  floatingPreview?.addEventListener('click', () => {
    previewCard();
  });

  floatingAdd?.addEventListener('click', () => {
    toggleFloatingMenu();
  });

  document.addEventListener('click', (event) => {
    if (!floatingMenu || floatingMenu.classList.contains('hidden')) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('#floatingMenu') || target.closest('#floatingAdd')) return;
    hideFloatingMenu();
  });

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const contextEl = target.closest('[data-context]');
    if (contextEl) {
      activeContext = contextEl.getAttribute('data-context') || 'card';
    }
    const sectionIndex = target.closest('[data-section-index]')?.getAttribute('data-section-index');
    const itemIndex = target.closest('[data-item-index]')?.getAttribute('data-item-index');
    activeSectionIndex = sectionIndex != null ? Number(sectionIndex) : null;
    activeItemIndex = itemIndex != null ? Number(itemIndex) : null;
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
      } else if (field === 'url') {
        item.url = target.value.trim();
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
    } else if (field === 'points') {
      item.points = target.value === '' ? 1 : Number(target.value);
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
    } else if (field === 'hint') {
      const hintIndex = Number(target.dataset.hintIndex);
      if (!Number.isFinite(hintIndex)) return;
      if (!Array.isArray(item.hints)) item.hints = [];
      item.hints[hintIndex] = target.value.trim();
    } else if (field === 'solution') {
      item.solution = target.value.trim();
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

    const field = target.dataset.field;
    if (!field) return;

    if (field === 'section-type') {
      section.sectionType = target.value;
      persistCards();
      return;
    }

    if (field === 'section-goal') {
      section.goalIndex = Number(target.value);
      persistCards();
      return;
    }

    const itemIndex = Number(target.dataset.itemIndex);
    if (!Number.isFinite(itemIndex)) return;
    const item = section.items[itemIndex];
    if (!item) return;

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

    if (action === 'duplicate-section') {
      const cloned = cloneData(section);
      cloned.id = generateId('section');
      activeCard.form.sections.splice(sectionIndex + 1, 0, cloned);
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

    if (action === 'duplicate-item') {
      const cloned = cloneData(item);
      cloned.id = generateId(item.type === 'question' ? 'question' : 'item');
      section.items.splice(itemIndex + 1, 0, cloned);
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'toggle-item') {
      item.isCollapsed = !item.isCollapsed;
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

    if (action === 'add-hint') {
      if (!Array.isArray(item.hints)) item.hints = [];
      if (item.hints.length < 2) {
        item.hints.push('');
        renderSections(container);
        persistCards();
      }
      return;
    }

    if (action === 'add-solution') {
      item.solution = item.solution || '';
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'set-true') {
      item.answer = 'true';
      renderSections(container);
      persistCards();
      return;
    }

    if (action === 'set-false') {
      item.answer = 'false';
      renderSections(container);
      persistCards();
      return;
    }
  }
});

function renderGoals() {
  const list = document.getElementById('goalsList');
  if (!list || !activeCard) return;
  list.innerHTML = '';

  (activeCard.form.goals || []).forEach((goal, index) => {
    const el = document.createElement('div');
    el.className = 'builder-question';
    el.innerHTML = `
      <div class="builder-question-header">
        <div class="builder-question-meta">
          <div class="field">
            <label class="label">هدف تعليمي</label>
            <input class="input" data-scope="goal" data-index="${index}" value="${escapeValue(goal)}" placeholder="اكتب الهدف هنا" />
          </div>
        </div>
        <div class="builder-card-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="duplicate-goal" data-index="${index}">تكرار</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-goal" data-index="${index}">حذف</button>
        </div>
      </div>
    `;
    list.appendChild(el);
  });
}

function renderPrereqs() {
  const list = document.getElementById('prereqsList');
  if (!list || !activeCard) return;
  list.innerHTML = '';

  (activeCard.form.prerequisites || []).forEach((prereq, index) => {
    const el = document.createElement('div');
    el.className = 'builder-question';
    el.innerHTML = `
      <div class="builder-question-header">
        <div class="builder-question-meta">
          <div class="field">
            <label class="label">متطلب سابق</label>
            <input class="input" data-scope="prereq" data-index="${index}" value="${escapeValue(prereq)}" placeholder="اكتب المتطلب هنا" />
          </div>
        </div>
        <div class="builder-card-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="duplicate-prereq" data-index="${index}">تكرار</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-prereq" data-index="${index}">حذف</button>
        </div>
      </div>
    `;
    list.appendChild(el);
  });
}

function handleGoalInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const index = Number(target.dataset.index);
  if (!Number.isFinite(index) || !activeCard) return;
  activeCard.form.goals[index] = target.value.trim();
  persistCards();
  renderSections(document.getElementById('sectionsList'));
}

function handleGoalActions(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset.action;
  const index = Number(target.dataset.index);
  if (!Number.isFinite(index) || !activeCard) return;

  if (action === 'delete-goal') {
    activeCard.form.goals.splice(index, 1);
    renderGoals();
    renderSections(document.getElementById('sectionsList'));
    persistCards();
  }

  if (action === 'duplicate-goal') {
    const value = activeCard.form.goals[index] || '';
    activeCard.form.goals.splice(index + 1, 0, value);
    renderGoals();
    renderSections(document.getElementById('sectionsList'));
    persistCards();
  }
}

function handlePrereqInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const index = Number(target.dataset.index);
  if (!Number.isFinite(index) || !activeCard) return;
  activeCard.form.prerequisites[index] = target.value.trim();
  persistCards();
}

function handlePrereqActions(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset.action;
  const index = Number(target.dataset.index);
  if (!Number.isFinite(index) || !activeCard) return;

  if (action === 'delete-prereq') {
    activeCard.form.prerequisites.splice(index, 1);
    renderPrereqs();
    persistCards();
  }

  if (action === 'duplicate-prereq') {
    const value = activeCard.form.prerequisites[index] || '';
    activeCard.form.prerequisites.splice(index + 1, 0, value);
    renderPrereqs();
    persistCards();
  }
}

async function loadCards() {
  const stored = readLocalJson(LS_ADMIN_CARDS);
  if (stored && Array.isArray(stored)) {
    cards = stored;
    ensureCardsShape(cards);
  }

  try {
    showToast('جاري التحميل', 'جاري تحميل بيانات البطاقات', 'info');
    const data = await fetchJson(CARDS_PATH, { noStore: true });
    const list = Array.isArray(data) ? data : data?.cards;
    if (Array.isArray(list)) {
      cards = list;
      ensureCardsShape(cards);
      persistCards();
    }
    showToast('تم التحميل', 'تم تحميل بيانات البطاقات بنجاح', 'success');
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
            <label class="label">نوع القسم</label>
            <select class="input" data-field="section-type" data-section-index="${sectionIndex}">
              ${SECTION_TYPES.map(
                (type) =>
                  `<option value="${type.value}" ${type.value === section.sectionType ? 'selected' : ''}>${type.label}</option>`,
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label class="label">الهدف المرتبط</label>
            <select class="input" data-field="section-goal" data-section-index="${sectionIndex}">
              ${(activeCard.form.goals || []).length
                ? activeCard.form.goals
                  .map((goal, goalIndex) => `
                    <option value="${goalIndex}" ${goalIndex === section.goalIndex ? 'selected' : ''}>
                      ${escapeValue(goal || `الهدف ${goalIndex + 1}`)}
                    </option>
                  `)
                  .join('')
                : '<option value="0">أضف هدفًا أولًا</option>'}
            </select>
          </div>
          <div class="field">
            <label class="label">عنوان القسم</label>
            <input class="input" data-scope="section" data-field="title" data-section-index="${sectionIndex}" value="${escapeValue(section.title)}" placeholder="مثال: مقدمة" />
          </div>
          <div class="field">
            <label class="label">وصف القسم</label>
            <input class="input" data-scope="section" data-field="description" data-section-index="${sectionIndex}" value="${escapeValue(section.description)}" placeholder="نص إرشادي للقسم" />
          </div>
        </div>
        <div class="builder-card-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="duplicate-section" data-section-index="${sectionIndex}">تكرار</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="delete-section" data-section-index="${sectionIndex}">حذف</button>
        </div>
      </div>
    `;

    const questionsWrap = document.createElement('div');
    questionsWrap.className = 'builder-sections';

    section.items.forEach((item, itemIndex) => {
      const itemEl = document.createElement('div');
      itemEl.className = `builder-question ${item.isCollapsed ? 'builder-collapsed' : ''}`;
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
            <div class="field">
              <label class="label">نقاط السؤال</label>
              <input class="input ltr" type="number" min="1" data-field="points" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.points ?? 1)}" />
            </div>
            <label class="row">
              <input type="checkbox" data-field="required" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" ${item.required ? 'checked' : ''} />
              <span class="small">سؤال مطلوب</span>
            </label>
            `
              : `
            <div class="field">
              <label class="label">نوع العنصر</label>
              <input class="input" value="${escapeValue(getItemLabel(item.type))}" disabled />
            </div>
            ${item.type === 'image' || item.type === 'video'
              ? `
            <div class="field">
              <label class="label">${item.type === 'image' ? 'رابط الصورة' : 'رابط يوتيوب'}</label>
              <input class="input ltr" data-field="url" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.url ?? '')}" placeholder="${item.type === 'image' ? 'https://...' : 'https://youtube.com/...'}" />
            </div>
            `
              : `
            <div class="field">
              <label class="label">نص العنصر</label>
              <textarea class="input" data-field="text" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" placeholder="اكتب النص هنا">${escapeValue(item.text ?? '')}</textarea>
            </div>
            `}
            <div class="field">
              <label class="label">تفاصيل إضافية</label>
              <textarea class="input" rows="2" data-field="details" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" placeholder="كل تفصيل في سطر">${escapeValue((item.details || []).join('\n'))}</textarea>
            </div>
            `}
          </div>
          <div class="builder-card-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="toggle-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">
              ${item.isCollapsed ? 'فتح' : 'طي'}
            </button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="duplicate-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">تكرار</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="delete-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">حذف</button>
          </div>
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
        <div class="row" style="gap: 10px;">
          <button class="btn ${item.answer === 'true' ? 'btn-primary' : 'btn-outline'}" type="button" data-action="set-true" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">✅</button>
          <button class="btn ${item.answer === 'false' ? 'btn-primary' : 'btn-outline'}" type="button" data-action="set-false" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">❌</button>
        </div>
      </div>
      ${renderHintsSection(item, sectionIndex, itemIndex)}
    `;
  }

  if (item.questionType === 'number') {
    return `
      <div class="field">
        <label class="label">الإجابة الرقمية</label>
        <input class="input ltr" type="number" data-field="numeric-answer" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.answer ?? '')}" />
      </div>
      ${renderHintsSection(item, sectionIndex, itemIndex)}
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
      ${renderHintsSection(item, sectionIndex, itemIndex)}
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
      ${renderHintsSection(item, sectionIndex, itemIndex)}
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
      ${renderHintsSection(item, sectionIndex, itemIndex)}
    `;
  }

  if (item.questionType === 'long-text') {
    return `
      <div class="field">
        <label class="label">الإجابة المتوقعة (اختياري)</label>
        <textarea class="input" data-field="answer" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" placeholder="نص الإجابة الطويلة">${escapeValue(item.answer ?? '')}</textarea>
      </div>
      ${renderHintsSection(item, sectionIndex, itemIndex)}
    `;
  }

  return `
    <div class="field">
      <label class="label">الإجابة المتوقعة (اختياري)</label>
      <input class="input" data-field="answer" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" value="${escapeValue(item.answer ?? '')}" placeholder="إجابة قصيرة" />
    </div>
    ${renderHintsSection(item, sectionIndex, itemIndex)}
  `;
}

function renderHintsSection(item, sectionIndex, itemIndex) {
  const hints = Array.isArray(item.hints) ? item.hints : [];
  const hintOne = hints[0] ?? '';
  const hintTwo = hints[1] ?? '';
  const hasHintOne = hintOne !== '';
  const hasHintTwo = hintTwo !== '';
  const hasSolution = item.solution !== undefined;

  return `
    <div class="builder-helper">التلميحات والحل</div>
    ${hasHintOne || hints.length ? `
      <div class="field">
        <label class="label">تلميح أول</label>
        <textarea class="input" rows="2" data-field="hint" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-hint-index="0" placeholder="اكتب التلميح الأول">${escapeValue(hintOne)}</textarea>
      </div>
    ` : ''}
    ${hasHintTwo || hints.length > 1 ? `
      <div class="field">
        <label class="label">تلميح ثاني</label>
        <textarea class="input" rows="2" data-field="hint" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" data-hint-index="1" placeholder="اكتب التلميح الثاني">${escapeValue(hintTwo)}</textarea>
      </div>
    ` : ''}
    ${hasSolution ? `
      <div class="field">
        <label class="label">حل نموذجي (تلميح ثالث)</label>
        <textarea class="input" rows="2" data-field="solution" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" placeholder="اكتب الحل النموذجي">${escapeValue(item.solution ?? '')}</textarea>
      </div>
    ` : ''}
    <div class="row" style="gap: 10px; margin-top: 8px;">
      ${!hasHintOne ? `<button class="btn btn-ghost btn-sm" type="button" data-action="add-hint" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">إضافة تلميح أول</button>` : ''}
      ${hasHintOne && !hasHintTwo ? `<button class="btn btn-ghost btn-sm" type="button" data-action="add-hint" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">إضافة تلميح ثاني</button>` : ''}
      ${!hasSolution ? `<button class="btn btn-ghost btn-sm" type="button" data-action="add-solution" data-section-index="${sectionIndex}" data-item-index="${itemIndex}">إضافة حل نموذجي</button>` : ''}
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
  card.className = card.className || '';
  card.sections = Array.isArray(card.sections) ? card.sections : [];
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
  section.sectionType = section.sectionType || 'goal';
  section.goalIndex = Number.isFinite(section.goalIndex) ? section.goalIndex : 0;
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
    sectionType: 'goal',
    goalIndex: 0,
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
    url: type === 'image' || type === 'video' ? '' : undefined,
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
      points: 1,
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
    hints: Array.isArray(question.hints) ? question.hints : [],
    solution: question.solution,
    points: Number.isFinite(question.points) ? Number(question.points) : 1,
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
  if (item.type === 'image' || item.type === 'video') {
    item.url = item.url ?? '';
  }
  item.details = Array.isArray(item.details) ? item.details : [];
}

function persistCards() {
  try {
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
  } catch {
    showToast('خطأ', 'تعذر حفظ بيانات البطاقات في المتصفح', 'error');
  }
  if (!isInitializing) {
    markDirty();
  }
}

function markDirty() {
  if (!activeCard) return;
  hasPendingChanges = true;
  isApplied = false;
  setSaveState('dirty');
  updateSaveControls();
}

function scheduleAutoSave() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await autoSave();
  }, 1500);
}

async function autoSave() {
  if (saveState === 'saving') return;
  if (!activeCard?.week || !String(activeCard.title || '').trim()) {
    return;
  }
  try {
    if (Date.now() - lastAutoSaveAttempt > AUTO_SAVE_TOAST_WINDOW) {
      showToast('جارٍ الحفظ', 'يتم حفظ البطاقة تلقائيًا', 'info');
      lastAutoSaveAttempt = Date.now();
    }
    setSaveState('saving');
    await saveWeekToApi(activeCard);
    updateCardsCache(activeCard);
    setSaveState('saved');
    if (Date.now() - lastAutoSaveResult > AUTO_SAVE_TOAST_WINDOW) {
      showToast('تم الحفظ', 'تم حفظ البطاقة تلقائيًا', 'success');
      lastAutoSaveResult = Date.now();
    }
  } catch (error) {
    setSaveState('dirty');
    showToast('خطأ', error.message || 'تعذر حفظ البطاقة تلقائيًا', 'error');
  }
}

async function manualSave() {
  if (!activeCard) return;
  if (!isApplied) {
    showToast('تنبيه', 'يرجى الضغط على تطبيق قبل الحفظ', 'warning');
    return;
  }
  if (!hasPendingChanges) {
    showToast('تنبيه', 'لا يوجد تغييرات جديدة للحفظ', 'info');
    return;
  }
  if (!activeCard.week || !String(activeCard.title || '').trim()) {
    showToast('تنبيه', 'يرجى إدخال رقم الأسبوع وعنوان البطاقة قبل الحفظ', 'warning');
    return;
  }
  try {
    showToast('جارٍ الحفظ', 'جاري حفظ نموذج البطاقة', 'info');
    setSaveState('saving');
    await saveWeekToApi(activeCard);
    updateCardsCache(activeCard);
    setSaveState('saved');
    hasPendingChanges = false;
    isApplied = true;
    updateSaveControls();
    showToast('تم الحفظ', 'تم حفظ نموذج البطاقة بنجاح', 'success');
  } catch (error) {
    setSaveState('dirty');
    showToast('خطأ', error.message || 'تعذر حفظ نموذج البطاقة', 'error');
  }
}

function setSaveState(state) {
  saveState = state;
  const floatingSave = document.getElementById('floatingSave');
  if (!floatingSave) return;
  floatingSave.classList.remove('is-dirty', 'is-saving');

  if (state === 'saving') {
    floatingSave.classList.add('is-saving');
    floatingSave.textContent = 'جارٍ الحفظ... ⏳';
    return;
  }

  if (state === 'dirty') {
    floatingSave.classList.add('is-dirty');
  }

  updateSaveControls();
}

function toggleFloatingMenu() {
  const menu = document.getElementById('floatingMenu');
  if (!menu) return;
  if (!menu.classList.contains('hidden')) {
    hideFloatingMenu();
    return;
  }
  renderFloatingMenu();
  menu.classList.remove('hidden');
  menu.removeAttribute('hidden');
}

function hideFloatingMenu() {
  const menu = document.getElementById('floatingMenu');
  if (!menu) return;
  menu.classList.add('hidden');
  menu.setAttribute('hidden', 'hidden');
}

function applyChanges() {
  if (!hasPendingChanges) {
    showToast('تنبيه', 'لا يوجد تغييرات لتطبيقها', 'info');
    return;
  }
  isApplied = true;
  updateSaveControls();
  showToast('تم التطبيق', 'أصبح بإمكانك حفظ التغييرات الآن', 'success');
}

function previewCard() {
  if (!activeCard?.week) {
    showToast('تنبيه', 'يرجى إدخال رقم الأسبوع قبل المعاينة', 'warning');
    return;
  }
  window.open(`/lesson.html?week=${encodeURIComponent(activeCard.week)}`, '_blank');
}

function updateSaveControls() {
  const floatingSave = document.getElementById('floatingSave');
  const floatingApply = document.getElementById('floatingApply');
  const toolbarSave = document.getElementById('toolbarSave');

  const canSave = Boolean(isApplied && hasPendingChanges);
  const disableSave = saveState === 'saving' || !canSave;
  const disableApply = !hasPendingChanges || saveState === 'saving';

  if (floatingSave) {
    floatingSave.toggleAttribute('aria-disabled', disableSave);
    floatingSave.classList.toggle('is-disabled', disableSave);
    if (saveState === 'saving') {
      floatingSave.textContent = 'جارٍ الحفظ... ⏳';
    } else if (!hasPendingChanges) {
      floatingSave.textContent = 'تم الحفظ ✓';
    } else if (!isApplied) {
      floatingSave.textContent = 'اضغط تطبيق قبل الحفظ';
    } else {
      floatingSave.textContent = 'جاهز للحفظ ✓';
    }
  }

  if (floatingApply) {
    floatingApply.toggleAttribute('aria-disabled', disableApply);
    floatingApply.classList.toggle('is-disabled', disableApply);
  }

  if (toolbarSave) {
    toolbarSave.toggleAttribute('aria-disabled', disableSave);
    toolbarSave.classList.toggle('is-disabled', disableSave);
  }
}

function renderFloatingMenu() {
  const menu = document.getElementById('floatingMenu');
  if (!menu) return;
  const context = activeContext || 'card';

  const items = [];
  if (context === 'card') {
    items.push(
      { label: 'إضافة قسم (هدف)', action: () => addSection('goal') },
      { label: 'إضافة قسم (متطلب سابق)', action: () => addSection('prereq') },
      { label: 'إضافة قسم (أهداف البطاقة)', action: () => addSection('goals') },
      { label: 'إضافة قسم (اختبر نفسي)', action: () => addSection('assessment') },
      { label: 'إضافة هدف تعليمي', action: () => addGoal() },
      { label: 'إضافة متطلب سابق', action: () => addPrereq() },
    );
  }

  if (context === 'goals') {
    items.push({ label: 'إضافة هدف تعليمي', action: () => addGoal() });
  }

  if (context === 'prereqs') {
    items.push({ label: 'إضافة متطلب سابق', action: () => addPrereq() });
  }

  if (context === 'concepts') {
    items.push(
      { label: 'إضافة مفهوم', action: () => addItemToSection('note') },
      { label: 'إضافة مثال', action: () => addItemToSection('example') },
      { label: 'إضافة لا مثال', action: () => addItemToSection('non-example') },
      { label: 'إضافة توضيح', action: () => addItemToSection('explain') },
      { label: 'إضافة سؤال (اختيار من متعدد)', action: () => addQuestionToSection('mcq') },
      { label: 'إضافة سؤال (صح/خطأ)', action: () => addQuestionToSection('true-false') },
      { label: 'إضافة سؤال (إدخال نص)', action: () => addQuestionToSection('short-text') },
      { label: 'إضافة سؤال (توصيل)', action: () => addQuestionToSection('matching') },
      { label: 'إضافة سؤال (ترتيب)', action: () => addQuestionToSection('ordering') },
      { label: 'إضافة صورة', action: () => addItemToSection('image') },
      { label: 'إضافة فيديو يوتيوب', action: () => addItemToSection('video') },
    );
  }

  menu.innerHTML = items
    .map((item, index) => `<button type="button" data-menu-index="${index}">${item.label}</button>`)
    .join('');

  menu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.menuIndex);
      const action = items[index]?.action;
      if (action) action();
      hideFloatingMenu();
    });
  });
}

function addSection(sectionType = 'goal') {
  if (!activeCard) return;
  const nextSection = createSection();
  nextSection.sectionType = sectionType;
  activeCard.form.sections.push(nextSection);
  renderSections(document.getElementById('sectionsList'));
  persistCards();
  focusLastSectionTitle();
}

function addGoal() {
  if (!activeCard) return;
  activeCard.form.goals.push('');
  renderGoals();
  persistCards();
  focusLastGoal();
}

function addPrereq() {
  if (!activeCard) return;
  activeCard.form.prerequisites.push('');
  renderPrereqs();
  persistCards();
  focusLastPrereq();
}

function addItemToSection(type) {
  if (!activeCard) return;
  const index = Number.isFinite(activeSectionIndex) ? activeSectionIndex : 0;
  if (!activeCard.form.sections[index]) {
    activeCard.form.sections.push(createSection());
  }
  activeCard.form.sections[index].items.push(createItem(type));
  renderSections(document.getElementById('sectionsList'));
  persistCards();
  focusLastItem(index);
}

function addQuestionToSection(questionType) {
  if (!activeCard) return;
  const index = Number.isFinite(activeSectionIndex) ? activeSectionIndex : 0;
  if (!activeCard.form.sections[index]) {
    activeCard.form.sections.push(createSection());
  }
  activeCard.form.sections[index].items.push(createQuestionItem(questionType));
  renderSections(document.getElementById('sectionsList'));
  persistCards();
  focusLastItem(index);
}

function focusLastSectionTitle() {
  const inputs = document.querySelectorAll('[data-scope="section"][data-field="title"]');
  const input = inputs[inputs.length - 1];
  if (input instanceof HTMLInputElement) input.focus();
}

function focusLastItem(sectionIndex) {
  const items = document.querySelectorAll(`[data-section-index="${sectionIndex}"][data-item-index]`);
  const input = items[items.length - 1];
  if (input instanceof HTMLElement) input.focus();
}

function focusLastGoal() {
  const inputs = document.querySelectorAll('[data-scope="goal"]');
  const input = inputs[inputs.length - 1];
  if (input instanceof HTMLInputElement) input.focus();
}

function focusLastPrereq() {
  const inputs = document.querySelectorAll('[data-scope="prereq"]');
  const input = inputs[inputs.length - 1];
  if (input instanceof HTMLInputElement) input.focus();
}

function cloneData(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
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

  const sections = Array.isArray(card.form.sections) ? card.form.sections : [];
  const assessmentSections = sections.filter((section) => section.sectionType === 'assessment');
  const conceptSections = sections.filter((section) => section.sectionType !== 'assessment');

  const concepts = conceptSections.map((section) => ({
    title: section.title || 'قسم',
    flow: section.items.map((item) => mapItemToFlow(item)),
    sectionType: section.sectionType || 'goal',
    goalIndex: Number.isFinite(section.goalIndex) ? section.goalIndex : 0,
  }));

  const assessmentSource = assessmentSections.length ? assessmentSections : sections;
  const assessmentQuestions = assessmentSource.flatMap((section) =>
    section.items
      .filter((item) => item.type === 'question')
      .map((item) => mapQuestionToAssessment(item)),
  );

  return {
    week: Number(card.week),
    title: String(card.title || '').trim(),
    prereq: card.prereq == null ? null : Number(card.prereq),
    className: String(card.className || ''),
    sections: Array.isArray(card.sections) ? card.sections : [],
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
    if (item.url) {
      mapped.url = item.url;
    }
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
      ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
      ...(question.solution ? { solution: question.solution } : {}),
    };
  }

  if (question.questionType === 'true-false') {
    return {
      ...base,
      choices: ['صواب', 'خطأ'],
      correctIndex: question.answer === 'false' ? 1 : 0,
      ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
      ...(question.solution ? { solution: question.solution } : {}),
    };
  }

  if (question.questionType === 'number') {
    return {
      ...base,
      answer: question.answer == null ? '' : String(question.answer),
      ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
      ...(question.solution ? { solution: question.solution } : {}),
    };
  }

  return {
    ...base,
    answer: question.answer ?? '',
    ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
    ...(question.solution ? { solution: question.solution } : {}),
  };
}

function mapQuestionToAssessment(question) {
  if (question.questionType === 'mcq') {
    return {
      type: 'mcq',
      text: question.prompt || 'سؤال',
      choices: Array.isArray(question.options) ? question.options : [],
      correctIndex: Number.isFinite(question.correctIndex) ? question.correctIndex : 0,
      points: Number.isFinite(question.points) ? Number(question.points) : 1,
    };
  }

  if (question.questionType === 'true-false') {
    return {
      type: 'mcq',
      text: question.prompt || 'سؤال',
      choices: ['صواب', 'خطأ'],
      correctIndex: question.answer === 'false' ? 1 : 0,
      points: Number.isFinite(question.points) ? Number(question.points) : 1,
    };
  }

  return {
    type: 'input',
    text: question.prompt || 'سؤال',
    answer: question.answer == null ? '' : String(question.answer),
    points: Number.isFinite(question.points) ? Number(question.points) : 1,
  };
}

function getItemLabel(type) {
  const found = ITEM_TYPES.find((item) => item.value === type);
  return found?.label || 'عنصر';
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitInlineList(value) {
  return String(value || '')
    .split(/[,،]/)
    .map((entry) => entry.trim())
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
    className: card.className,
    sections: Array.isArray(card.sections) ? card.sections : [],
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

  const sections = Array.isArray(card.form.sections) ? card.form.sections : [];
  const assessmentSections = sections.filter((section) => section.sectionType === 'assessment');
  const conceptSections = sections.filter((section) => section.sectionType !== 'assessment');

  const concepts = conceptSections.map((section) => ({
    title: section.title || 'قسم',
    flow: section.items.map((item) => mapItemToFlow(item)),
    sectionType: section.sectionType || 'goal',
    goalIndex: Number.isFinite(section.goalIndex) ? section.goalIndex : 0,
  }));

  const assessmentSource = assessmentSections.length ? assessmentSections : sections;
  const assessmentQuestions = assessmentSource.flatMap((section) =>
    section.items
      .filter((item) => item.type === 'question')
      .map((item) => mapQuestionToAssessment(item)),
  );

  return {
    week: Number(card.week),
    title: String(card.title || '').trim(),
    prereq: card.prereq == null ? null : Number(card.prereq),
    className: String(card.className || ''),
    sections: Array.isArray(card.sections) ? card.sections : [],
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
    if (item.url) {
      mapped.url = item.url;
    }
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
      ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
      ...(question.solution ? { solution: question.solution } : {}),
    };
  }

  if (question.questionType === 'true-false') {
    return {
      ...base,
      choices: ['صواب', 'خطأ'],
      correctIndex: question.answer === 'false' ? 1 : 0,
      ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
      ...(question.solution ? { solution: question.solution } : {}),
    };
  }

  if (question.questionType === 'number') {
    return {
      ...base,
      answer: question.answer == null ? '' : String(question.answer),
      ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
      ...(question.solution ? { solution: question.solution } : {}),
    };
  }

  return {
    ...base,
    answer: question.answer ?? '',
    ...(Array.isArray(question.hints) && question.hints.length ? { hints: question.hints } : {}),
    ...(question.solution ? { solution: question.solution } : {}),
  };
}

function mapQuestionToAssessment(question) {
  if (question.questionType === 'mcq') {
    return {
      type: 'mcq',
      text: question.prompt || 'سؤال',
      choices: Array.isArray(question.options) ? question.options : [],
      correctIndex: Number.isFinite(question.correctIndex) ? question.correctIndex : 0,
      points: Number.isFinite(question.points) ? Number(question.points) : 1,
    };
  }

  if (question.questionType === 'true-false') {
    return {
      type: 'mcq',
      text: question.prompt || 'سؤال',
      choices: ['صواب', 'خطأ'],
      correctIndex: question.answer === 'false' ? 1 : 0,
      points: Number.isFinite(question.points) ? Number(question.points) : 1,
    };
  }

  return {
    type: 'input',
    text: question.prompt || 'سؤال',
    answer: question.answer == null ? '' : String(question.answer),
    points: Number.isFinite(question.points) ? Number(question.points) : 1,
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
    className: card.className,
    sections: Array.isArray(card.sections) ? card.sections : [],
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

function setLoading(overlay, isVisible, message) {
  if (!overlay) return;
  overlay.classList.toggle('hidden', !isVisible);
  overlay.toggleAttribute('hidden', !isVisible);
  if (message) {
    const text = overlay.querySelector('span:last-child');
    if (text) text.textContent = message;
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
