import { showToast } from '../ui/toast.js';

const elements = {
  cardTitle: document.getElementById('cardTitle'),
  cardSubtitle: document.getElementById('cardSubtitle'),
  sectionsList: document.getElementById('sectionsList'),
  editorContent: document.getElementById('editorContent'),
  btnSave: document.getElementById('btnSave'),
  btnAddConcept: document.getElementById('btnAddConcept'),
  btnAddItem: document.getElementById('btnAddItem'),
  btnAddQuestion: document.getElementById('btnAddQuestion'),
  btnBack: document.getElementById('btnBack'),
  confirmLeave: document.getElementById('confirmLeave'),
  btnCloseLeave: document.getElementById('btnCloseLeave'),
  btnCancelLeave: document.getElementById('btnCancelLeave'),
  btnConfirmLeave: document.getElementById('btnConfirmLeave')
};

const state = {
  week: null,
  seq: null,
  title: '',
  goals: [],
  prerequisites: [],
  concepts: [],
  assessment: { title: '', description: '', questions: [] },
  activeSection: 'goals',
  dirty: false,
  pendingNavigation: null
};

function normalizeValue(value) {
  return value == null ? '' : String(value).trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setDirty(value = true) {
  state.dirty = value;
}

function getWeekParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('week');
  const parsed = raw ? Number(raw) : null;
  return Number.isFinite(parsed) ? parsed : null;
}

function setHeader() {
  const seqLabel = state.seq != null ? state.seq : '—';
  const titleLabel = state.title || 'بدون عنوان';
  elements.cardTitle.textContent = `بطاقة رقم ${seqLabel}: ${titleLabel}`;
  elements.cardSubtitle.textContent = `المعرّف الداخلي: ${state.week ?? '—'}`;
}

function buildSections() {
  const sections = [
    { id: 'goals', label: 'ترحيب / ماذا سنتعلم' },
    { id: 'prerequisites', label: 'متطلب سابق' }
  ];

  state.concepts.forEach((concept, index) => {
    sections.push({
      id: `concept-${index}`,
      label: `المفهوم ${index + 1}: ${concept.title || 'بدون عنوان'}`
    });
  });

  sections.push({ id: 'assessment', label: 'التقييم النهائي' });
  return sections;
}

function renderSidebar() {
  const sections = buildSections();
  elements.sectionsList.innerHTML = sections
    .map((section) => {
      const activeClass = section.id === state.activeSection ? 'active' : '';
      return `<li class="sidebar-item ${activeClass}" data-section="${section.id}">${escapeHtml(section.label)}</li>`;
    })
    .join('');
}

function renderGoalsSection() {
  const items = state.goals.length ? state.goals : [''];
  elements.editorContent.innerHTML = `
    <h2 class="section-title">ترحيب / ماذا سنتعلم</h2>
    ${items
      .map(
        (goal, index) => `
          <div class="item-card" data-index="${index}">
            <label class="label">هدف ${index + 1}</label>
            <input class="input" data-type="goal" data-index="${index}" value="${escapeHtml(goal)}" />
            <div class="item-actions">
              <button class="btn btn-ghost btn-sm small-btn" data-action="move-goal" data-direction="up" data-index="${index}">⬆️</button>
              <button class="btn btn-ghost btn-sm small-btn" data-action="move-goal" data-direction="down" data-index="${index}">⬇️</button>
              <button class="btn btn-ghost btn-sm small-btn" data-action="delete-goal" data-index="${index}">حذف</button>
            </div>
          </div>
        `
      )
      .join('')}
    <button class="btn btn-outline" data-action="add-goal">إضافة هدف</button>
  `;
}

function renderPrereqSection() {
  const items = state.prerequisites.length ? state.prerequisites : [''];
  elements.editorContent.innerHTML = `
    <h2 class="section-title">المتطلب السابق</h2>
    ${items
      .map(
        (item, index) => `
          <div class="item-card" data-index="${index}">
            <label class="label">متطلب ${index + 1}</label>
            <input class="input" data-type="prereq" data-index="${index}" value="${escapeHtml(item)}" />
            <div class="item-actions">
              <button class="btn btn-ghost btn-sm small-btn" data-action="move-prereq" data-direction="up" data-index="${index}">⬆️</button>
              <button class="btn btn-ghost btn-sm small-btn" data-action="move-prereq" data-direction="down" data-index="${index}">⬇️</button>
              <button class="btn btn-ghost btn-sm small-btn" data-action="delete-prereq" data-index="${index}">حذف</button>
            </div>
          </div>
        `
      )
      .join('')}
    <button class="btn btn-outline" data-action="add-prereq">إضافة متطلب</button>
  `;
}

function renderStringList(list, listName, conceptIndex, flowIndex) {
  const items = list.length ? list : [''];
  return `
    <div class="inline-input">
      ${items
        .map(
          (value, index) => `
            <div class="row" style="margin-top: 6px;">
              <input class="input" data-list="${listName}" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" data-index="${index}" value="${escapeHtml(value)}" />
              <button class="btn btn-ghost btn-sm small-btn" data-action="delete-list-item" data-list="${listName}" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" data-index="${index}">حذف</button>
            </div>
          `
        )
        .join('')}
      <button class="btn btn-ghost btn-sm small-btn" data-action="add-list-item" data-list="${listName}" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">إضافة</button>
    </div>
  `;
}

function renderFlowItem(item, conceptIndex, flowIndex) {
  const type = item.type || 'goal';
  const showText = ['goal', 'explain', 'question', 'note', 'mcq'].includes(type);
  const showTitle = ['explain', 'video'].includes(type);
  const showDescription = ['explain', 'note', 'image', 'video'].includes(type);
  const showUrl = ['image', 'video'].includes(type);
  const showAnswer = ['question', 'mcq'].includes(type);
  const showChoices = type === 'mcq';

  return `
    <div class="item-card" data-flow-index="${flowIndex}">
      <div class="flow-badge">${escapeHtml(type.toUpperCase())}</div>
      <div class="field">
        <label class="label">نوع العنصر</label>
        <select class="input" data-field="type" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">
          <option value="goal" ${type === 'goal' ? 'selected' : ''}>هدف</option>
          <option value="explain" ${type === 'explain' ? 'selected' : ''}>شرح</option>
          <option value="question" ${type === 'question' ? 'selected' : ''}>سؤال نصي</option>
          <option value="note" ${type === 'note' ? 'selected' : ''}>ملاحظة</option>
          <option value="image" ${type === 'image' ? 'selected' : ''}>صورة</option>
          <option value="video" ${type === 'video' ? 'selected' : ''}>فيديو</option>
          <option value="mcq" ${type === 'mcq' ? 'selected' : ''}>اختيار متعدد</option>
        </select>
      </div>
      ${showTitle ? `
        <div class="field">
          <label class="label">العنوان</label>
          <input class="input" data-field="title" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.title || '')}" />
        </div>
      ` : ''}
      ${showText ? `
        <div class="field">
          <label class="label">النص</label>
          <textarea class="input" rows="3" data-field="text" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">${escapeHtml(item.text || '')}</textarea>
        </div>
      ` : ''}
      ${showDescription ? `
        <div class="field">
          <label class="label">الوصف</label>
          <textarea class="input" rows="2" data-field="description" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">${escapeHtml(item.description || '')}</textarea>
        </div>
      ` : ''}
      ${showUrl ? `
        <div class="field">
          <label class="label">الرابط</label>
          <input class="input ltr" data-field="url" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.url || '')}" />
        </div>
      ` : ''}
      ${showAnswer ? `
        <div class="field">
          <label class="label">الإجابة</label>
          <input class="input" data-field="answer" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.answer || '')}" />
        </div>
      ` : ''}
      ${showChoices ? `
        <div class="field">
          <label class="label">الاختيارات</label>
          ${renderStringList(item.choices || [], 'choices', conceptIndex, flowIndex)}
        </div>
        <div class="field">
          <label class="label">رقم الإجابة الصحيحة</label>
          <input class="input ltr" data-field="correctIndex" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.correctIndex ?? 0)}" />
        </div>
      ` : ''}
      <div class="field">
        <label class="label">تفاصيل إضافية</label>
        ${renderStringList(item.details || [], 'details', conceptIndex, flowIndex)}
      </div>
      <div class="field">
        <label class="label">تلميحات</label>
        ${renderStringList(item.hints || [], 'hints', conceptIndex, flowIndex)}
      </div>
      <div class="field">
        <label class="label">الحل</label>
        <input class="input" data-field="solution" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.solution || '')}" />
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm small-btn" data-action="move-flow" data-direction="up" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">⬆️</button>
        <button class="btn btn-ghost btn-sm small-btn" data-action="move-flow" data-direction="down" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">⬇️</button>
        <button class="btn btn-ghost btn-sm small-btn" data-action="delete-flow" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">حذف</button>
      </div>
    </div>
  `;
}

function renderConceptSection(index) {
  const concept = state.concepts[index] || { title: '', flow: [] };
  const flowItems = concept.flow.length ? concept.flow : [];

  elements.editorContent.innerHTML = `
    <h2 class="section-title">المفهوم ${index + 1}</h2>
    <div class="field">
      <label class="label">عنوان المفهوم</label>
      <input class="input" data-concept-title="true" data-concept-index="${index}" value="${escapeHtml(concept.title || '')}" />
    </div>
    <div>
      ${flowItems.length
        ? flowItems.map((item, flowIndex) => renderFlowItem(item, index, flowIndex)).join('')
        : '<p class="muted">لا يوجد عناصر بعد. استخدم زر إضافة عنصر.</p>'}
    </div>
  `;
}

function renderAssessmentSection() {
  const assessment = state.assessment || { title: '', description: '', questions: [] };
  const questions = assessment.questions.length ? assessment.questions : [];

  elements.editorContent.innerHTML = `
    <h2 class="section-title">التقييم النهائي</h2>
    <div class="field">
      <label class="label">عنوان التقييم</label>
      <input class="input" data-assessment-field="title" value="${escapeHtml(assessment.title || '')}" />
    </div>
    <div class="field">
      <label class="label">الوصف</label>
      <textarea class="input" rows="2" data-assessment-field="description">${escapeHtml(assessment.description || '')}</textarea>
    </div>
    <div>
      ${questions.length
        ? questions
            .map(
              (question, index) => `
                <div class="item-card" data-question-index="${index}">
                  <label class="label">سؤال ${index + 1}</label>
                  <select class="input" data-question-field="type" data-question-index="${index}">
                    <option value="mcq" ${question.type === 'mcq' ? 'selected' : ''}>اختيار متعدد</option>
                    <option value="input" ${question.type === 'input' ? 'selected' : ''}>إجابة نصية</option>
                  </select>
                  <input class="input" data-question-field="text" data-question-index="${index}" value="${escapeHtml(question.text || '')}" />
                  <div class="row" style="margin-top: 8px;">
                    <input class="input ltr" data-question-field="points" data-question-index="${index}" value="${escapeHtml(question.points ?? 1)}" />
                    <span class="small muted">الدرجة</span>
                  </div>
                  ${question.type === 'input' ? `
                    <div class="field">
                      <label class="label">الإجابة النموذجية</label>
                      <input class="input" data-question-field="answer" data-question-index="${index}" value="${escapeHtml(question.answer || '')}" />
                    </div>
                  ` : `
                    <div class="field">
                      <label class="label">الاختيارات</label>
                      ${renderAssessmentChoices(question.choices || [], index)}
                    </div>
                    <div class="field">
                      <label class="label">رقم الإجابة الصحيحة</label>
                      <input class="input ltr" data-question-field="correctIndex" data-question-index="${index}" value="${escapeHtml(question.correctIndex ?? 0)}" />
                    </div>
                  `}
                  <div class="item-actions">
                    <button class="btn btn-ghost btn-sm small-btn" data-action="move-question" data-direction="up" data-question-index="${index}">⬆️</button>
                    <button class="btn btn-ghost btn-sm small-btn" data-action="move-question" data-direction="down" data-question-index="${index}">⬇️</button>
                    <button class="btn btn-ghost btn-sm small-btn" data-action="delete-question" data-question-index="${index}">حذف</button>
                  </div>
                </div>
              `
            )
            .join('')
        : '<p class="muted">لا يوجد أسئلة بعد. استخدم زر إضافة سؤال.</p>'}
    </div>
  `;
}

function renderAssessmentChoices(list, questionIndex) {
  const items = list.length ? list : [''];
  return `
    <div class="inline-input">
      ${items
        .map(
          (value, index) => `
            <div class="row" style="margin-top: 6px;">
              <input class="input" data-question-choice="true" data-question-index="${questionIndex}" data-index="${index}" value="${escapeHtml(value)}" />
              <button class="btn btn-ghost btn-sm small-btn" data-action="delete-question-choice" data-question-index="${questionIndex}" data-index="${index}">حذف</button>
            </div>
          `
        )
        .join('')}
      <button class="btn btn-ghost btn-sm small-btn" data-action="add-question-choice" data-question-index="${questionIndex}">إضافة اختيار</button>
    </div>
  `;
}

function renderPanel() {
  if (state.activeSection === 'goals') {
    renderGoalsSection();
  } else if (state.activeSection === 'prerequisites') {
    renderPrereqSection();
  } else if (state.activeSection.startsWith('concept-')) {
    const index = Number(state.activeSection.split('-')[1]);
    renderConceptSection(index);
  } else if (state.activeSection === 'assessment') {
    renderAssessmentSection();
  }
}

function renderAll() {
  renderSidebar();
  renderPanel();
}

function moveItem(array, fromIndex, direction) {
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= array.length) return;
  const item = array.splice(fromIndex, 1)[0];
  array.splice(toIndex, 0, item);
  setDirty(true);
  renderAll();
}

function handleSidebarClick(event) {
  const item = event.target.closest('.sidebar-item');
  if (!item) return;
  state.activeSection = item.dataset.section;
  renderAll();
}

function handleEditorInput(event) {
  const target = event.target;
  if (target.dataset.type === 'goal') {
    const index = Number(target.dataset.index);
    state.goals[index] = target.value;
    setDirty(true);
    return;
  }

  if (target.dataset.type === 'prereq') {
    const index = Number(target.dataset.index);
    state.prerequisites[index] = target.value;
    setDirty(true);
    return;
  }

  if (target.dataset.conceptTitle) {
    const index = Number(target.dataset.conceptIndex);
    state.concepts[index].title = target.value;
    setDirty(true);
    renderSidebar();
    return;
  }

  if (target.dataset.field) {
    const conceptIndex = Number(target.dataset.conceptIndex);
    const flowIndex = Number(target.dataset.flowIndex);
    const field = target.dataset.field;
    state.concepts[conceptIndex].flow[flowIndex][field] = target.value;
    setDirty(true);
    if (field === 'type') {
      renderPanel();
    }
    return;
  }

  if (target.dataset.list) {
    const conceptIndex = Number(target.dataset.conceptIndex);
    const flowIndex = Number(target.dataset.flowIndex);
    const listName = target.dataset.list;
    const index = Number(target.dataset.index);
    const list = state.concepts[conceptIndex].flow[flowIndex][listName] || [];
    list[index] = target.value;
    state.concepts[conceptIndex].flow[flowIndex][listName] = list;
    setDirty(true);
    return;
  }

  if (target.dataset.assessmentField) {
    const field = target.dataset.assessmentField;
    state.assessment[field] = target.value;
    setDirty(true);
    return;
  }

  if (target.dataset.questionField) {
    const index = Number(target.dataset.questionIndex);
    const field = target.dataset.questionField;
    state.assessment.questions[index][field] = target.value;
    setDirty(true);
    renderPanel();
    return;
  }

  if (target.dataset.questionChoice) {
    const questionIndex = Number(target.dataset.questionIndex);
    const index = Number(target.dataset.index);
    const choices = state.assessment.questions[questionIndex].choices || [];
    choices[index] = target.value;
    state.assessment.questions[questionIndex].choices = choices;
    setDirty(true);
  }
}

function handleEditorClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;

  if (action === 'add-goal') {
    state.goals.push('');
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'delete-goal') {
    const index = Number(button.dataset.index);
    state.goals.splice(index, 1);
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'move-goal') {
    const index = Number(button.dataset.index);
    moveItem(state.goals, index, button.dataset.direction);
    return;
  }

  if (action === 'add-prereq') {
    state.prerequisites.push('');
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'delete-prereq') {
    const index = Number(button.dataset.index);
    state.prerequisites.splice(index, 1);
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'move-prereq') {
    const index = Number(button.dataset.index);
    moveItem(state.prerequisites, index, button.dataset.direction);
    return;
  }

  if (action === 'add-list-item') {
    const conceptIndex = Number(button.dataset.conceptIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    const listName = button.dataset.list;
    const list = state.concepts[conceptIndex].flow[flowIndex][listName] || [];
    list.push('');
    state.concepts[conceptIndex].flow[flowIndex][listName] = list;
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'delete-list-item') {
    const conceptIndex = Number(button.dataset.conceptIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    const listName = button.dataset.list;
    const index = Number(button.dataset.index);
    const list = state.concepts[conceptIndex].flow[flowIndex][listName] || [];
    list.splice(index, 1);
    state.concepts[conceptIndex].flow[flowIndex][listName] = list;
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'delete-flow') {
    const conceptIndex = Number(button.dataset.conceptIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    state.concepts[conceptIndex].flow.splice(flowIndex, 1);
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'move-flow') {
    const conceptIndex = Number(button.dataset.conceptIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    moveItem(state.concepts[conceptIndex].flow, flowIndex, button.dataset.direction);
    return;
  }

  if (action === 'delete-question') {
    const index = Number(button.dataset.questionIndex);
    state.assessment.questions.splice(index, 1);
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'move-question') {
    const index = Number(button.dataset.questionIndex);
    moveItem(state.assessment.questions, index, button.dataset.direction);
    return;
  }

  if (action === 'add-question-choice') {
    const questionIndex = Number(button.dataset.questionIndex);
    const choices = state.assessment.questions[questionIndex].choices || [];
    choices.push('');
    state.assessment.questions[questionIndex].choices = choices;
    setDirty(true);
    renderPanel();
    return;
  }

  if (action === 'delete-question-choice') {
    const questionIndex = Number(button.dataset.questionIndex);
    const index = Number(button.dataset.index);
    const choices = state.assessment.questions[questionIndex].choices || [];
    choices.splice(index, 1);
    state.assessment.questions[questionIndex].choices = choices;
    setDirty(true);
    renderPanel();
  }
}

function addConcept() {
  state.concepts.push({ title: '', flow: [] });
  state.activeSection = `concept-${state.concepts.length - 1}`;
  setDirty(true);
  renderAll();
}

function addFlowItem() {
  if (!state.activeSection.startsWith('concept-')) {
    showToast('تنبيه', 'اختر مفهومًا لإضافة عنصر.', 'warning');
    return;
  }
  const index = Number(state.activeSection.split('-')[1]);
  state.concepts[index].flow.push({ type: 'goal', text: '', title: '', description: '', url: '', answer: '', correctIndex: 0, solution: '', details: [], hints: [], choices: [] });
  setDirty(true);
  renderPanel();
}

function addQuestion() {
  const questions = state.assessment.questions || [];
  questions.push({ type: 'mcq', text: '', points: 1, choices: [''], correctIndex: 0, answer: '' });
  state.assessment.questions = questions;
  setDirty(true);
  renderPanel();
}

async function saveContent() {
  const payload = {
    week: state.week,
    seq: state.seq,
    title: state.title,
    goals: state.goals.filter((goal) => normalizeValue(goal)),
    prerequisites: state.prerequisites.filter((item) => normalizeValue(item)),
    concepts: state.concepts.map((concept) => ({
      title: normalizeValue(concept.title),
      flow: (concept.flow || []).map((item) => ({
        type: normalizeValue(item.type),
        text: normalizeValue(item.text),
        title: normalizeValue(item.title),
        description: normalizeValue(item.description),
        url: normalizeValue(item.url),
        answer: normalizeValue(item.answer),
        correctIndex: item.correctIndex ?? 0,
        solution: normalizeValue(item.solution),
        details: (item.details || []).filter((entry) => normalizeValue(entry)),
        hints: (item.hints || []).filter((entry) => normalizeValue(entry)),
        choices: (item.choices || []).filter((entry) => normalizeValue(entry))
      }))
    })),
    assessment: {
      title: normalizeValue(state.assessment.title),
      description: normalizeValue(state.assessment.description),
      questions: (state.assessment.questions || []).map((question) => ({
        type: normalizeValue(question.type) || 'input',
        text: normalizeValue(question.text),
        points: Number(question.points) || 1,
        answer: normalizeValue(question.answer),
        correctIndex: question.correctIndex ?? 0,
        choices: (question.choices || []).filter((entry) => normalizeValue(entry))
      }))
    }
  };

  try {
    const response = await fetch(`/api/mng/weeks/${encodeURIComponent(state.week)}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || 'تعذر حفظ المحتوى.');
    }

    setDirty(false);
    showToast('نجاح', 'تم الحفظ', 'success');
  } catch (error) {
    showToast('خطأ', error.message || 'تعذر حفظ المحتوى.', 'error');
  }
}

function openLeaveModal(callback) {
  state.pendingNavigation = callback;
  elements.confirmLeave.classList.remove('hidden');
  elements.confirmLeave.setAttribute('aria-hidden', 'false');
}

function closeLeaveModal() {
  elements.confirmLeave.classList.add('hidden');
  elements.confirmLeave.setAttribute('aria-hidden', 'true');
  state.pendingNavigation = null;
}

function handleBackClick(event) {
  if (!state.dirty) return;
  event.preventDefault();
  openLeaveModal(() => {
    window.location.href = event.currentTarget.href;
  });
}

function bindEvents() {
  elements.sectionsList.addEventListener('click', handleSidebarClick);
  elements.editorContent.addEventListener('input', handleEditorInput);
  elements.editorContent.addEventListener('click', handleEditorClick);
  elements.btnAddConcept.addEventListener('click', addConcept);
  elements.btnAddItem.addEventListener('click', addFlowItem);
  elements.btnAddQuestion.addEventListener('click', addQuestion);
  elements.btnSave.addEventListener('click', saveContent);
  elements.btnBack.addEventListener('click', handleBackClick);
  elements.btnCloseLeave.addEventListener('click', closeLeaveModal);
  elements.btnCancelLeave.addEventListener('click', closeLeaveModal);
  elements.confirmLeave.addEventListener('click', (event) => {
    if (event.target.dataset?.close) closeLeaveModal();
  });
  elements.btnConfirmLeave.addEventListener('click', () => {
    if (state.pendingNavigation) {
      const next = state.pendingNavigation;
      closeLeaveModal();
      next();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

async function init() {
  const week = getWeekParam();
  if (!week) {
    elements.editorContent.textContent = 'رقم البطاقة غير صالح.';
    return;
  }

  state.week = week;
  bindEvents();

  try {
    const response = await fetch(`/api/mng/weeks/${encodeURIComponent(week)}/content`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || 'تعذر تحميل المحتوى.');
    }

    state.seq = data.seq;
    state.title = data.title || '';
    state.goals = Array.isArray(data.goals) ? data.goals : [];
    state.prerequisites = Array.isArray(data.prerequisites) ? data.prerequisites : [];
    state.concepts = Array.isArray(data.concepts) ? data.concepts : [];
    state.assessment = data.assessment || { title: '', description: '', questions: [] };

    setHeader();
    renderAll();
  } catch (error) {
    elements.editorContent.textContent = 'تعذر تحميل المحتوى.';
    showToast('خطأ', error.message || 'تعذر تحميل المحتوى.', 'error');
  }
}

init();
