import { showToast } from '../ui/toast.js';

const elements = {
  cardTitle: document.getElementById('cardTitle'),
  cardSubtitle: document.getElementById('cardSubtitle'),
  saveStatus: document.getElementById('saveStatus'),
  sectionsList: document.getElementById('sectionsList'),
  editorContent: document.getElementById('editorContent'),
  btnSave: document.getElementById('btnSave'),
  btnAddConcept: document.getElementById('btnAddConcept'),
  btnAddItem: document.getElementById('btnAddItem'),
  btnAddImage: document.getElementById('btnAddImage'),
  btnAddQuestion: document.getElementById('btnAddQuestion'),
  btnPreview: document.getElementById('btnPreview'),
  btnFab: document.getElementById('btnFab'),
  mobileSheet: document.getElementById('mobileSheet'),
  btnBack: document.getElementById('btnBack'),
  confirmLeave: document.getElementById('confirmLeave'),
  btnCloseLeave: document.getElementById('btnCloseLeave'),
  btnCancelLeave: document.getElementById('btnCancelLeave'),
  btnConfirmLeave: document.getElementById('btnConfirmLeave'),
  imageEditor: document.getElementById('imageEditor'),
  imageEditorPreview: document.getElementById('imageEditorPreview'),
  imageEditorThumb: document.getElementById('imageEditorThumb'),
  btnCloseImageEditor: document.getElementById('btnCloseImageEditor'),
  btnCancelImageEdit: document.getElementById('btnCancelImageEdit'),
  btnApplyImageEdit: document.getElementById('btnApplyImageEdit')
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
  saving: false,
  pendingNavigation: null
};

const imageEditorState = {
  cropper: null,
  activeEntry: null,
  aspect: 'free',
  frame: 'none',
  flip: 1
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
  updateSaveStatus();
}

function setSaving(value = true) {
  state.saving = value;
  updateSaveStatus();
}

function updateSaveStatus() {
  if (!elements.saveStatus) return;
  if (state.saving) {
    elements.saveStatus.textContent = 'جارٍ الحفظ...';
    elements.saveStatus.style.color = '#f97316';
    elements.saveStatus.style.borderColor = '#fed7aa';
    elements.saveStatus.style.background = '#fff7ed';
    return;
  }

  if (state.dirty) {
    elements.saveStatus.textContent = 'غير محفوظ';
    elements.saveStatus.style.color = '#dc2626';
    elements.saveStatus.style.borderColor = '#fecaca';
    elements.saveStatus.style.background = '#fef2f2';
    return;
  }

  elements.saveStatus.textContent = 'تم الحفظ';
  elements.saveStatus.style.color = '#10b981';
  elements.saveStatus.style.borderColor = '#bbf7d0';
  elements.saveStatus.style.background = '#ecfdf3';
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
  updateSaveStatus();
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

function renderHintsList(list, conceptIndex, flowIndex) {
  const items = Array.isArray(list) ? [...list] : [];
  while (items.length < 3) items.push('');
  return renderStringList(items, 'hints', conceptIndex, flowIndex);
}

function renderFlowItem(item, conceptIndex, flowIndex) {
  const type = item.type || 'goal';
  const showText = ['goal', 'explain', 'question', 'note', 'mcq'].includes(type);
  const showTitle = ['explain', 'video'].includes(type);
  const showDescription = ['explain', 'note', 'image', 'video'].includes(type);
  const showUrl = ['image', 'video'].includes(type);
  const showAnswer = ['question', 'mcq'].includes(type);
  const showChoices = type === 'mcq';
  const showHints = ['question', 'mcq', 'ordering'].includes(type);
  const isUploading = Boolean(item.uploading);
  const imageFiles = Array.isArray(item.imageFiles) ? item.imageFiles : [];
  const uploadStatus = item.uploadStatus;

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
      ${type === 'image' ? `
        <div class="field">
          <label class="label">رفع صورة</label>
          <div class="item-row">
            <input class="input" type="file" accept="image/*" multiple data-image-file="true" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" ${isUploading ? 'disabled' : ''} />
            <button class="btn btn-outline btn-sm" data-action="upload-image" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}" ${isUploading ? 'disabled' : ''}>
              ${isUploading ? 'جاري الرفع...' : 'رفع'}
            </button>
          </div>
          <div class="help">يمكن اختيار أكثر من صورة في نفس المرة.</div>
          ${imageFiles.length ? `
            <div class="image-gallery">
              ${imageFiles.map((entry) => `
                <div class="image-thumb">
                  <img src="${escapeHtml(entry.editedUrl || entry.previewUrl || '')}" alt="معاينة" />
                  <div class="image-thumb-actions">
                    <button class="btn btn-ghost btn-sm small-btn" data-action="edit-image" data-image-id="${entry.id}" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">تعديل</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${uploadStatus ? `<div class="upload-progress">${escapeHtml(uploadStatus)}</div>` : ''}
          ${item.url ? `
            <div class="image-preview">
              <img src="${escapeHtml(item.url)}" alt="صورة البطاقة" loading="lazy" />
              <button class="btn btn-ghost btn-sm small-btn" data-action="copy-image-url" data-concept-index="${conceptIndex}" data-flow-index="${flowIndex}">نسخ الرابط</button>
            </div>
          ` : ''}
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
      ${showHints ? `
        <div class="field">
          <details class="hint-panel">
            <summary>تلميحات السؤال</summary>
            ${renderHintsList(item.hints || [], conceptIndex, flowIndex)}
          </details>
        </div>
      ` : ''}
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

function handleEditorChange(event) {
  const target = event.target;
  if (!target.dataset.imageFile) return;
  const conceptIndex = Number(target.dataset.conceptIndex);
  const flowIndex = Number(target.dataset.flowIndex);
  const flowItem = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
  if (!flowItem) return;
  const files = Array.from(target.files || []);
  flowItem.imageFiles = files.map((file) => createImageEntry(file));
  setDirty(true);
  renderPanel();
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

  if (action === 'copy-image-url') {
    const conceptIndex = Number(button.dataset.conceptIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    const url = state.concepts?.[conceptIndex]?.flow?.[flowIndex]?.url;
    if (!url) {
      showToast('تنبيه', 'لا يوجد رابط لنسخه.', 'warning');
      return;
    }
    navigator.clipboard?.writeText(url).then(
      () => showToast('نجاح', 'تم نسخ الرابط.', 'success'),
      () => showToast('خطأ', 'تعذر نسخ الرابط.', 'error')
    );
    return;
  }

  if (action === 'edit-image') {
    const conceptIndex = Number(button.dataset.conceptIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    const imageId = button.dataset.imageId;
    openImageEditor(conceptIndex, flowIndex, imageId);
    return;
  }

  if (action === 'upload-image') {
    const conceptIndex = Number(button.dataset.conceptIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    handleImageUpload(conceptIndex, flowIndex);
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

function addFlowItem(type = 'question') {
  if (!state.activeSection.startsWith('concept-')) {
    showToast('تنبيه', 'اختر مفهومًا لإضافة عنصر.', 'warning');
    return;
  }
  const index = Number(state.activeSection.split('-')[1]);
  state.concepts[index].flow.push({ type, text: '', title: '', description: '', url: '', answer: '', correctIndex: 0, solution: '', details: [], hints: [], choices: [] });
  setDirty(true);
  renderPanel();
}

function addImageItem() {
  if (!state.activeSection.startsWith('concept-')) {
    showToast('تنبيه', 'اختر مفهومًا لإضافة صورة.', 'warning');
    return;
  }
  const index = Number(state.activeSection.split('-')[1]);
  state.concepts[index].flow.push({
    type: 'image',
    text: '',
    title: '',
    description: '',
    url: '',
    answer: '',
    correctIndex: 0,
    solution: '',
    details: [],
    hints: [],
    choices: [],
    imageFiles: []
  });
  setDirty(true);
  renderPanel();
}

function createImageEntry(file) {
  const previewUrl = URL.createObjectURL(file);
  return {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file,
    type: file.type || 'image/jpeg',
    previewUrl,
    editedBlob: null,
    editedUrl: null,
    frame: 'none',
    aspect: 'free'
  };
}

function getOutputSize(aspect, cropper) {
  if (aspect === '1') return { width: 1080, height: 1080 };
  if (aspect === '4/3') return { width: 1200, height: 900 };
  if (aspect === '16/9') return { width: 1280, height: 720 };

  const data = cropper.getData(true);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const clamp = (value, min, max) => Math.min(Math.max(Math.round(value), min), max);
  const width = clamp(data.width * pixelRatio, 320, 2048);
  const height = clamp(data.height * pixelRatio, 320, 2048);
  return { width, height };
}

function applyFrameToCanvas(canvas, frame) {
  if (frame === 'none') return canvas;

  const result = document.createElement('canvas');
  result.width = canvas.width;
  result.height = canvas.height;
  const ctx = result.getContext('2d');

  if (frame === 'rounded') {
    const radius = Math.max(16, Math.round(canvas.width * 0.04));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, radius);
    ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, radius);
    ctx.arcTo(0, canvas.height, 0, 0, radius);
    ctx.arcTo(0, 0, canvas.width, 0, radius);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
    return result;
  }

  ctx.drawImage(canvas, 0, 0);
  const border = Math.max(6, Math.round(canvas.width * 0.01));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, canvas.width - border, canvas.height - border);
  return result;
}

async function requestUploadSasBatch(week, files) {
  const response = await fetch('/api/mng/media/sas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      week,
      files: files.map((file) => ({ name: file.name, type: file.type }))
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'تعذر إنشاء رابط الرفع.');
  }
  return data;
}

async function uploadFileToBlob(uploadUrl, file) {
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error('تعذر رفع الملف.');
  }
}

async function handleImageUpload(conceptIndex, flowIndex) {
  const flowItem = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
  if (!flowItem) return;
  const images = Array.isArray(flowItem.imageFiles) ? flowItem.imageFiles : [];
  if (!images.length) {
    showToast('تنبيه', 'اختر صورة أولاً.', 'warning');
    return;
  }

  flowItem.uploading = true;
  flowItem.uploadStatus = 'جارٍ تجهيز الصور...';
  renderPanel();

  // ملاحظة: يجب تفعيل CORS في Azure Storage للسماح بـ PUT/GET/HEAD/OPTIONS
  // مع headers: x-ms-blob-type, content-type للـ origin الخاص بالتطبيق.
  const successes = [];
  const uploadEntries = images.map((entry) => {
    const blob = entry.editedBlob || entry.file;
    return {
      entry,
      blob,
      name: entry.file?.name || 'image.png',
      type: blob.type || entry.type || 'image/png'
    };
  });

  try {
    const sasResponse = await requestUploadSasBatch(state.week, uploadEntries);
    const items = Array.isArray(sasResponse.items) ? sasResponse.items : [];
    if (items.length !== uploadEntries.length) {
      throw new Error('بيانات الرفع غير مكتملة.');
    }

    for (let i = 0; i < uploadEntries.length; i += 1) {
      const entry = uploadEntries[i];
      const sasItem = items[i];
      flowItem.uploadStatus = `جارٍ رفع ${i + 1} من ${uploadEntries.length}...`;
      renderPanel();
      try {
        await uploadFileToBlob(sasItem.uploadUrl, entry.blob);
        successes.push(sasItem.readUrl);
      } catch (error) {
        showToast('خطأ', `تعذر رفع ${entry.name || 'الصورة'}.`, 'error');
      }
    }
  } catch (error) {
    showToast('خطأ', error.message || 'تعذر رفع الصور.', 'error');
  }

  flowItem.imageFiles = [];
  flowItem.uploading = false;
  flowItem.uploadStatus = '';

  if (successes.length) {
    const [first, ...rest] = successes;
    flowItem.url = first;
    if (rest.length) {
      const insertIndex = flowIndex + 1;
      const newItems = rest.map((url) => ({
        type: 'image',
        text: '',
        title: '',
        description: '',
        url,
        answer: '',
        correctIndex: 0,
        solution: '',
        details: [],
        hints: [],
        choices: []
      }));
      state.concepts[conceptIndex].flow.splice(insertIndex, 0, ...newItems);
    }
    setDirty(true);
    showToast('نجاح', rest.length ? 'تم رفع الصور.' : 'تم رفع الصورة.', 'success');
  }

  renderPanel();
}

function openImageEditor(conceptIndex, flowIndex, imageId) {
  const flowItem = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
  if (!flowItem) return;
  const entry = (flowItem.imageFiles || []).find((file) => file.id === imageId);
  if (!entry) return;
  if (typeof Cropper === 'undefined') {
    showToast('خطأ', 'محرر الصور غير متاح حالياً.', 'error');
    return;
  }

  if (imageEditorState.cropper) {
    imageEditorState.cropper.destroy();
    imageEditorState.cropper = null;
  }

  imageEditorState.activeEntry = { conceptIndex, flowIndex, entry };
  imageEditorState.aspect = entry.aspect || 'free';
  imageEditorState.frame = entry.frame || 'none';
  imageEditorState.flip = 1;

  elements.imageEditorPreview.onload = () => {
    const aspectValue = imageEditorState.aspect === 'free' ? NaN : Number(imageEditorState.aspect);
    imageEditorState.cropper = new Cropper(elements.imageEditorPreview, {
      aspectRatio: Number.isFinite(aspectValue) ? aspectValue : NaN,
      viewMode: 1,
      autoCropArea: 1,
      background: false,
      dragMode: 'move',
      ready: () => updateImageEditorThumb(),
      crop: () => updateImageEditorThumb()
    });
  };

  elements.imageEditorPreview.src = entry.editedUrl || entry.previewUrl;
  elements.imageEditorThumb.src = entry.editedUrl || entry.previewUrl;

  elements.imageEditor.classList.remove('hidden');
  elements.imageEditor.setAttribute('aria-hidden', 'false');
}

function closeImageEditor() {
  if (imageEditorState.cropper) {
    imageEditorState.cropper.destroy();
    imageEditorState.cropper = null;
  }
  imageEditorState.activeEntry = null;
  elements.imageEditor.classList.add('hidden');
  elements.imageEditor.setAttribute('aria-hidden', 'true');
}

function updateImageEditorThumb() {
  if (!imageEditorState.cropper) return;
  const canvas = imageEditorState.cropper.getCroppedCanvas({ width: 240, height: 240 });
  if (!canvas) return;
  const framed = applyFrameToCanvas(canvas, imageEditorState.frame);
  elements.imageEditorThumb.src = framed.toDataURL('image/png');
}

function applyImageEdit() {
  if (!imageEditorState.cropper || !imageEditorState.activeEntry) return;
  const { entry } = imageEditorState.activeEntry;
  const { width, height } = getOutputSize(imageEditorState.aspect, imageEditorState.cropper);
  let canvas = imageEditorState.cropper.getCroppedCanvas({
    width,
    height,
    imageSmoothingQuality: 'high'
  });
  if (!canvas) return;
  canvas = applyFrameToCanvas(canvas, imageEditorState.frame);

  const outputType = imageEditorState.frame === 'rounded' || entry.type === 'image/png'
    ? 'image/png'
    : 'image/jpeg';
  const quality = outputType === 'image/jpeg' ? 0.92 : 1;

  canvas.toBlob((blob) => {
    if (!blob) return;
    if (entry.editedUrl) URL.revokeObjectURL(entry.editedUrl);
    entry.editedBlob = blob;
    entry.editedUrl = URL.createObjectURL(blob);
    entry.type = outputType;
    entry.frame = imageEditorState.frame;
    entry.aspect = imageEditorState.aspect;
    setDirty(true);
    closeImageEditor();
    renderPanel();
    showToast('نجاح', 'تم تحديث الصورة.', 'success');
  }, outputType, quality);
}

function addQuestion() {
  if (state.activeSection === 'assessment') {
    const questions = state.assessment.questions || [];
    questions.push({ type: 'mcq', text: '', points: 1, choices: [''], correctIndex: 0, answer: '' });
    state.assessment.questions = questions;
    setDirty(true);
    renderPanel();
    return;
  }

  addFlowItem('question');
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
    setSaving(true);
    elements.btnSave.disabled = true;
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
  } finally {
    setSaving(false);
    elements.btnSave.disabled = false;
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

function openMobileSheet() {
  if (!elements.mobileSheet) return;
  elements.mobileSheet.classList.remove('hidden');
  elements.mobileSheet.setAttribute('aria-hidden', 'false');
}

function closeMobileSheet() {
  if (!elements.mobileSheet) return;
  elements.mobileSheet.classList.add('hidden');
  elements.mobileSheet.setAttribute('aria-hidden', 'true');
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
  elements.editorContent.addEventListener('change', handleEditorChange);
  elements.editorContent.addEventListener('click', handleEditorClick);
  elements.btnAddConcept.addEventListener('click', addConcept);
  elements.btnAddItem.addEventListener('click', () => addFlowItem('question'));
  elements.btnAddImage.addEventListener('click', addImageItem);
  elements.btnAddQuestion.addEventListener('click', addQuestion);
  elements.btnSave.addEventListener('click', saveContent);
  elements.btnPreview?.addEventListener('click', () => {
    if (!state.week) return;
    window.open(`/lesson.html?week=${encodeURIComponent(state.week)}`, '_blank');
    showToast('تنبيه', 'تأكد من تسجيل طالب قبل المعاينة.', 'warning');
  });
  elements.btnFab?.addEventListener('click', () => openMobileSheet());
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

  elements.mobileSheet?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-sheet-action]')?.dataset?.sheetAction;
    if (event.target.dataset?.close) {
      closeMobileSheet();
      return;
    }
    if (!action) return;
    closeMobileSheet();
    if (action === 'add-question') addFlowItem('question');
    if (action === 'add-image') addImageItem();
    if (action === 'add-section') addConcept();
    if (action === 'add-item') addFlowItem('goal');
  });

  elements.imageEditor?.addEventListener('click', (event) => {
    if (event.target.dataset?.close) {
      closeImageEditor();
      return;
    }
    const aspect = event.target.dataset?.aspect;
    if (aspect && imageEditorState.cropper) {
      imageEditorState.aspect = aspect;
      const ratio = aspect === 'free' ? NaN : Number(aspect);
      imageEditorState.cropper.setAspectRatio(Number.isFinite(ratio) ? ratio : NaN);
      updateImageEditorThumb();
      return;
    }
    const frame = event.target.dataset?.frame;
    if (frame) {
      imageEditorState.frame = frame;
      updateImageEditorThumb();
      return;
    }
    const action = event.target.dataset?.action;
    if (!action || !imageEditorState.cropper) return;
    if (action === 'zoom-in') imageEditorState.cropper.zoom(0.1);
    if (action === 'zoom-out') imageEditorState.cropper.zoom(-0.1);
    if (action === 'rotate-left') imageEditorState.cropper.rotate(-15);
    if (action === 'rotate-right') imageEditorState.cropper.rotate(15);
    if (action === 'flip') {
      imageEditorState.flip = imageEditorState.flip === 1 ? -1 : 1;
      imageEditorState.cropper.scaleX(imageEditorState.flip);
    }
    if (action === 'reset') {
      imageEditorState.cropper.reset();
      imageEditorState.flip = 1;
    }
    updateImageEditorThumb();
  });

  elements.btnCloseImageEditor?.addEventListener('click', closeImageEditor);
  elements.btnCancelImageEdit?.addEventListener('click', closeImageEditor);
  elements.btnApplyImageEdit?.addEventListener('click', applyImageEdit);

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
