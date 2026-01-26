import { showToast } from '../ui/toast.js';
import { initEngine } from '../lesson/engine.js';

const elements = {
  cardTitle: document.getElementById('cardTitle'),
  cardSubtitle: document.getElementById('cardSubtitle'),
  saveStatus: document.getElementById('saveStatus'),
  editorContent: document.getElementById('builderEdit'),
  previewPanel: document.getElementById('builderPreview'),
  btnSave: document.getElementById('btnSave'),
  btnBack: document.getElementById('btnBack'),
  previewToggle: document.getElementById('previewToggle'),
  confirmLeave: document.getElementById('confirmLeave'),
  btnCloseLeave: document.getElementById('btnCloseLeave'),
  btnCancelLeave: document.getElementById('btnCancelLeave'),
  btnConfirmLeave: document.getElementById('btnConfirmLeave'),
  imageEditor: document.getElementById('imageEditor'),
  imageEditorPreview: document.getElementById('imageEditorPreview'),
  imageEditorThumb: document.getElementById('imageEditorThumb'),
  btnCloseImageEditor: document.getElementById('btnCloseImageEditor'),
  btnCancelImageEdit: document.getElementById('btnCancelImageEdit'),
  btnApplyImageEdit: document.getElementById('btnApplyImageEdit'),
  previewLessonTitle: document.getElementById('lessonTitle'),
  previewLessonStudent: document.getElementById('lessonStudent'),
  previewLessonWeek: document.getElementById('lessonWeek'),
  previewLessonContent: document.getElementById('lessonContent')
};

const state = {
  week: null,
  seq: null,
  title: '',
  goals: [],
  prerequisites: [],
  concepts: [],
  assessment: { title: '', description: '', questions: [] },
  dirty: false,
  saving: false,
  pendingNavigation: null,
  previewEnabled: false,
  openMenu: null,
  pendingDelete: null,
  pendingAdd: null
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

function normalizeValidation(value) {
  return {
    numericOnly: Boolean(value?.numericOnly),
    fuzzyAutocorrect: Boolean(value?.fuzzyAutocorrect)
  };
}

function hasValidation(value) {
  return Boolean(value?.numericOnly || value?.fuzzyAutocorrect);
}

function parseTableTokens(text) {
  const results = [];
  const raw = String(text ?? '');
  const regex = /\[\[table:([^\]]+)\]\]/g;
  let match = null;
  while ((match = regex.exec(raw)) !== null) {
    const body = match[1];
    const [sizePart, ...cells] = body.split('|');
    const [rowsRaw, colsRaw] = String(sizePart || '').toLowerCase().split('x');
    const rows = Number(rowsRaw);
    const cols = Number(colsRaw);
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      continue;
    }
    results.push({
      token: match[0],
      start: match.index,
      end: regex.lastIndex,
      rows,
      cols,
      cells
    });
  }
  return results;
}

function buildTableToken(rows, cols, cells) {
  const total = rows * cols;
  const sanitized = Array.from({ length: total }, (_, index) => cells[index] ?? '');
  return `[[table:${rows}x${cols}|${sanitized.join('|')}]]`;
}

function replaceTableToken(text, tableIndex, nextToken) {
  const tables = parseTableTokens(text);
  const target = tables[tableIndex];
  if (!target) return text;
  return `${text.slice(0, target.start)}${nextToken}${text.slice(target.end)}`;
}

function insertTokenAtCursor(textarea, token) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = `${before}${token}${after}`;
  const nextPos = start + token.length;
  textarea.setSelectionRange(nextPos, nextPos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function setDirty(value = true) {
  state.dirty = value;
  updateSaveStatus();
  if (state.previewEnabled) schedulePreviewRender();
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

function normalizePrerequisites(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((item) => {
    if (typeof item === 'string') {
      return {
        type: 'input',
        text: item,
        choices: [],
        isRequired: true,
        hints: [],
        answer: '',
        correctIndex: 0,
        validation: normalizeValidation()
      };
    }
    if (item && typeof item === 'object') {
      return {
        type: item.type === 'mcq' ? 'mcq' : 'input',
        text: item.text || '',
        choices: Array.isArray(item.choices) ? item.choices : [],
        isRequired: item.isRequired !== false,
        hints: Array.isArray(item.hints) ? item.hints : [],
        answer: item.answer || '',
        correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : 0,
        validation: normalizeValidation(item.validation)
      };
    }
    return {
      type: 'input',
      text: '',
      choices: [],
      isRequired: true,
      hints: [],
      answer: '',
      correctIndex: 0,
      validation: normalizeValidation()
    };
  });
}

function normalizeFlowItem(item = {}) {
  const rawType = normalizeValue(item.type).toLowerCase() || 'explain';
  let type = rawType;
  if (type === 'example2') type = 'example';
  if (type === 'mistake') type = 'nonexample';
  if (['goal', 'note', 'detail'].includes(type)) type = 'explain';
  if (type === 'question') type = item.choices?.length ? 'mcq' : 'input';

  return {
    ...item,
    type,
    text: item.text || '',
    title: item.title || '',
    description: item.description || '',
    url: item.url || '',
    answer: item.answer || '',
    correctIndex: item.correctIndex ?? 0,
    solution: item.solution || '',
    isRequired: item.isRequired !== false,
    validation: normalizeValidation(item.validation),
    details: Array.isArray(item.details) ? item.details : [],
    hints: Array.isArray(item.hints) ? item.hints : [],
    choices: Array.isArray(item.choices) ? item.choices : [],
    items: Array.isArray(item.items) ? item.items : [],
    blanks: Array.isArray(item.blanks) ? item.blanks : [],
    pairs: Array.isArray(item.pairs)
      ? item.pairs.map((pair) => ({
        left: pair?.left || '',
        right: pair?.right || ''
      }))
      : [],
    imageFiles: Array.isArray(item.imageFiles) ? item.imageFiles : []
  };
}

function normalizeAssessmentQuestion(question = {}) {
  const type = ['mcq', 'input', 'ordering', 'match', 'fillblank'].includes(question.type)
    ? question.type
    : question.choices?.length
      ? 'mcq'
      : 'input';
  return {
    ...question,
    type,
    text: question.text || '',
    points: question.points ?? 1,
    answer: question.answer || '',
    correctIndex: question.correctIndex ?? 0,
    choices: Array.isArray(question.choices) ? question.choices : [],
    items: Array.isArray(question.items) ? question.items : [],
    blanks: Array.isArray(question.blanks) ? question.blanks : [],
    pairs: Array.isArray(question.pairs)
      ? question.pairs.map((pair) => ({
        left: pair?.left || '',
        right: pair?.right || ''
      }))
      : [],
    isRequired: question.isRequired !== false,
    validation: normalizeValidation(question.validation)
  };
}

function normalizeAssessment(assessment) {
  if (!assessment || typeof assessment !== 'object') {
    return { title: '', description: '', questions: [] };
  }
  const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
  return {
    title: assessment.title || '',
    description: assessment.description || '',
    questions: questions.map((question) => normalizeAssessmentQuestion(question))
  };
}

function syncGoalsWithConcepts() {
  const concepts = Array.isArray(state.concepts) ? state.concepts : [];

  if (concepts.length > state.goals.length) {
    const extra = concepts.slice(state.goals.length);
    extra.forEach((concept) => {
      state.goals.push(concept.title || 'هدف إضافي');
    });
  }

  if (state.goals.length > concepts.length) {
    const needed = state.goals.length - concepts.length;
    for (let i = 0; i < needed; i += 1) {
      concepts.push({ title: '', flow: [] });
    }
  }

  state.goals.forEach((goal, index) => {
    if (!concepts[index]) concepts[index] = { title: '', flow: [] };
    concepts[index].title = goal || `هدف ${index + 1}`;
    concepts[index].flow = (concepts[index].flow || []).map((item) => normalizeFlowItem(item));
  });

  state.concepts = concepts;
}

function buildSections() {
  const sections = [
    { id: 'goals', label: 'ماذا سنتعلم اليوم', index: 1 },
    { id: 'prereq', label: 'المتطلبات السابقة', index: 2 }
  ];

  state.goals.forEach((goal, idx) => {
    sections.push({
      id: `goal-${idx}`,
      label: goal || `هدف ${idx + 1}`,
      index: idx + 3
    });
  });

  sections.push({
    id: 'assessment',
    label: 'اختبر نفسي',
    index: sections.length + 1
  });

  return sections;
}

function renderActionMenu({ id, actions, align = 'left' }) {
  const isOpen = state.openMenu === id;
  return `
    <div class="action-menu ${isOpen ? 'open' : ''}" data-menu="${id}" style="${align === 'right' ? 'right:0;left:auto;' : ''}">
      ${actions
        .map(
          (action) =>
            `<button type="button" data-action="${action.action}" ${action.data || ''}>${action.label}</button>`
        )
        .join('')}
    </div>
  `;
}

function renderConfirmInline({ id, message }) {
  if (!state.pendingDelete || state.pendingDelete.id !== id) return '';
  return `
    <div class="confirm-inline">
      <span>${escapeHtml(message)}</span>
      <div class="row">
        <button class="btn btn-primary btn-sm" data-action="confirm-delete" data-target="${id}">تأكيد</button>
        <button class="btn btn-outline btn-sm" data-action="cancel-delete">إلغاء</button>
      </div>
    </div>
  `;
}

function renderGoalsSection(sectionIndex) {
  const goals = state.goals.length ? state.goals : [''];
  const sectionId = 'goals-section';

  return `
    <section class="section-card" data-section="goals">
      <div class="section-header">
        <div class="section-title">
          <div>
            <span class="section-index">${sectionIndex}</span>
            <h2>ماذا سنتعلم اليوم</h2>
          </div>
          <p class="section-subtitle">أضف أهداف التعلم، وسيتم إنشاء قسم تلقائي لكل هدف.</p>
        </div>
        <div class="section-actions">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        </div>
      </div>
      <div class="section-body">
        ${goals
          .map((goal, index) => {
            const menuId = `goal-menu-${index}`;
            return `
              <div class="goal-row" draggable="true" data-drag-type="goal" data-goal-index="${index}">
                <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                <input class="input" data-goal-index="${index}" value="${escapeHtml(goal)}" placeholder="اكتب الهدف هنا" />
                <div class="section-actions">
                  <button class="action-menu-btn" data-action="toggle-menu" data-menu-id="${menuId}">⋮</button>
                  ${renderActionMenu({
                    id: menuId,
                    actions: [
                      { action: 'duplicate-goal', label: 'تكرار', data: `data-goal-index="${index}"` },
                      { action: 'move-goal-up', label: 'تحريك للأعلى', data: `data-goal-index="${index}"` },
                      { action: 'move-goal-down', label: 'تحريك للأسفل', data: `data-goal-index="${index}"` },
                      { action: 'delete-goal', label: 'حذف', data: `data-goal-index="${index}"` }
                    ]
                  })}
                </div>
              </div>
              ${renderConfirmInline({
                id: `${sectionId}-${index}`,
                message: 'سيتم حذف الهدف وقسمه المرتبط. هل أنت متأكد؟'
              })}
            `;
          })
          .join('')}
      </div>
      <div class="section-footer">
        <button class="section-add" data-action="add-goal">+ إضافة هدف</button>
      </div>
    </section>
  `;
}

function renderPrereqSection(sectionIndex) {
  const prereqs = state.prerequisites.length ? state.prerequisites : [];
  return `
    <section class="section-card" data-section="prereq">
      <div class="section-header">
        <div class="section-title">
          <div>
            <span class="section-index">${sectionIndex}</span>
            <h2>المتطلبات السابقة</h2>
          </div>
          <p class="section-subtitle">أسئلة تمهيدية خفيفة لقياس المعرفة السابقة بدون تصحيح.</p>
        </div>
        <div class="section-actions">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        </div>
      </div>
      <div class="section-body">
        ${prereqs
          .map((item, index) => {
            const menuId = `prereq-menu-${index}`;
            const type = item.type === 'mcq' ? 'mcq' : 'input';
            return `
              <div class="block-card" draggable="true" data-drag-type="prereq" data-prereq-index="${index}">
                <div class="block-header">
                  <span class="block-label">سؤال تمهيدي</span>
                  <div class="block-actions">
                    <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                    <button class="action-menu-btn" data-action="toggle-menu" data-menu-id="${menuId}">⋮</button>
                    ${renderActionMenu({
                      id: menuId,
                      actions: [
                        { action: 'duplicate-prereq', label: 'تكرار', data: `data-prereq-index="${index}"` },
                        { action: 'move-prereq-up', label: 'تحريك للأعلى', data: `data-prereq-index="${index}"` },
                        { action: 'move-prereq-down', label: 'تحريك للأسفل', data: `data-prereq-index="${index}"` },
                        { action: 'delete-prereq', label: 'حذف', data: `data-prereq-index="${index}"` }
                      ]
                    })}
                  </div>
                </div>
                <div class="block-body">
                  <div class="field">
                    <label class="label">نوع السؤال</label>
                    <select class="input" data-prereq-field="type" data-prereq-index="${index}">
                      <option value="input" ${type === 'input' ? 'selected' : ''}>إجابة قصيرة</option>
                      <option value="mcq" ${type === 'mcq' ? 'selected' : ''}>اختيار متعدد</option>
                    </select>
                  </div>
                  <div class="field">
                    <label class="label">نص السؤال</label>
                    <input class="input" data-prereq-field="text" data-prereq-index="${index}" value="${escapeHtml(item.text || '')}" />
                  </div>
                  <div class="field">
                    <label class="label">حالة السؤال</label>
                    <label class="toggle-row">
                      <input type="checkbox" data-prereq-field="isRequired" data-prereq-index="${index}" ${item.isRequired !== false ? 'checked' : ''} />
                      <span>سؤال مطلوب</span>
                    </label>
                  </div>
                  ${type === 'mcq'
                    ? `
                      <div class="field">
                        <label class="label">الاختيارات</label>
                        ${renderInlineList({
                          list: item.choices || [],
                          listType: 'prereq-choices',
                          index
                        })}
                      </div>
                      <div class="field">
                        <label class="label">رقم الإجابة الصحيحة</label>
                        <input class="input ltr" data-prereq-field="correctIndex" data-prereq-index="${index}" value="${escapeHtml(item.correctIndex ?? 0)}" />
                      </div>
                    `
                    : ''}
                  ${type === 'input'
                    ? `
                      <div class="field">
                        <label class="label">الإجابة الصحيحة</label>
                        <input class="input" data-prereq-field="answer" data-prereq-index="${index}" value="${escapeHtml(item.answer || '')}" />
                      </div>
                      <div class="field">
                        <label class="label">خيارات التحقق</label>
                        <label class="toggle-row">
                          <input type="checkbox" data-prereq-validation="numericOnly" data-prereq-index="${index}" ${item.validation?.numericOnly ? 'checked' : ''} />
                          <span>أرقام فقط</span>
                        </label>
                        <label class="toggle-row">
                          <input type="checkbox" data-prereq-validation="fuzzyAutocorrect" data-prereq-index="${index}" ${item.validation?.fuzzyAutocorrect ? 'checked' : ''} />
                          <span>تصحيح تقريبي للنص</span>
                        </label>
                      </div>
                    `
                    : ''}
                  <div class="field">
                    <label class="label">تلميحات (حتى 3)</label>
                    ${renderInlineList({
                      list: item.hints || [],
                      listType: 'prereq-hints',
                      index
                    })}
                  </div>
                </div>
                ${renderConfirmInline({
                  id: `prereq-${index}`,
                  message: 'هل تريد حذف هذا السؤال التمهيدي؟'
                })}
              </div>
            `;
          })
          .join('')}
        ${prereqs.length ? '' : '<p class="muted">لا توجد أسئلة تمهيدية بعد.</p>'}
      </div>
      <div class="section-footer">
        <button class="section-add" data-action="add-prereq">+ إضافة سؤال تمهيدي</button>
      </div>
    </section>
  `;
}

function renderGoalSection(sectionIndex, goalIndex) {
  const goalText = state.goals[goalIndex] || `هدف ${goalIndex + 1}`;
  const concept = state.concepts[goalIndex] || { flow: [] };
  const flow = concept.flow || [];
  const menuId = `goal-section-menu-${goalIndex}`;
  const addId = `goal-section-add-${goalIndex}`;

  const addOptions = `
    <div class="section-add-options" data-add-menu="${addId}">
      <button type="button" data-action="add-block" data-block-type="explain" data-goal-index="${goalIndex}">شرح</button>
      <button type="button" data-action="add-block" data-block-type="example" data-goal-index="${goalIndex}">مثال</button>
      <button type="button" data-action="add-block" data-block-type="nonexample" data-goal-index="${goalIndex}">لا مثال</button>
      <button type="button" data-action="add-block" data-block-type="image" data-goal-index="${goalIndex}">صورة</button>
      <button type="button" data-action="add-block" data-block-type="input" data-goal-index="${goalIndex}">سؤال تدريبي (إجابة قصيرة)</button>
      <button type="button" data-action="add-block" data-block-type="mcq" data-goal-index="${goalIndex}">سؤال تدريبي (اختيار متعدد)</button>
      <button type="button" data-action="add-block" data-block-type="ordering" data-goal-index="${goalIndex}">سؤال تدريبي (رتّب)</button>
      <button type="button" data-action="add-block" data-block-type="match" data-goal-index="${goalIndex}">سؤال تدريبي (توصيل)</button>
      <button type="button" data-action="add-block" data-block-type="fillblank" data-goal-index="${goalIndex}">سؤال تدريبي (اكمل الفراغ)</button>
      <button type="button" data-action="add-block" data-block-type="hintlist" data-goal-index="${goalIndex}">قائمة تلميحات</button>
    </div>
  `;

  return `
    <section class="section-card" data-section="goal" draggable="true" data-drag-type="section" data-goal-index="${goalIndex}">
      <div class="section-header">
        <div class="section-title">
          <div>
            <span class="section-index">${sectionIndex}</span>
            <h2 data-goal-title="${goalIndex}">${escapeHtml(goalText)}</h2>
          </div>
          <p class="section-subtitle">قسم مرتبط مباشرة بالهدف أعلاه ويتم تحديث عنوانه تلقائيًا.</p>
        </div>
        <div class="section-actions">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
          <button class="action-menu-btn" data-action="toggle-menu" data-menu-id="${menuId}">⋮</button>
          ${renderActionMenu({
            id: menuId,
            actions: [
              { action: 'duplicate-goal-section', label: 'تكرار القسم', data: `data-goal-index="${goalIndex}"` },
              { action: 'move-goal-section-up', label: 'تحريك للأعلى', data: `data-goal-index="${goalIndex}"` },
              { action: 'move-goal-section-down', label: 'تحريك للأسفل', data: `data-goal-index="${goalIndex}"` },
              { action: 'delete-goal-section', label: 'حذف القسم', data: `data-goal-index="${goalIndex}"` }
            ]
          })}
        </div>
      </div>
      <div class="section-body" data-goal-body="${goalIndex}">
        ${flow.length
          ? flow.map((item, flowIndex) => renderFlowBlock(item, goalIndex, flowIndex)).join('')
          : '<p class="muted">ابدأ بإضافة شرح أو مثال أو سؤال تدريبي.</p>'}
      </div>
      <div class="section-footer">
        <button class="section-add" data-action="toggle-add" data-add-id="${addId}" data-goal-index="${goalIndex}">+ إضافة محتوى</button>
        ${state.pendingAdd === addId ? addOptions : ''}
      </div>
      ${renderConfirmInline({
        id: `goal-section-${goalIndex}`,
        message: 'سيتم حذف الهدف وقسمه ومحتواه. هل أنت متأكد؟'
      })}
    </section>
  `;
}

function renderFlowBlock(item, conceptIndex, flowIndex) {
  const type = item.type || 'explain';
  const menuId = `flow-menu-${conceptIndex}-${flowIndex}`;

  const labelMap = {
    explain: 'شرح',
    example: 'مثال',
    nonexample: 'لا مثال',
    image: 'صورة',
    input: 'سؤال تدريبي',
    mcq: 'سؤال تدريبي',
    ordering: 'سؤال تدريبي',
    match: 'سؤال تدريبي',
    fillblank: 'سؤال تدريبي',
    hintlist: 'تلميحات'
  };

  const questionTypeLabelMap = {
    input: 'إجابة قصيرة',
    mcq: 'اختيار متعدد',
    ordering: 'رتّب',
    match: 'توصيل',
    fillblank: 'اكمل الفراغ'
  };
  const questionTypeLabel = questionTypeLabelMap[type] || 'سؤال';

  return `
    <div class="block-card" draggable="true" data-drag-type="block" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">
      <div class="block-header">
        <span class="block-label">${labelMap[type] || 'محتوى'}${['input', 'mcq', 'ordering', 'match', 'fillblank'].includes(type) ? ` — ${questionTypeLabel}` : ''}</span>
        <div class="block-actions">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
          <button class="action-menu-btn" data-action="toggle-menu" data-menu-id="${menuId}">⋮</button>
          ${renderActionMenu({
            id: menuId,
            actions: [
              { action: 'duplicate-block', label: 'تكرار', data: `data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}"` },
              { action: 'move-block-up', label: 'تحريك للأعلى', data: `data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}"` },
              { action: 'move-block-down', label: 'تحريك للأسفل', data: `data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}"` },
              { action: 'delete-block', label: 'حذف', data: `data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}"` }
            ]
          })}
        </div>
      </div>
      <div class="block-body">
        ${renderFlowBlockBody(item, conceptIndex, flowIndex)}
      </div>
      ${renderConfirmInline({
        id: `flow-${conceptIndex}-${flowIndex}`,
        message: 'هل تريد حذف هذا المحتوى؟'
      })}
    </div>
  `;
}

function renderFlowBlockBody(item, conceptIndex, flowIndex) {
  const type = item.type || 'explain';

  if (type === 'image') {
    const isUploading = Boolean(item.uploading);
    const imageFiles = Array.isArray(item.imageFiles) ? item.imageFiles : [];
    const uploadStatus = item.uploadStatus;

    return `
      <div class="field">
        <label class="label">رفع صورة</label>
        <div class="item-row">
          <input class="input" type="file" accept="image/*" multiple data-image-file="true" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" ${isUploading ? 'disabled' : ''} />
          <button class="btn btn-outline btn-sm" data-action="upload-image" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" ${isUploading ? 'disabled' : ''}>
            ${isUploading ? 'جاري الرفع...' : 'رفع بعد التعديل'}
          </button>
        </div>
        <div class="help">سيتم فتح محرر الصور قبل الرفع. يمكن اختيار أكثر من صورة.</div>
        ${imageFiles.length ? `
          <div class="image-gallery">
            ${imageFiles.map((entry) => `
              <div class="image-thumb">
                <img src="${escapeHtml(entry.editedUrl || entry.previewUrl || '')}" alt="معاينة" />
                <div class="image-thumb-actions">
                  <button class="btn btn-ghost btn-sm small-btn" data-action="edit-image" data-image-id="${entry.id}" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">تعديل</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${uploadStatus ? `<div class="upload-progress">${escapeHtml(uploadStatus)}</div>` : ''}
        ${item.url ? `
          <div class="image-preview">
            <img src="${escapeHtml(item.url)}" alt="صورة البطاقة" loading="lazy" />
            <button class="btn btn-ghost btn-sm small-btn" data-action="copy-image-url" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">نسخ الرابط</button>
          </div>
        ` : ''}
      </div>
      <div class="field">
        <label class="label">وصف للصورة (اختياري)</label>
        <textarea class="input" rows="2" data-block-field="text" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">${escapeHtml(item.text || '')}</textarea>
      </div>
    `;
  }

  if (['input', 'mcq', 'ordering', 'match', 'fillblank'].includes(type)) {
    const validation = item.validation || {};
    return `
      <div class="field">
        <label class="label">نص السؤال</label>
        ${type === 'fillblank'
          ? `
            <textarea class="input" rows="2" data-block-field="text" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">${escapeHtml(item.text || '')}</textarea>
            <div class="help">استخدم [[blank]] لكل فراغ داخل الجملة.</div>
          `
          : `
            <input class="input" data-block-field="text" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.text || '')}" />
          `}
      </div>
      <div class="field">
        <label class="label">حالة السؤال</label>
        <label class="toggle-row">
          <input type="checkbox" data-block-field="isRequired" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" ${item.isRequired !== false ? 'checked' : ''} />
          <span>سؤال مطلوب</span>
        </label>
      </div>
      ${type === 'input'
        ? `
          <div class="field">
            <label class="label">الإجابة النموذجية (اختياري)</label>
            <input class="input" data-block-field="answer" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.answer || '')}" />
          </div>
          <div class="field">
            <label class="label">خيارات التحقق</label>
            <label class="toggle-row">
              <input type="checkbox" data-block-validation="numericOnly" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" ${validation.numericOnly ? 'checked' : ''} />
              <span>أرقام فقط</span>
            </label>
            <label class="toggle-row">
              <input type="checkbox" data-block-validation="fuzzyAutocorrect" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" ${validation.fuzzyAutocorrect ? 'checked' : ''} />
              <span>تصحيح تقريبي للنص</span>
            </label>
          </div>
        `
        : ''}
      ${type === 'mcq'
        ? `
          <div class="field">
            <label class="label">الاختيارات</label>
            ${renderInlineList({
              list: item.choices || [],
              listType: 'flow-choices',
              index: flowIndex,
              conceptIndex
            })}
          </div>
          <div class="field">
            <label class="label">رقم الإجابة الصحيحة</label>
            <input class="input ltr" data-block-field="correctIndex" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" value="${escapeHtml(item.correctIndex ?? 0)}" />
          </div>
        `
        : ''}
      ${type === 'ordering'
        ? `
          <div class="field">
            <label class="label">ترتيب العناصر</label>
            ${renderInlineList({
              list: item.items || [],
              listType: 'flow-ordering',
              index: flowIndex,
              conceptIndex
            })}
          </div>
        `
        : ''}
      ${type === 'match'
        ? `
          <div class="field">
            <label class="label">أزواج التوصيل</label>
            ${renderMatchPairsEditor({ pairs: item.pairs || [], conceptIndex, flowIndex })}
          </div>
        `
        : ''}
      ${type === 'fillblank'
        ? `
          <div class="field">
            <label class="label">إجابات الفراغات</label>
            ${renderInlineList({
              list: item.blanks || [],
              listType: 'flow-fillblank-answers',
              index: flowIndex,
              conceptIndex
            })}
          </div>
          <div class="field">
            <label class="label">خيارات التحقق</label>
            <label class="toggle-row">
              <input type="checkbox" data-block-validation="numericOnly" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" ${validation.numericOnly ? 'checked' : ''} />
              <span>أرقام فقط</span>
            </label>
            <label class="toggle-row">
              <input type="checkbox" data-block-validation="fuzzyAutocorrect" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}" ${validation.fuzzyAutocorrect ? 'checked' : ''} />
              <span>تصحيح تقريبي للنص</span>
            </label>
          </div>
        `
        : ''}
      <div class="field">
        <details class="hint-panel" open>
          <summary>تلميحات السؤال</summary>
          ${renderInlineList({
            list: item.hints || [],
            listType: 'flow-hints',
            index: flowIndex,
            conceptIndex
          })}
        </details>
      </div>
    `;
  }

  if (type === 'hintlist') {
    return `
      <div class="field">
        <label class="label">قائمة التلميحات</label>
        ${renderInlineList({
          list: item.details || [],
          listType: 'flow-detail',
          index: flowIndex,
          conceptIndex
        })}
      </div>
    `;
  }

  return `
    <div class="field">
      <label class="label">النص</label>
      <div class="text-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" data-action="insert-frac" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">كسر</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="insert-table" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">جدول</button>
      </div>
      <textarea class="input" rows="3" data-block-field="text" data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}">${escapeHtml(item.text || '')}</textarea>
      ${renderTableEditors({ text: item.text || '', conceptIndex, flowIndex })}
    </div>
  `;
}

function renderAssessmentSection(sectionIndex) {
  const assessment = state.assessment || { title: '', description: '', questions: [] };
  const questions = assessment.questions.length ? assessment.questions : [];
  const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);

  return `
    <section class="section-card" data-section="assessment">
      <div class="section-header">
        <div class="section-title">
          <div>
            <span class="section-index">${sectionIndex}</span>
            <h2>اختبر نفسي</h2>
          </div>
          <p class="section-subtitle">أسئلة التقييم النهائي مع احتساب مجموع الدرجات (الإجمالي: ${totalPoints}).</p>
        </div>
        <div class="section-actions">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        </div>
      </div>
      <div class="section-body">
        <div class="field">
          <label class="label">عنوان التقييم</label>
          <input class="input" data-assessment-field="title" value="${escapeHtml(assessment.title || '')}" />
        </div>
        <div class="field">
          <label class="label">الوصف</label>
          <textarea class="input" rows="2" data-assessment-field="description">${escapeHtml(assessment.description || '')}</textarea>
        </div>
        ${questions.length
          ? questions.map((question, index) => renderAssessmentQuestion(question, index)).join('')
          : '<p class="muted">لا توجد أسئلة تقييم بعد.</p>'}
      </div>
      <div class="section-footer">
        <button class="section-add" data-action="add-assessment-question">+ إضافة سؤال تقييم</button>
      </div>
    </section>
  `;
}

function renderAssessmentQuestion(question, index) {
  const type = ['mcq', 'input', 'ordering', 'match', 'fillblank'].includes(question.type)
    ? question.type
    : 'input';
  const menuId = `assessment-menu-${index}`;
  const validation = question.validation || {};

  return `
    <div class="block-card" draggable="true" data-drag-type="assessment" data-question-index="${index}">
      <div class="block-header">
        <span class="block-label">سؤال تقييم ${index + 1}</span>
        <div class="block-actions">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
          <button class="action-menu-btn" data-action="toggle-menu" data-menu-id="${menuId}">⋮</button>
          ${renderActionMenu({
            id: menuId,
            actions: [
              { action: 'duplicate-assessment', label: 'تكرار', data: `data-question-index="${index}"` },
              { action: 'move-assessment-up', label: 'تحريك للأعلى', data: `data-question-index="${index}"` },
              { action: 'move-assessment-down', label: 'تحريك للأسفل', data: `data-question-index="${index}"` },
              { action: 'delete-assessment', label: 'حذف', data: `data-question-index="${index}"` }
            ]
          })}
        </div>
      </div>
      <div class="block-body">
        <div class="field">
          <label class="label">نوع السؤال</label>
          <select class="input" data-question-field="type" data-question-index="${index}">
            <option value="mcq" ${type === 'mcq' ? 'selected' : ''}>اختيار متعدد</option>
            <option value="input" ${type === 'input' ? 'selected' : ''}>إجابة نصية</option>
            <option value="ordering" ${type === 'ordering' ? 'selected' : ''}>رتّب</option>
            <option value="match" ${type === 'match' ? 'selected' : ''}>توصيل</option>
            <option value="fillblank" ${type === 'fillblank' ? 'selected' : ''}>اكمل الفراغ</option>
          </select>
        </div>
        <div class="field">
          <label class="label">نص السؤال</label>
          ${type === 'fillblank'
            ? `
              <textarea class="input" rows="2" data-question-field="text" data-question-index="${index}">${escapeHtml(question.text || '')}</textarea>
              <div class="help">استخدم [[blank]] لكل فراغ داخل الجملة.</div>
            `
            : `
              <input class="input" data-question-field="text" data-question-index="${index}" value="${escapeHtml(question.text || '')}" />
            `}
        </div>
        <div class="field">
          <label class="label">الدرجة</label>
          <input class="input ltr" data-question-field="points" data-question-index="${index}" value="${escapeHtml(question.points ?? 1)}" />
        </div>
        <div class="field">
          <label class="label">حالة السؤال</label>
          <label class="toggle-row">
            <input type="checkbox" data-question-field="isRequired" data-question-index="${index}" ${question.isRequired !== false ? 'checked' : ''} />
            <span>سؤال مطلوب</span>
          </label>
        </div>
        ${type === 'input'
          ? `
            <div class="field">
              <label class="label">الإجابة النموذجية</label>
              <input class="input" data-question-field="answer" data-question-index="${index}" value="${escapeHtml(question.answer || '')}" />
            </div>
            <div class="field">
              <label class="label">خيارات التحقق</label>
              <label class="toggle-row">
                <input type="checkbox" data-question-validation="numericOnly" data-question-index="${index}" ${validation.numericOnly ? 'checked' : ''} />
                <span>أرقام فقط</span>
              </label>
              <label class="toggle-row">
                <input type="checkbox" data-question-validation="fuzzyAutocorrect" data-question-index="${index}" ${validation.fuzzyAutocorrect ? 'checked' : ''} />
                <span>تصحيح تقريبي للنص</span>
              </label>
            </div>
          `
          : ''}
        ${type === 'mcq'
          ? `
            <div class="field">
              <label class="label">الاختيارات</label>
              ${renderInlineList({ list: question.choices || [], listType: 'assessment-choices', index })}
            </div>
            <div class="field">
              <label class="label">رقم الإجابة الصحيحة</label>
              <input class="input ltr" data-question-field="correctIndex" data-question-index="${index}" value="${escapeHtml(question.correctIndex ?? 0)}" />
            </div>
          `
          : ''}
        ${type === 'ordering'
          ? `
            <div class="field">
              <label class="label">ترتيب العناصر</label>
              ${renderInlineList({ list: question.items || [], listType: 'assessment-ordering', index })}
            </div>
          `
          : ''}
        ${type === 'match'
          ? `
            <div class="field">
              <label class="label">أزواج التوصيل</label>
              ${renderMatchPairsEditor({ pairs: question.pairs || [], questionIndex: index })}
            </div>
          `
          : ''}
        ${type === 'fillblank'
          ? `
            <div class="field">
              <label class="label">إجابات الفراغات</label>
              ${renderInlineList({ list: question.blanks || [], listType: 'assessment-fillblank-answers', index })}
            </div>
            <div class="field">
              <label class="label">خيارات التحقق</label>
              <label class="toggle-row">
                <input type="checkbox" data-question-validation="numericOnly" data-question-index="${index}" ${validation.numericOnly ? 'checked' : ''} />
                <span>أرقام فقط</span>
              </label>
              <label class="toggle-row">
                <input type="checkbox" data-question-validation="fuzzyAutocorrect" data-question-index="${index}" ${validation.fuzzyAutocorrect ? 'checked' : ''} />
                <span>تصحيح تقريبي للنص</span>
              </label>
            </div>
          `
          : ''}
      </div>
      ${renderConfirmInline({
        id: `assessment-${index}`,
        message: 'هل تريد حذف سؤال التقييم؟'
      })}
    </div>
  `;
}

function renderInlineList({ list, listType, index, conceptIndex }) {
  const items = list.length ? list : [''];
  return `
    <div class="inline-list">
      ${items
        .map(
          (value, idx) => `
            <div class="inline-list-row">
              <input class="input" data-list-type="${listType}" data-list-index="${index}" data-list-item-index="${idx}" ${
                conceptIndex != null ? `data-goal-index="${conceptIndex}"` : ''
              } value="${escapeHtml(value)}" />
              <button class="btn btn-ghost btn-sm" data-action="delete-list-item" data-list-type="${listType}" data-list-index="${index}" data-list-item-index="${idx}" ${
                conceptIndex != null ? `data-goal-index="${conceptIndex}"` : ''
              }>حذف</button>
            </div>
          `
        )
        .join('')}
      <button class="btn btn-ghost btn-sm" data-action="add-list-item" data-list-type="${listType}" data-list-index="${index}" ${
        conceptIndex != null ? `data-goal-index="${conceptIndex}"` : ''
      }>إضافة</button>
    </div>
  `;
}

function renderTableEditors({ text, conceptIndex, flowIndex }) {
  const tables = parseTableTokens(text);
  if (!tables.length) return '';

  return `
    <div class="table-editor-list">
      ${tables.map((table, tableIndex) => {
        const total = table.rows * table.cols;
        const cells = Array.from({ length: total }, (_, idx) => table.cells[idx] ?? '');
        return `
          <div class="table-editor">
            <div class="table-editor-header">
              <span>جدول ${table.rows}×${table.cols}</span>
            </div>
            <div class="table-editor-grid" style="--table-cols:${table.cols};">
              ${cells.map((value, cellIndex) => `
                <input
                  class="input"
                  data-table-index="${tableIndex}"
                  data-table-cell-index="${cellIndex}"
                  data-goal-index="${conceptIndex}"
                  data-flow-index="${flowIndex}"
                  value="${escapeHtml(value)}"
                  placeholder="خلية"
                />
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMatchPairsEditor({ pairs, conceptIndex, flowIndex, questionIndex }) {
  const rows = pairs.length ? pairs : [{ left: '', right: '' }];
  const baseAttrs = questionIndex != null
    ? `data-question-index="${questionIndex}"`
    : `data-goal-index="${conceptIndex}" data-flow-index="${flowIndex}"`;
  return `
    <div class="match-pairs">
      ${rows.map((pair, idx) => `
        <div class="match-pair-row">
          <input
            class="input"
            data-match-index="${idx}"
            data-match-side="left"
            ${baseAttrs}
            value="${escapeHtml(pair.left || '')}"
            placeholder="العمود الأول"
          />
          <input
            class="input"
            data-match-index="${idx}"
            data-match-side="right"
            ${baseAttrs}
            value="${escapeHtml(pair.right || '')}"
            placeholder="العمود الثاني"
          />
          <button class="btn btn-ghost btn-sm" data-action="delete-match-pair" data-match-index="${idx}" ${baseAttrs}>حذف</button>
        </div>
      `).join('')}
      <button class="btn btn-ghost btn-sm" data-action="add-match-pair" ${baseAttrs}>+ إضافة زوج</button>
    </div>
  `;
}

function renderEditor() {
  syncGoalsWithConcepts();
  const sections = buildSections();

  elements.editorContent.innerHTML = sections
    .map((section) => {
      if (section.id === 'goals') return renderGoalsSection(section.index);
      if (section.id === 'prereq') return renderPrereqSection(section.index);
      if (section.id === 'assessment') return renderAssessmentSection(section.index);
      if (section.id.startsWith('goal-')) {
        const goalIndex = Number(section.id.split('-')[1]);
        return renderGoalSection(section.index, goalIndex);
      }
      return '';
    })
    .join('');
}

function closeMenus() {
  if (state.openMenu) {
    state.openMenu = null;
    renderEditor();
  }
}

function toggleMenu(menuId) {
  state.openMenu = state.openMenu === menuId ? null : menuId;
  renderEditor();
}

function setPendingDelete(id) {
  state.pendingDelete = { id };
  renderEditor();
}

function clearPendingDelete() {
  state.pendingDelete = null;
  renderEditor();
}

function createFlowItem(type) {
  if (type === 'image') {
    return {
      type: 'image',
      text: '',
      url: '',
      imageFiles: []
    };
  }
  if (type === 'mcq') {
    return {
      type: 'mcq',
      text: '',
      choices: [''],
      correctIndex: 0,
      hints: [],
      isRequired: true,
      validation: normalizeValidation()
    };
  }
  if (type === 'input') {
    return {
      type: 'input',
      text: '',
      answer: '',
      hints: [],
      isRequired: true,
      validation: normalizeValidation()
    };
  }
  if (type === 'ordering') {
    return {
      type: 'ordering',
      text: '',
      items: [''],
      hints: [],
      isRequired: true,
      validation: normalizeValidation()
    };
  }
  if (type === 'match') {
    return {
      type: 'match',
      text: '',
      pairs: [{ left: '', right: '' }],
      hints: [],
      isRequired: true,
      validation: normalizeValidation()
    };
  }
  if (type === 'fillblank') {
    return {
      type: 'fillblank',
      text: '',
      blanks: [''],
      hints: [],
      isRequired: true,
      validation: normalizeValidation()
    };
  }
  if (type === 'hintlist') {
    return {
      type: 'hintlist',
      details: ['']
    };
  }

  return {
    type,
    text: ''
  };
}

function moveItem(list, fromIndex, direction) {
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= list.length) return;
  const item = list.splice(fromIndex, 1)[0];
  list.splice(toIndex, 0, item);
}

function handleEditorInput(event) {
  const target = event.target;
  const fieldValue = target.type === 'checkbox' ? target.checked : target.value;

  if (target.dataset.prereqField) {
    const index = Number(target.dataset.prereqIndex);
    const field = target.dataset.prereqField;
    if (!state.prerequisites[index]) return;
    if (field === 'type') {
      state.prerequisites[index].type = target.value === 'mcq' ? 'mcq' : 'input';
      if (state.prerequisites[index].type === 'mcq' && !state.prerequisites[index].choices?.length) {
        state.prerequisites[index].choices = [''];
      }
      setDirty(true);
      renderEditor();
      return;
    }
    state.prerequisites[index][field] = fieldValue;
    setDirty(true);
    return;
  }

  if (target.dataset.prereqValidation) {
    const index = Number(target.dataset.prereqIndex);
    const key = target.dataset.prereqValidation;
    const prereq = state.prerequisites[index];
    if (!prereq) return;
    prereq.validation = prereq.validation || normalizeValidation();
    prereq.validation[key] = Boolean(target.checked);
    setDirty(true);
    return;
  }

  if (target.dataset.blockField) {
    const conceptIndex = Number(target.dataset.goalIndex);
    const flowIndex = Number(target.dataset.flowIndex);
    const field = target.dataset.blockField;
    const item = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
    if (!item) return;
    item[field] = fieldValue;
    setDirty(true);
    return;
  }

  if (target.dataset.blockValidation) {
    const conceptIndex = Number(target.dataset.goalIndex);
    const flowIndex = Number(target.dataset.flowIndex);
    const key = target.dataset.blockValidation;
    const item = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
    if (!item) return;
    item.validation = item.validation || normalizeValidation();
    item.validation[key] = Boolean(target.checked);
    setDirty(true);
    return;
  }

  if (target.dataset.matchIndex != null && target.dataset.matchSide) {
    const matchIndex = Number(target.dataset.matchIndex);
    const side = target.dataset.matchSide;
    if (target.dataset.questionIndex != null) {
      const questionIndex = Number(target.dataset.questionIndex);
      const question = state.assessment.questions[questionIndex];
      if (!question) return;
      question.pairs = question.pairs || [];
      if (!question.pairs[matchIndex]) question.pairs[matchIndex] = { left: '', right: '' };
      question.pairs[matchIndex][side] = fieldValue;
      setDirty(true);
      return;
    }
    const conceptIndex = Number(target.dataset.goalIndex);
    const flowIndex = Number(target.dataset.flowIndex);
    const flowItem = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
    if (!flowItem) return;
    flowItem.pairs = flowItem.pairs || [];
    if (!flowItem.pairs[matchIndex]) flowItem.pairs[matchIndex] = { left: '', right: '' };
    flowItem.pairs[matchIndex][side] = fieldValue;
    setDirty(true);
    return;
  }

  if (target.dataset.assessmentField) {
    const field = target.dataset.assessmentField;
    state.assessment[field] = fieldValue;
    setDirty(true);
    return;
  }

  if (target.dataset.questionField) {
    const index = Number(target.dataset.questionIndex);
    const field = target.dataset.questionField;
    const question = state.assessment.questions[index];
    if (!question) return;
    if (field === 'type') {
      const nextType = target.value;
      question.type = nextType;
      if (nextType === 'mcq' && !question.choices?.length) {
        question.choices = [''];
      }
      if (nextType === 'ordering' && !question.items?.length) {
        question.items = [''];
      }
      if (nextType === 'match' && !question.pairs?.length) {
        question.pairs = [{ left: '', right: '' }];
      }
      if (nextType === 'fillblank' && !question.blanks?.length) {
        question.blanks = [''];
      }
      if (!question.validation) {
        question.validation = normalizeValidation();
      }
      setDirty(true);
      renderEditor();
      return;
    }
    question[field] = fieldValue;
    setDirty(true);
  }

  if (target.dataset.questionValidation) {
    const index = Number(target.dataset.questionIndex);
    const key = target.dataset.questionValidation;
    const question = state.assessment.questions[index];
    if (!question) return;
    question.validation = question.validation || normalizeValidation();
    question.validation[key] = Boolean(target.checked);
    setDirty(true);
    return;
  }

  if (target.dataset.listType) {
    const listType = target.dataset.listType;
    const listIndex = Number(target.dataset.listIndex);
    const itemIndex = Number(target.dataset.listItemIndex);
    const value = target.value;

    if (listType === 'prereq-choices') {
      const item = state.prerequisites[listIndex];
      if (!item) return;
      item.choices = item.choices || [];
      item.choices[itemIndex] = value;
      setDirty(true);
      return;
    }

    if (listType === 'prereq-hints') {
      const item = state.prerequisites[listIndex];
      if (!item) return;
      item.hints = item.hints || [];
      item.hints[itemIndex] = value;
      setDirty(true);
      return;
    }

    if (listType === 'assessment-choices') {
      const question = state.assessment.questions[listIndex];
      if (!question) return;
      question.choices = question.choices || [];
      question.choices[itemIndex] = value;
      setDirty(true);
      return;
    }

    if (listType === 'assessment-ordering') {
      const question = state.assessment.questions[listIndex];
      if (!question) return;
      question.items = question.items || [];
      question.items[itemIndex] = value;
      setDirty(true);
      return;
    }

    if (listType === 'assessment-fillblank-answers') {
      const question = state.assessment.questions[listIndex];
      if (!question) return;
      question.blanks = question.blanks || [];
      question.blanks[itemIndex] = value;
      setDirty(true);
      return;
    }

    const conceptIndex = Number(target.dataset.goalIndex);
    const flowItem = state.concepts?.[conceptIndex]?.flow?.[listIndex];
    if (!flowItem) return;
    if (listType === 'flow-choices') {
      flowItem.choices = flowItem.choices || [];
      flowItem.choices[itemIndex] = value;
    } else if (listType === 'flow-ordering') {
      flowItem.items = flowItem.items || [];
      flowItem.items[itemIndex] = value;
    } else if (listType === 'flow-fillblank-answers') {
      flowItem.blanks = flowItem.blanks || [];
      flowItem.blanks[itemIndex] = value;
    } else if (listType === 'flow-hints') {
      flowItem.hints = flowItem.hints || [];
      flowItem.hints[itemIndex] = value;
    } else if (listType === 'flow-detail') {
      flowItem.details = flowItem.details || [];
      flowItem.details[itemIndex] = value;
    }
    setDirty(true);
  }

  if (target.dataset.tableIndex != null && target.dataset.tableCellIndex != null) {
    const tableIndex = Number(target.dataset.tableIndex);
    const cellIndex = Number(target.dataset.tableCellIndex);
    const conceptIndex = Number(target.dataset.goalIndex);
    const flowIndex = Number(target.dataset.flowIndex);
    const item = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
    if (!item) return;
    const tables = parseTableTokens(item.text || '');
    const table = tables[tableIndex];
    if (!table) return;
    const total = table.rows * table.cols;
    const nextCells = Array.from({ length: total }, (_, idx) => table.cells[idx] ?? '');
    nextCells[cellIndex] = fieldValue;
    const nextToken = buildTableToken(table.rows, table.cols, nextCells);
    item.text = replaceTableToken(item.text || '', tableIndex, nextToken);
    setDirty(true);
    return;
  }

  if (target.dataset.goalIndex != null && !target.dataset.blockField && !target.dataset.listType) {
    const index = Number(target.dataset.goalIndex);
    state.goals[index] = fieldValue;
    if (state.concepts[index]) {
      state.concepts[index].title = target.value || `هدف ${index + 1}`;
    }
    const goalTitle = elements.editorContent.querySelector(`[data-goal-title="${index}"]`);
    if (goalTitle) {
      goalTitle.textContent = target.value || `هدف ${index + 1}`;
    }
    setDirty(true);
  }
}

function handleEditorChange(event) {
  const target = event.target;
  if (!target.dataset.imageFile) return;
  const conceptIndex = Number(target.dataset.goalIndex);
  const flowIndex = Number(target.dataset.flowIndex);
  const flowItem = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
  if (!flowItem) return;
  const files = Array.from(target.files || []);
  flowItem.imageFiles = files.map((file) => createImageEntry(file));
  if (flowItem.imageFiles.length) {
    openImageEditor(conceptIndex, flowIndex, flowItem.imageFiles[0].id);
  }
  setDirty(true);
  renderEditor();
}

function handleEditorClick(event) {
  const menuButton = event.target.closest('[data-action="toggle-menu"]');
  if (menuButton) {
    toggleMenu(menuButton.dataset.menuId);
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;

  if (action === 'cancel-delete') {
    clearPendingDelete();
    return;
  }

  if (action === 'confirm-delete') {
    const targetId = button.dataset.target;
    handleConfirmDelete(targetId);
    return;
  }

  if (action === 'insert-frac' || action === 'insert-table') {
    const conceptIndex = Number(button.dataset.goalIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    const textarea = elements.editorContent.querySelector(
      `textarea[data-block-field="text"][data-goal-index="${conceptIndex}"][data-flow-index="${flowIndex}"]`
    );
    if (!textarea) return;

    if (action === 'insert-frac') {
      const numerator = prompt('أدخل البسط', '1');
      if (numerator == null) return;
      const denominator = prompt('أدخل المقام', '2');
      if (denominator == null) return;
      insertTokenAtCursor(textarea, `[[frac:${numerator}|${denominator}]]`);
      return;
    }

    const rows = Number(prompt('عدد الصفوف', '2'));
    const cols = Number(prompt('عدد الأعمدة', '2'));
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      showToast('تنبيه', 'أدخل أرقامًا صحيحة للصفوف والأعمدة.', 'warning');
      return;
    }
    const emptyCells = Array(rows * cols).fill('');
    insertTokenAtCursor(textarea, buildTableToken(rows, cols, emptyCells));
    renderEditor();
    return;
  }

  if (action === 'toggle-add') {
    const addId = button.dataset.addId;
    state.pendingAdd = state.pendingAdd === addId ? null : addId;
    renderEditor();
    return;
  }

  if (action === 'add-goal') {
    state.goals.push('');
    state.concepts.push({ title: '', flow: [] });
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'delete-goal') {
    const index = Number(button.dataset.goalIndex);
    setPendingDelete(`goals-section-${index}`);
    return;
  }

  if (action === 'duplicate-goal') {
    const index = Number(button.dataset.goalIndex);
    const goalText = state.goals[index] || 'هدف جديد';
    state.goals.splice(index + 1, 0, `${goalText} (نسخة)`);
    const conceptClone = JSON.parse(JSON.stringify(state.concepts[index] || { title: '', flow: [] }));
    state.concepts.splice(index + 1, 0, conceptClone);
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'move-goal-up' || action === 'move-goal-down') {
    const index = Number(button.dataset.goalIndex);
    moveItem(state.goals, index, action === 'move-goal-up' ? 'up' : 'down');
    moveItem(state.concepts, index, action === 'move-goal-up' ? 'up' : 'down');
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'add-prereq') {
    state.prerequisites.push({
      type: 'input',
      text: '',
      choices: [],
      isRequired: true,
      hints: [],
      answer: '',
      correctIndex: 0,
      validation: normalizeValidation()
    });
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'delete-prereq') {
    const index = Number(button.dataset.prereqIndex);
    setPendingDelete(`prereq-${index}`);
    return;
  }

  if (action === 'duplicate-prereq') {
    const index = Number(button.dataset.prereqIndex);
    const cloned = JSON.parse(JSON.stringify(state.prerequisites[index] || {
      type: 'input',
      text: '',
      choices: [],
      isRequired: true,
      hints: [],
      answer: '',
      correctIndex: 0,
      validation: normalizeValidation()
    }));
    state.prerequisites.splice(index + 1, 0, cloned);
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'move-prereq-up' || action === 'move-prereq-down') {
    const index = Number(button.dataset.prereqIndex);
    moveItem(state.prerequisites, index, action === 'move-prereq-up' ? 'up' : 'down');
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'add-block') {
    const goalIndex = Number(button.dataset.goalIndex);
    const type = button.dataset.blockType;
    state.concepts[goalIndex].flow.push(createFlowItem(type));
    state.pendingAdd = null;
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'delete-goal-section') {
    const index = Number(button.dataset.goalIndex);
    setPendingDelete(`goal-section-${index}`);
    return;
  }

  if (action === 'duplicate-goal-section') {
    const index = Number(button.dataset.goalIndex);
    const goalText = state.goals[index] || 'هدف جديد';
    const conceptClone = JSON.parse(JSON.stringify(state.concepts[index] || { title: '', flow: [] }));
    state.goals.splice(index + 1, 0, `${goalText} (نسخة)`);
    state.concepts.splice(index + 1, 0, conceptClone);
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'move-goal-section-up' || action === 'move-goal-section-down') {
    const index = Number(button.dataset.goalIndex);
    const direction = action === 'move-goal-section-up' ? 'up' : 'down';
    moveItem(state.goals, index, direction);
    moveItem(state.concepts, index, direction);
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'delete-block') {
    const goalIndex = Number(button.dataset.goalIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    setPendingDelete(`flow-${goalIndex}-${flowIndex}`);
    return;
  }

  if (action === 'duplicate-block') {
    const goalIndex = Number(button.dataset.goalIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    const cloned = JSON.parse(JSON.stringify(state.concepts[goalIndex].flow[flowIndex]));
    state.concepts[goalIndex].flow.splice(flowIndex + 1, 0, cloned);
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'move-block-up' || action === 'move-block-down') {
    const goalIndex = Number(button.dataset.goalIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    moveItem(state.concepts[goalIndex].flow, flowIndex, action === 'move-block-up' ? 'up' : 'down');
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'add-assessment-question') {
    state.assessment.questions.push({
      type: 'mcq',
      text: '',
      points: 1,
      choices: [''],
      correctIndex: 0,
      answer: '',
      isRequired: true,
      validation: normalizeValidation(),
      items: [],
      pairs: [],
      blanks: []
    });
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'delete-assessment') {
    const index = Number(button.dataset.questionIndex);
    setPendingDelete(`assessment-${index}`);
    return;
  }

  if (action === 'duplicate-assessment') {
    const index = Number(button.dataset.questionIndex);
    const cloned = JSON.parse(JSON.stringify(state.assessment.questions[index]));
    state.assessment.questions.splice(index + 1, 0, cloned);
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'move-assessment-up' || action === 'move-assessment-down') {
    const index = Number(button.dataset.questionIndex);
    moveItem(state.assessment.questions, index, action === 'move-assessment-up' ? 'up' : 'down');
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'add-list-item') {
    const listType = button.dataset.listType;
    const listIndex = Number(button.dataset.listIndex);
    if (listType === 'prereq-choices') {
      const item = state.prerequisites[listIndex];
      item.choices = item.choices || [];
      item.choices.push('');
    } else if (listType === 'prereq-hints') {
      const item = state.prerequisites[listIndex];
      item.hints = item.hints || [];
      if (item.hints.length >= 3) return;
      item.hints.push('');
    } else if (listType === 'assessment-choices') {
      const question = state.assessment.questions[listIndex];
      question.choices = question.choices || [];
      question.choices.push('');
    } else if (listType === 'assessment-ordering') {
      const question = state.assessment.questions[listIndex];
      question.items = question.items || [];
      question.items.push('');
    } else if (listType === 'assessment-fillblank-answers') {
      const question = state.assessment.questions[listIndex];
      question.blanks = question.blanks || [];
      question.blanks.push('');
    } else {
      const conceptIndex = Number(button.dataset.goalIndex);
      const flowItem = state.concepts?.[conceptIndex]?.flow?.[listIndex];
      if (!flowItem) return;
      if (listType === 'flow-choices') {
        flowItem.choices = flowItem.choices || [];
        flowItem.choices.push('');
      } else if (listType === 'flow-ordering') {
        flowItem.items = flowItem.items || [];
        flowItem.items.push('');
      } else if (listType === 'flow-fillblank-answers') {
        flowItem.blanks = flowItem.blanks || [];
        flowItem.blanks.push('');
      } else if (listType === 'flow-hints') {
        flowItem.hints = flowItem.hints || [];
        flowItem.hints.push('');
      } else if (listType === 'flow-detail') {
        flowItem.details = flowItem.details || [];
        flowItem.details.push('');
      }
    }
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'delete-list-item') {
    const listType = button.dataset.listType;
    const listIndex = Number(button.dataset.listIndex);
    const itemIndex = Number(button.dataset.listItemIndex);

    if (listType === 'prereq-choices') {
      const item = state.prerequisites[listIndex];
      if (!item) return;
      item.choices.splice(itemIndex, 1);
    } else if (listType === 'prereq-hints') {
      const item = state.prerequisites[listIndex];
      if (!item) return;
      item.hints.splice(itemIndex, 1);
    } else if (listType === 'assessment-choices') {
      const question = state.assessment.questions[listIndex];
      if (!question) return;
      question.choices.splice(itemIndex, 1);
    } else if (listType === 'assessment-ordering') {
      const question = state.assessment.questions[listIndex];
      if (!question) return;
      question.items.splice(itemIndex, 1);
    } else if (listType === 'assessment-fillblank-answers') {
      const question = state.assessment.questions[listIndex];
      if (!question) return;
      question.blanks.splice(itemIndex, 1);
    } else {
      const conceptIndex = Number(button.dataset.goalIndex);
      const flowItem = state.concepts?.[conceptIndex]?.flow?.[listIndex];
      if (!flowItem) return;
      if (listType === 'flow-choices') flowItem.choices.splice(itemIndex, 1);
      if (listType === 'flow-ordering') flowItem.items.splice(itemIndex, 1);
      if (listType === 'flow-fillblank-answers') flowItem.blanks.splice(itemIndex, 1);
      if (listType === 'flow-hints') flowItem.hints.splice(itemIndex, 1);
      if (listType === 'flow-detail') flowItem.details.splice(itemIndex, 1);
    }

    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'copy-image-url') {
    const conceptIndex = Number(button.dataset.goalIndex);
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
    const conceptIndex = Number(button.dataset.goalIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    const imageId = button.dataset.imageId;
    openImageEditor(conceptIndex, flowIndex, imageId);
    return;
  }

  if (action === 'upload-image') {
    const conceptIndex = Number(button.dataset.goalIndex);
    const flowIndex = Number(button.dataset.flowIndex);
    handleImageUpload(conceptIndex, flowIndex);
    return;
  }

  if (action === 'add-match-pair') {
    if (button.dataset.questionIndex != null) {
      const questionIndex = Number(button.dataset.questionIndex);
      const question = state.assessment.questions[questionIndex];
      if (!question) return;
      question.pairs = question.pairs || [];
      question.pairs.push({ left: '', right: '' });
    } else {
      const conceptIndex = Number(button.dataset.goalIndex);
      const flowIndex = Number(button.dataset.flowIndex);
      const flowItem = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
      if (!flowItem) return;
      flowItem.pairs = flowItem.pairs || [];
      flowItem.pairs.push({ left: '', right: '' });
    }
    setDirty(true);
    renderEditor();
    return;
  }

  if (action === 'delete-match-pair') {
    const pairIndex = Number(button.dataset.matchIndex);
    if (button.dataset.questionIndex != null) {
      const questionIndex = Number(button.dataset.questionIndex);
      const question = state.assessment.questions[questionIndex];
      if (!question) return;
      question.pairs.splice(pairIndex, 1);
    } else {
      const conceptIndex = Number(button.dataset.goalIndex);
      const flowIndex = Number(button.dataset.flowIndex);
      const flowItem = state.concepts?.[conceptIndex]?.flow?.[flowIndex];
      if (!flowItem) return;
      flowItem.pairs.splice(pairIndex, 1);
    }
    setDirty(true);
    renderEditor();
  }
}

function handleConfirmDelete(targetId) {
  if (targetId.startsWith('goals-section-')) {
    const index = Number(targetId.split('-').pop());
    state.goals.splice(index, 1);
    state.concepts.splice(index, 1);
  } else if (targetId.startsWith('goal-section-')) {
    const index = Number(targetId.split('-').pop());
    state.goals.splice(index, 1);
    state.concepts.splice(index, 1);
  } else if (targetId.startsWith('prereq-')) {
    const index = Number(targetId.split('-').pop());
    state.prerequisites.splice(index, 1);
  } else if (targetId.startsWith('flow-')) {
    const [, conceptIndex, flowIndex] = targetId.split('-');
    state.concepts[Number(conceptIndex)].flow.splice(Number(flowIndex), 1);
  } else if (targetId.startsWith('assessment-')) {
    const index = Number(targetId.split('-').pop());
    state.assessment.questions.splice(index, 1);
  }

  state.pendingDelete = null;
  setDirty(true);
  renderEditor();
}

function handleDragStart(event) {
  const draggable = event.target.closest('[draggable="true"]');
  if (!draggable) return;
  const dragType = draggable.dataset.dragType;
  const payload = {
    type: dragType,
    goalIndex: draggable.dataset.goalIndex,
    flowIndex: draggable.dataset.flowIndex,
    prereqIndex: draggable.dataset.prereqIndex,
    questionIndex: draggable.dataset.questionIndex
  };
  event.dataTransfer.setData('text/plain', JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(event) {
  const target = event.target.closest('[draggable="true"]');
  if (!target) return;
  event.preventDefault();
  target.classList.add('drag-over');
}

function handleDragLeave(event) {
  const target = event.target.closest('[draggable="true"]');
  if (!target) return;
  target.classList.remove('drag-over');
}

function handleDrop(event) {
  const target = event.target.closest('[draggable="true"]');
  if (!target) return;
  event.preventDefault();
  target.classList.remove('drag-over');

  let payload;
  try {
    payload = JSON.parse(event.dataTransfer.getData('text/plain'));
  } catch (error) {
    return;
  }

  if (!payload || !payload.type) return;

  if (payload.type === 'goal' && target.dataset.dragType === 'goal') {
    const from = Number(payload.goalIndex);
    const to = Number(target.dataset.goalIndex);
    if (from === to) return;
    const [goal] = state.goals.splice(from, 1);
    const [concept] = state.concepts.splice(from, 1);
    state.goals.splice(to, 0, goal);
    state.concepts.splice(to, 0, concept);
    setDirty(true);
    renderEditor();
    return;
  }

  if (payload.type === 'section' && target.dataset.dragType === 'section') {
    const from = Number(payload.goalIndex);
    const to = Number(target.dataset.goalIndex);
    if (from === to) return;
    const [goal] = state.goals.splice(from, 1);
    const [concept] = state.concepts.splice(from, 1);
    state.goals.splice(to, 0, goal);
    state.concepts.splice(to, 0, concept);
    setDirty(true);
    renderEditor();
    return;
  }

  if (payload.type === 'block' && target.dataset.dragType === 'block') {
    const fromGoal = Number(payload.goalIndex);
    const fromIndex = Number(payload.flowIndex);
    const toGoal = Number(target.dataset.goalIndex);
    const toIndex = Number(target.dataset.flowIndex);

    if (fromGoal !== toGoal) return;
    if (fromIndex === toIndex) return;
    const list = state.concepts[fromGoal].flow;
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item);
    setDirty(true);
    renderEditor();
    return;
  }

  if (payload.type === 'prereq' && target.dataset.dragType === 'prereq') {
    const from = Number(payload.prereqIndex);
    const to = Number(target.dataset.prereqIndex);
    if (from === to) return;
    const [item] = state.prerequisites.splice(from, 1);
    state.prerequisites.splice(to, 0, item);
    setDirty(true);
    renderEditor();
    return;
  }

  if (payload.type === 'assessment' && target.dataset.dragType === 'assessment') {
    const from = Number(payload.questionIndex);
    const to = Number(target.dataset.questionIndex);
    if (from === to) return;
    const [item] = state.assessment.questions.splice(from, 1);
    state.assessment.questions.splice(to, 0, item);
    setDirty(true);
    renderEditor();
  }
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

  const needsEdit = images.find((entry) => !entry.editedBlob && !entry.editedUrl);
  if (needsEdit) {
    showToast('تنبيه', 'رجاءً عدّل جميع الصور قبل الرفع.', 'warning');
    openImageEditor(conceptIndex, flowIndex, needsEdit.id);
    return;
  }

  flowItem.uploading = true;
  flowItem.uploadStatus = 'جارٍ تجهيز الصور...';
  renderEditor();

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
      renderEditor();
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
        url
      }));
      state.concepts[conceptIndex].flow.splice(insertIndex, 0, ...newItems);
    }
    setDirty(true);
    showToast('نجاح', rest.length ? 'تم رفع الصور.' : 'تم رفع الصورة.', 'success');
  }

  renderEditor();
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
    renderEditor();
    showToast('نجاح', 'تم تحديث الصورة.', 'success');
  }, outputType, quality);
}

function buildPayload() {
  syncGoalsWithConcepts();
  const concepts = Array.isArray(state.concepts) ? state.concepts : [];
  const goals = concepts.map((concept, idx) => {
    const rawGoal = state.goals?.[idx];
    const cleaned = normalizeValue(rawGoal);
    const fallback = normalizeValue(concept?.title);
    return cleaned || fallback || `هدف ${idx + 1}`;
  });

  return {
    week: state.week,
    seq: state.seq,
    title: state.title,
    goals,
    prerequisites: state.prerequisites.map((item) => ({
      type: item.type === 'mcq' ? 'mcq' : 'input',
      text: normalizeValue(item.text),
      choices: (item.choices || []).filter((entry) => normalizeValue(entry)),
      hints: (item.hints || []).filter((entry) => normalizeValue(entry)).slice(0, 3),
      answer: normalizeValue(item.answer),
      correctIndex: item.correctIndex ?? 0,
      isRequired: item.isRequired !== false,
      validation: hasValidation(item.validation) ? item.validation : null
    })),
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
        isRequired: item.isRequired !== false,
        validation: hasValidation(item.validation) ? item.validation : null,
        details: (item.details || []).filter((entry) => normalizeValue(entry)),
        hints: (item.hints || []).filter((entry) => normalizeValue(entry)),
        choices: (item.choices || []).filter((entry) => normalizeValue(entry)),
        items: (item.items || []).filter((entry) => normalizeValue(entry)),
        blanks: (item.blanks || []).filter((entry) => normalizeValue(entry)),
        pairs: (item.pairs || [])
          .map((pair) => ({
            left: normalizeValue(pair?.left),
            right: normalizeValue(pair?.right)
          }))
          .filter((pair) => pair.left || pair.right)
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
        choices: (question.choices || []).filter((entry) => normalizeValue(entry)),
        items: (question.items || []).filter((entry) => normalizeValue(entry)),
        blanks: (question.blanks || []).filter((entry) => normalizeValue(entry)),
        pairs: (question.pairs || [])
          .map((pair) => ({
            left: normalizeValue(pair?.left),
            right: normalizeValue(pair?.right)
          }))
          .filter((pair) => pair.left || pair.right),
        isRequired: question.isRequired !== false,
        validation: hasValidation(question.validation) ? question.validation : null
      }))
    }
  };
}

async function saveContent() {
  const payload = buildPayload();

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

function handleBackClick(event) {
  if (!state.dirty) return;
  event.preventDefault();
  openLeaveModal(() => {
    window.location.href = event.currentTarget.href;
  });
}

let previewTimeout = null;
function schedulePreviewRender() {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(renderPreview, 200);
}

function renderPreview() {
  if (!state.previewEnabled) return;
  const data = buildPayload();
  elements.previewLessonTitle.textContent = data.title || `بطاقة الأسبوع ${state.week}`;
  elements.previewLessonStudent.textContent = 'طالب معاينة';
  elements.previewLessonWeek.textContent = `week ${state.week}`;

  initEngine({
    week: state.week,
    studentId: 'preview',
    data,
    mountEl: elements.previewLessonContent,
    preview: true
  });
}

function togglePreview(value) {
  state.previewEnabled = value;
  elements.previewPanel.classList.toggle('hidden', !value);
  elements.previewPanel.setAttribute('aria-hidden', value ? 'false' : 'true');
  elements.editorContent.classList.toggle('hidden', value);
  if (value) {
    renderPreview();
  }
}

function bindEvents() {
  elements.editorContent.addEventListener('input', handleEditorInput);
  elements.editorContent.addEventListener('change', handleEditorChange);
  elements.editorContent.addEventListener('click', handleEditorClick);
  elements.editorContent.addEventListener('dragstart', handleDragStart);
  elements.editorContent.addEventListener('dragover', handleDragOver);
  elements.editorContent.addEventListener('dragleave', handleDragLeave);
  elements.editorContent.addEventListener('drop', handleDrop);

  elements.btnSave.addEventListener('click', saveContent);
  elements.btnBack.addEventListener('click', handleBackClick);
  elements.previewToggle?.addEventListener('change', (event) => togglePreview(event.target.checked));

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

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.action-menu') && !event.target.closest('[data-action="toggle-menu"]')) {
      closeMenus();
    }
    if (!event.target.closest('[data-add-menu]') && !event.target.closest('[data-action="toggle-add"]')) {
      if (state.pendingAdd) {
        state.pendingAdd = null;
        renderEditor();
      }
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
    state.prerequisites = normalizePrerequisites(data.prerequisites || []);
    state.concepts = Array.isArray(data.concepts) ? data.concepts : [];
    state.assessment = normalizeAssessment(data.assessment);

    syncGoalsWithConcepts();
    setHeader();
    renderEditor();
  } catch (error) {
    elements.editorContent.textContent = 'تعذر تحميل المحتوى.';
    showToast('خطأ', error.message || 'تعذر تحميل المحتوى.', 'error');
  }
}

init();
