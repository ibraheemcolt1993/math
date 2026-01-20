import { fetchJson } from './core/api.js';
import { API_PATHS, weekJsonPath } from './core/constants.js';
import { normalizeDigits } from './core/normalizeDigits.js';
import { showToast } from './ui/toast.js';

const LS_ADMIN_SESSION = 'math:admin:session';
const LS_ADMIN_CARDS = 'math:admin:cards';
const CARDS_PATH = API_PATHS.ADMIN_CARDS;

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

  try {
    setLoading(builderLoading, true, 'جاري تحميل البيانات...');

    cards = await fetchJson(CARDS_PATH, { noStore: true });
    if (!Array.isArray(cards)) {
      throw new Error('Invalid cards response');
    }

    const query = new URLSearchParams(window.location.search);
    const cardId = query.get('id');

    if (cardId) {
      const normalized = normalizeDigits(cardId);
      activeCard = cards.find((card) => String(card.week) === String(normalized));
    }

    if (!activeCard) {
      activeCard = cards[0];
    }

    if (activeCard) {
      activeCard = await fetchJson(weekJsonPath(activeCard.week), { noStore: true });
    } else {
      activeCard = makeEmptyCard();
      isNewCard = true;
    }

    if (!activeCard) {
      activeCard = makeEmptyCard();
      isNewCard = true;
    }

    renderCard();
    setLoading(builderLoading, false);
  } catch (error) {
    setLoading(builderLoading, false, 'تعذر تحميل البيانات.');
    showToast('خطأ', 'تعذر تحميل بيانات البطاقة', 'error');
  }

  inputWeek?.addEventListener('input', () => {
    if (!inputWeek) return;
    const normalized = normalizeDigits(inputWeek.value).trim();
    const numeric = Number(normalized);
    const isNumeric = Number.isInteger(numeric) && numeric > 0;
    if (!isNumeric) {
      setInputError(inputWeek, 'رقم الأسبوع غير صالح');
    } else {
      clearInputError(inputWeek);
    }
  });

  inputTitle?.addEventListener('input', () => {
    if (!inputTitle) return;
    if (!String(inputTitle.value).trim()) {
      setInputError(inputTitle, 'عنوان البطاقة مطلوب');
    } else {
      clearInputError(inputTitle);
    }
  });

  inputPrereq?.addEventListener('input', () => {
    if (!inputPrereq) return;
    const normalized = normalizeDigits(inputPrereq.value).trim();
    if (normalized && !Number.isInteger(Number(normalized))) {
      setInputError(inputPrereq, 'المتطلب السابق يجب أن يكون رقمًا');
    } else {
      clearInputError(inputPrereq);
    }
  });

  toolbarSave?.addEventListener('click', async () => {
    await saveCard({ showToast: true });
  });

  floatingSave?.addEventListener('click', async () => {
    await saveCard({ showToast: true });
  });

  floatingApply?.addEventListener('click', async () => {
    await saveCard({ showToast: true, apply: true });
  });

  floatingPreview?.addEventListener('click', () => {
    window.open(`/week.html?week=${encodeURIComponent(activeCard?.week ?? '')}`, '_blank');
  });

  floatingAdd?.addEventListener('click', () => {
    const maxWeek = cards.reduce((max, card) => {
      const value = Number(card.week);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);

    const newCard = {
      week: maxWeek + 1,
      title: 'بطاقة جديدة',
      prereq: null,
      className: '',
      sections: [],
    };

    cards.unshift(newCard);
    localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));
    window.location.href = `/admin-card-builder.html?id=${encodeURIComponent(newCard.week)}`;
  });

  floatingMenu?.addEventListener('click', () => {
    if (!floatingMenu) return;
    const menu = floatingMenu.closest('.floating-menu');
    menu?.classList.toggle('is-open');
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    const menu = floatingMenu?.closest('.floating-menu');
    if (!menu || !floatingMenu) return;
    if (menu.contains(target)) return;
    menu.classList.remove('is-open');
  });

  btnAddGoal?.addEventListener('click', () => {
    if (!activeCard) return;
    activeCard.goals = Array.isArray(activeCard.goals) ? activeCard.goals : [];
    activeCard.goals.push('');
    renderGoals();
    markDirty();
  });

  btnAddPrereq?.addEventListener('click', () => {
    if (!activeCard) return;
    activeCard.prerequisites = Array.isArray(activeCard.prerequisites)
      ? activeCard.prerequisites
      : [];
    activeCard.prerequisites.push('');
    renderPrereqs();
    markDirty();
  });

  function setLoading(element, isLoading, text) {
    if (!element) return;
    element.classList.toggle('is-active', isLoading);
    if (text) {
      const label = element.querySelector('.loading-text');
      if (label) {
        label.textContent = text;
      }
    }
  }

  function setInputError(element, message) {
    element.classList.add('is-invalid');
    const wrapper = element.closest('.form-field');
    if (!wrapper) return;
    const errorElement = wrapper.querySelector('.field-error');
    if (errorElement) {
      errorElement.textContent = message;
    }
  }

  function clearInputError(element) {
    element.classList.remove('is-invalid');
    const wrapper = element.closest('.form-field');
    if (!wrapper) return;
    const errorElement = wrapper.querySelector('.field-error');
    if (errorElement) {
      errorElement.textContent = '';
    }
  }

  function markDirty() {
    hasPendingChanges = true;
    updateSaveState('dirty');

    const now = Date.now();
    if (now - lastAutoSaveAttempt > AUTO_SAVE_TOAST_WINDOW) {
      scheduleAutoSave();
    }
  }

  function updateSaveState(state) {
    saveState = state;
    if (toolbarSave) {
      toolbarSave.textContent = saveState === 'saving' ? 'جارٍ الحفظ...' : 'حفظ';
      toolbarSave.disabled = saveState === 'saving';
    }
    if (floatingSave) {
      floatingSave.textContent = saveState === 'saving' ? 'جارٍ الحفظ...' : 'حفظ';
      floatingSave.disabled = saveState === 'saving';
    }
  }

  function scheduleAutoSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(async () => {
      if (!hasPendingChanges) return;
      await saveCard({ showToast: false });
    }, 2000);
  }

  async function saveCard({ showToast: shouldToast, apply } = {}) {
    if (!activeCard) return;

    const validation = validateCard();
    if (!validation.isValid) {
      if (shouldToast) {
        showToast('تنبيه', validation.message, 'warning');
      }
      return;
    }

    try {
      updateSaveState('saving');
      lastAutoSaveAttempt = Date.now();

      const payload = buildPayload();
      await fetchJson(weekJsonPath(activeCard.week), {
        method: 'PUT',
        body: payload,
        noStore: true,
      });

      cards = cards.filter((card) => String(card.week) !== String(activeCard.week));
      cards.unshift({ week: activeCard.week, title: activeCard.title, prereq: activeCard.prereq });
      localStorage.setItem(LS_ADMIN_CARDS, JSON.stringify(cards));

      if (apply) {
        isApplied = true;
        if (shouldToast) {
          showToast('تم التطبيق', 'تم تطبيق التعديلات بنجاح', 'success');
        }
      } else if (shouldToast) {
        showToast('تم الحفظ', 'تم حفظ التعديلات بنجاح', 'success');
      }

      lastAutoSaveResult = Date.now();
      hasPendingChanges = false;
      updateSaveState('saved');
    } catch (error) {
      updateSaveState('dirty');
      if (shouldToast) {
        showToast('خطأ', 'تعذر حفظ التعديلات', 'error');
      }
    }
  }

  function validateCard() {
    if (!activeCard) return { isValid: false, message: 'تعذر العثور على البطاقة.' };

    const weekValue = normalizeDigits(activeCard.week).trim();
    const weekNumber = Number(weekValue);
    if (!weekValue || !Number.isInteger(weekNumber) || weekNumber <= 0) {
      return { isValid: false, message: 'رقم الأسبوع غير صالح.' };
    }

    if (!String(activeCard.title || '').trim()) {
      return { isValid: false, message: 'عنوان البطاقة مطلوب.' };
    }

    const prereqValue = normalizeDigits(activeCard.prereq || '').trim();
    if (prereqValue && !Number.isInteger(Number(prereqValue))) {
      return { isValid: false, message: 'المتطلب السابق يجب أن يكون رقمًا.' };
    }

    return { isValid: true };
  }

  function buildPayload() {
    return {
      week: normalizeDigits(activeCard.week).trim(),
      title: activeCard.title,
      prereq: normalizeDigits(activeCard.prereq || '').trim(),
      goals: activeCard.goals || [],
      prerequisites: activeCard.prerequisites || [],
      concepts: activeCard.concepts || [],
      assessment: activeCard.assessment || null,
    };
  }

  function makeEmptyCard() {
    return {
      week: '',
      title: '',
      prereq: null,
      goals: [],
      prerequisites: [],
      concepts: [],
      assessment: null,
    };
  }

  function renderCard() {
    if (!activeCard) return;

    if (inputWeek) inputWeek.value = activeCard.week ?? '';
    if (inputTitle) inputTitle.value = activeCard.title ?? '';
    if (inputPrereq) inputPrereq.value = activeCard.prereq ?? '';
    if (inputClass) inputClass.value = activeCard.className ?? '';
    if (inputAssessmentTitle) inputAssessmentTitle.value = activeCard.assessment?.title ?? '';
    if (inputAssessmentDescription) {
      inputAssessmentDescription.value = activeCard.assessment?.description ?? '';
    }

    renderGoals();
    renderPrereqs();
    renderSections();
  }

  function renderGoals() {
    if (!goalsList) return;
    goalsList.innerHTML = '';

    const goals = Array.isArray(activeCard?.goals) ? activeCard.goals : [];
    goals.forEach((goal, index) => {
      const listItem = document.createElement('li');
      listItem.className = 'list-item';
      listItem.innerHTML = `
        <span class="drag-handle" title="سحب للترتيب">
          <i class="fa fa-grip-lines"></i>
        </span>
        <input type="text" class="text-input" placeholder="اكتب الهدف هنا" value="${escapeHtml(goal)}" data-goal-index="${index}">
        <button class="btn btn-ghost btn-icon" data-remove-goal="${index}">
          <i class="fa fa-trash"></i>
        </button>
      `;
      goalsList.appendChild(listItem);
    });

    const goalInputs = goalsList.querySelectorAll('[data-goal-index]');
    goalInputs.forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.goalIndex);
        if (!Number.isInteger(idx)) return;
        activeCard.goals[idx] = input.value;
        markDirty();
      });
    });

    const removeButtons = goalsList.querySelectorAll('[data-remove-goal]');
    removeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Number(button.dataset.removeGoal);
        if (!Number.isInteger(idx)) return;
        activeCard.goals.splice(idx, 1);
        renderGoals();
        markDirty();
      });
    });
  }

  function renderPrereqs() {
    if (!prereqsList) return;
    prereqsList.innerHTML = '';

    const prereqs = Array.isArray(activeCard?.prerequisites)
      ? activeCard.prerequisites
      : [];

    prereqs.forEach((prereq, index) => {
      const listItem = document.createElement('li');
      listItem.className = 'list-item';
      listItem.innerHTML = `
        <span class="drag-handle" title="سحب للترتيب">
          <i class="fa fa-grip-lines"></i>
        </span>
        <input type="text" class="text-input" placeholder="اكتب المتطلب هنا" value="${escapeHtml(prereq)}" data-prereq-index="${index}">
        <button class="btn btn-ghost btn-icon" data-remove-prereq="${index}">
          <i class="fa fa-trash"></i>
        </button>
      `;
      prereqsList.appendChild(listItem);
    });

    const prereqInputs = prereqsList.querySelectorAll('[data-prereq-index]');
    prereqInputs.forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.prereqIndex);
        if (!Number.isInteger(idx)) return;
        activeCard.prerequisites[idx] = input.value;
        markDirty();
      });
    });

    const removeButtons = prereqsList.querySelectorAll('[data-remove-prereq]');
    removeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Number(button.dataset.removePrereq);
        if (!Number.isInteger(idx)) return;
        activeCard.prerequisites.splice(idx, 1);
        renderPrereqs();
        markDirty();
      });
    });
  }

  function renderSections() {
    if (!sectionsList) return;
    sectionsList.innerHTML = '';

    const sections = Array.isArray(activeCard?.concepts) ? activeCard.concepts : [];

    sections.forEach((section, sectionIndex) => {
      const sectionElement = document.createElement('div');
      sectionElement.className = 'section-block';
      sectionElement.dataset.sectionIndex = sectionIndex;
      sectionElement.innerHTML = `
        <div class="section-header">
          <div class="section-title">
            <span class="drag-handle" title="سحب للترتيب">
              <i class="fa fa-grip-lines"></i>
            </span>
            <input type="text" class="text-input" placeholder="عنوان القسم" value="${escapeHtml(section.title || '')}" data-section-title="${sectionIndex}">
          </div>
          <div class="section-actions">
            <button class="btn btn-ghost btn-icon" data-add-item="${sectionIndex}">
              <i class="fa fa-plus"></i>
            </button>
            <button class="btn btn-ghost btn-icon" data-remove-section="${sectionIndex}">
              <i class="fa fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="section-items" data-section-items="${sectionIndex}"></div>
      `;
      sectionsList.appendChild(sectionElement);

      const itemsContainer = sectionElement.querySelector('[data-section-items]');
      renderItems(itemsContainer, section, sectionIndex);
    });

    const sectionTitleInputs = sectionsList.querySelectorAll('[data-section-title]');
    sectionTitleInputs.forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.sectionTitle);
        if (!Number.isInteger(idx)) return;
        activeCard.concepts[idx].title = input.value;
        markDirty();
      });
    });

    const removeButtons = sectionsList.querySelectorAll('[data-remove-section]');
    removeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Number(button.dataset.removeSection);
        if (!Number.isInteger(idx)) return;
        activeCard.concepts.splice(idx, 1);
        renderSections();
        markDirty();
      });
    });

    const addItemButtons = sectionsList.querySelectorAll('[data-add-item]');
    addItemButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Number(button.dataset.addItem);
        if (!Number.isInteger(idx)) return;
        const section = activeCard.concepts[idx];
        section.flow = Array.isArray(section.flow) ? section.flow : [];
        section.flow.push(makeEmptyItem());
        renderSections();
        markDirty();
      });
    });
  }

  function renderItems(container, section, sectionIndex) {
    if (!container) return;
    container.innerHTML = '';

    const items = Array.isArray(section.flow) ? section.flow : [];

    items.forEach((item, itemIndex) => {
      const itemElement = document.createElement('div');
      itemElement.className = 'item-block';
      itemElement.dataset.itemIndex = itemIndex;
      itemElement.innerHTML = `
        <div class="item-header">
          <div class="item-title">
            <span class="drag-handle" title="سحب للترتيب">
              <i class="fa fa-grip-lines"></i>
            </span>
            <select class="select-input" data-item-type="${sectionIndex}:${itemIndex}">
              ${ITEM_TYPES.map((type) => `
                <option value="${type.value}" ${item.type === type.value ? 'selected' : ''}>
                  ${type.label}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="item-actions">
            <button class="btn btn-ghost btn-icon" data-move-item="up" data-item="${sectionIndex}:${itemIndex}">
              <i class="fa fa-arrow-up"></i>
            </button>
            <button class="btn btn-ghost btn-icon" data-move-item="down" data-item="${sectionIndex}:${itemIndex}">
              <i class="fa fa-arrow-down"></i>
            </button>
            <button class="btn btn-ghost btn-icon" data-remove-item="${sectionIndex}:${itemIndex}">
              <i class="fa fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="item-content" data-item-content="${sectionIndex}:${itemIndex}"></div>
      `;
      container.appendChild(itemElement);

      const content = itemElement.querySelector('[data-item-content]');
      renderItemContent(content, item, sectionIndex, itemIndex);
    });

    const itemTypeSelects = sectionsList.querySelectorAll('[data-item-type]');
    itemTypeSelects.forEach((select) => {
      select.addEventListener('change', () => {
        const [sectionIdx, itemIdx] = String(select.dataset.itemType).split(':').map(Number);
        if (!Number.isInteger(sectionIdx) || !Number.isInteger(itemIdx)) return;
        const targetItem = activeCard.concepts[sectionIdx].flow[itemIdx];
        targetItem.type = select.value;
        renderSections();
        markDirty();
      });
    });

    const removeItemButtons = sectionsList.querySelectorAll('[data-remove-item]');
    removeItemButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const [sectionIdx, itemIdx] = String(button.dataset.removeItem).split(':').map(Number);
        if (!Number.isInteger(sectionIdx) || !Number.isInteger(itemIdx)) return;
        activeCard.concepts[sectionIdx].flow.splice(itemIdx, 1);
        renderSections();
        markDirty();
      });
    });

    const moveButtons = sectionsList.querySelectorAll('[data-move-item]');
    moveButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const [sectionIdx, itemIdx] = String(button.dataset.item).split(':').map(Number);
        if (!Number.isInteger(sectionIdx) || !Number.isInteger(itemIdx)) return;

        const direction = button.dataset.moveItem;
        const flow = activeCard.concepts[sectionIdx].flow;
        const nextIndex = direction === 'up' ? itemIdx - 1 : itemIdx + 1;
        if (nextIndex < 0 || nextIndex >= flow.length) return;

        const [moved] = flow.splice(itemIdx, 1);
        flow.splice(nextIndex, 0, moved);
        renderSections();
        markDirty();
      });
    });
  }

  function renderItemContent(container, item, sectionIndex, itemIndex) {
    if (!container) return;
    container.innerHTML = '';

    const type = String(item.type || 'note').toLowerCase();
    const sectionPrefix = `${sectionIndex}:${itemIndex}`;

    const titleField = document.createElement('div');
    titleField.className = 'form-field';
    titleField.innerHTML = `
      <label>عنوان</label>
      <input type="text" class="text-input" data-item-title="${sectionPrefix}" value="${escapeHtml(item.title || '')}">
    `;
    container.appendChild(titleField);

    const descriptionField = document.createElement('div');
    descriptionField.className = 'form-field';
    descriptionField.innerHTML = `
      <label>الوصف</label>
      <textarea class="text-input" rows="2" data-item-description="${sectionPrefix}">${escapeHtml(item.description || '')}</textarea>
    `;
    container.appendChild(descriptionField);

    const urlField = document.createElement('div');
    urlField.className = 'form-field';
    urlField.innerHTML = `
      <label>رابط</label>
      <input type="text" class="text-input" data-item-url="${sectionPrefix}" value="${escapeHtml(item.url || '')}">
    `;
    container.appendChild(urlField);

    const textField = document.createElement('div');
    textField.className = 'form-field';
    textField.innerHTML = `
      <label>النص</label>
      <textarea class="text-input" rows="3" data-item-text="${sectionPrefix}">${escapeHtml(item.text || '')}</textarea>
    `;
    container.appendChild(textField);

    if (['goal', 'note', 'explain'].includes(type)) {
      const detailsField = document.createElement('div');
      detailsField.className = 'form-field';
      detailsField.innerHTML = `
        <label>تفاصيل إضافية</label>
        <textarea class="text-input" rows="3" data-item-details="${sectionPrefix}">${escapeHtml((item.details || []).join('\n'))}</textarea>
      `;
      container.appendChild(detailsField);
    }

    if (['question', 'mcq', 'true-false', 'short-text', 'long-text', 'number', 'matching', 'ordering'].includes(type)) {
      const answerField = document.createElement('div');
      answerField.className = 'form-field';
      answerField.innerHTML = `
        <label>الإجابة</label>
        <textarea class="text-input" rows="2" data-item-answer="${sectionPrefix}">${escapeHtml(item.answer || '')}</textarea>
      `;
      container.appendChild(answerField);

      const solutionField = document.createElement('div');
      solutionField.className = 'form-field';
      solutionField.innerHTML = `
        <label>الحل</label>
        <textarea class="text-input" rows="2" data-item-solution="${sectionPrefix}">${escapeHtml(item.solution || '')}</textarea>
      `;
      container.appendChild(solutionField);
    }

    if (type === 'mcq') {
      const optionsField = document.createElement('div');
      optionsField.className = 'form-field';
      optionsField.innerHTML = `
        <label>خيارات الاختيار من متعدد</label>
        <textarea class="text-input" rows="3" data-item-choices="${sectionPrefix}">${escapeHtml((item.choices || []).join('\n'))}</textarea>
      `;
      container.appendChild(optionsField);

      const correctField = document.createElement('div');
      correctField.className = 'form-field';
      correctField.innerHTML = `
        <label>رقم الإجابة الصحيحة (يبدأ من 1)</label>
        <input type="number" class="text-input" data-item-correct="${sectionPrefix}" value="${Number(item.correctIndex ?? '') + 1}">
      `;
      container.appendChild(correctField);
    }

    const hintField = document.createElement('div');
    hintField.className = 'form-field';
    hintField.innerHTML = `
      <label>تلميحات</label>
      <textarea class="text-input" rows="2" data-item-hints="${sectionPrefix}">${escapeHtml((item.hints || []).join('\n'))}</textarea>
    `;
    container.appendChild(hintField);

    if (['question', 'mcq', 'true-false', 'short-text', 'long-text', 'number'].includes(type)) {
      const stepsField = document.createElement('div');
      stepsField.className = 'form-field';
      stepsField.innerHTML = `
        <label>خطوات الحل</label>
        <textarea class="text-input" rows="3" data-item-details="${sectionPrefix}">${escapeHtml((item.details || []).join('\n'))}</textarea>
      `;
      container.appendChild(stepsField);
    }

    const inputElements = container.querySelectorAll('input, textarea, select');
    inputElements.forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.itemTitle
          ? 'title'
          : input.dataset.itemDescription
          ? 'description'
          : input.dataset.itemUrl
          ? 'url'
          : input.dataset.itemText
          ? 'text'
          : input.dataset.itemAnswer
          ? 'answer'
          : input.dataset.itemSolution
          ? 'solution'
          : input.dataset.itemChoices
          ? 'choices'
          : input.dataset.itemHints
          ? 'hints'
          : input.dataset.itemDetails
          ? 'details'
          : input.dataset.itemCorrect
          ? 'correctIndex'
          : null;

        if (!key) return;

        const [sectionIdx, itemIdx] = sectionPrefix.split(':').map(Number);
        if (!Number.isInteger(sectionIdx) || !Number.isInteger(itemIdx)) return;

        if (key === 'choices' || key === 'hints' || key === 'details') {
          const values = input.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
          activeCard.concepts[sectionIdx].flow[itemIdx][key] = values;
        } else if (key === 'correctIndex') {
          const value = Number(input.value);
          activeCard.concepts[sectionIdx].flow[itemIdx][key] = Number.isFinite(value) ? value - 1 : null;
        } else {
          activeCard.concepts[sectionIdx].flow[itemIdx][key] = input.value;
        }

        markDirty();
      });
    });

    const selectElements = container.querySelectorAll('select');
    selectElements.forEach((select) => {
      select.addEventListener('change', () => {
        const [sectionIdx, itemIdx] = sectionPrefix.split(':').map(Number);
        if (!Number.isInteger(sectionIdx) || !Number.isInteger(itemIdx)) return;
        activeCard.concepts[sectionIdx].flow[itemIdx].type = select.value;
        renderSections();
        markDirty();
      });
    });
  }

  function makeEmptyItem() {
    return {
      type: 'note',
      title: '',
      description: '',
      text: '',
      answer: '',
      solution: '',
      choices: [],
      hints: [],
      details: [],
      correctIndex: null,
      url: '',
    };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.addEventListener('beforeunload', (event) => {
    if (!hasPendingChanges) return;
    event.preventDefault();
    event.returnValue = '';
  });
});
