/* =========================================================
   engine.js — Unlimited Flow Engine (single "متابعة" button) + Resume + Completion
   - Concepts can use: concept.flow = [ {type:..., ...}, ... ]  ✅ (no limits)
   - Backward compatible: if no flow, we build flow from legacy fields
   - Stages: goals (once) -> prereq (once) -> goals per concept -> assessment (final)
   - One button only: "متابعة"
     * On text items: reveals next item
     * On question items: "متابعة" = تحقق للسؤال الحالي
       - Wrong: hints/attempts/solution
       - Correct: toast تعزيز + مهلة قصيرة ثم يكشف اللي بعده تلقائيًا
   - Auto scroll + focus to newly revealed item after advancing
   - Fix: infer question.type if flow item doesn't include it
   - Resume: load saved { stage, conceptIndex, stepIndex } from storage and continue
   - Completion: when finishing the last item -> mark done + show completion + return home
   - Certificate Hook: pass cardTitle to completion.js (data.title)

   UPDATE (2026-01-14):
   - Fix #1: Preserve question state across re-renders (input value / mcq selection)
     by caching built flow + caching normalized question object per flow item.
   ========================================================= */

import { ENGINE } from '../core/constants.js';
import { showToast } from '../ui/toast.js';
import { ENCOURAGEMENTS, DEFAULT_HINTS, FINAL_HINT, pickRandom } from '../ui/text.js';
import { renderQuestion } from '../questions/registry.js';
import { setStudentProgress, getStudentProgress, isCardDone, markCardDone } from '../core/storage.js';
import { setProgressUI } from './progress.js';
import { completeLesson } from './completion.js';

const LEGACY_ORDER = ['goal', 'explain', 'example', 'example2', 'mistake', 'note', 'question'];
const STAGES = {
  GOALS: 'goals',
  PREREQ: 'prereq',
  CONCEPT: 'concept',
  ASSESSMENT: 'assessment',
};

export function initEngine({ week, studentId, data, mountEl }) {
  mountEl.innerHTML = '';

  let stage = STAGES.GOALS;
  let conceptIndex = 0;
  let itemIndex = 0;

  let assessmentState = {
    attempts: 0,
    completed: false,
    score: null,
    total: null,
  };

  const goalsList = getGoalsList(data);
  const prereqList = getPrereqList(data);
  const assessment = normalizeAssessment(data?.assessment);

  // Scroll/focus control
  let pendingFocus = null; // { conceptIndex, itemIndex }
  let firstPaint = true;

  // Question state (for current question only)
  let activeQuestion = null; // { check, attempts, solutionShown, btn, dotsWrap, container, qData, verifiedOk }

  function getConceptFlow(concept) {
    // IMPORTANT: cache flow so items keep runtime state across re-renders
    if (concept && Array.isArray(concept._flowCache) && concept._flowCache.length) {
      return concept._flowCache;
    }

    let flow = null;

    if (Array.isArray(concept?.flow) && concept.flow.length) {
      // Use original flow array (stable reference) + cache it
      flow = concept.flow;
    } else {
      // Backward compatible: build flow from legacy keys (once)
      flow = [];
      for (const key of LEGACY_ORDER) {
        if (key === 'question') {
          if (concept?.question) {
            flow.push({ type: 'question', q: concept.question });
          }
        } else {
          if (concept?.[key]) flow.push({ type: key, text: concept[key] });
        }
      }
    }

    // cache for stability
    if (concept) concept._flowCache = flow || [];
    return concept?._flowCache || [];
  }

  function buildNormalizedQuestionFromItem(item) {
    // If flow item already contains q object:
    if (item?.q && typeof item.q === 'object') {
      // Use the same object reference as base, but ensure required fields exist
      const q = item.q;

      // Ensure type exists (if missing infer)
      if (!q.type) {
        q.type =
          item?.qtype ||
          item?.questionType ||
          (Array.isArray(q?.choices) ? 'mcq' : 'input');
      }

      // Ensure common fields exist
      if (q.text == null) q.text = item?.text || 'سؤال';
      if (!Array.isArray(q.hints)) q.hints = q.hints ? [q.hints] : [];
      if (q.solution == null) q.solution = '';

      return q;
    }

    // Otherwise infer from item structure (question written directly in flow)
    const inferredType =
      item?.qtype ||
      item?.questionType ||
      (Array.isArray(item?.choices) ? 'mcq' : 'input');

    const q = {
      type: inferredType,
      text: item?.text || 'سؤال',
      hints: Array.isArray(item?.hints) ? item.hints : [],
      solution: item?.solution || '',
    };

    if (inferredType === 'mcq') {
      q.choices = item?.choices || [];
      q.correctIndex = typeof item?.correctIndex === 'number' ? item.correctIndex : 0;
    } else {
      q.answer = item?.answer ?? '';
      q.placeholder = item?.placeholder;
    }

    return q;
  }

  function getStableQuestionObjectForFlowItem(item) {
    // IMPORTANT: keep one normalized question object per flow item
    // so UI state (like input value / selected choice) can persist across re-renders.
    if (item?._qState && typeof item._qState === 'object') {
      return item._qState;
    }

    const q = buildNormalizedQuestionFromItem(item);

    // Store on the flow item itself (stable if flow is cached)
    if (item) item._qState = q;

    return q;
  }

  function normalizeAssessment(assessmentData) {
    if (!assessmentData || !Array.isArray(assessmentData.questions)) return null;

    const questions = assessmentData.questions.map((question) => {
      if (!question || typeof question !== 'object') return null;

      const inferredType =
        question?.type ||
        (Array.isArray(question?.choices) ? 'mcq' : 'input');

      const normalized = {
        ...question,
        type: inferredType,
        text: question?.text || 'سؤال',
        points: Number.isFinite(question?.points) ? Number(question.points) : 1,
      };

      if (inferredType === 'mcq') {
        normalized.choices = Array.isArray(question?.choices) ? question.choices : [];
        normalized.correctIndex =
          typeof question?.correctIndex === 'number' ? question.correctIndex : 0;
      } else {
        normalized.answer = question?.answer ?? '';
        normalized.placeholder = question?.placeholder || 'اكتب إجابتك هنا';
      }

      return normalized;
    }).filter(Boolean);

    if (!questions.length) return null;

    return {
      title: assessmentData?.title || 'تقييم الدرس',
      description: assessmentData?.description || 'اختبار تقييم من نقاط دون تصويب.',
      questions,
    };
  }

  function totalFlowItems() {
    const concepts = data.concepts || [];
    let total = 0;
    for (const c of concepts) total += getConceptFlow(c).length;
    return Math.max(1, total);
  }

  function totalStages() {
    const base = 2 + totalFlowItems();
    return assessment ? base + 1 : base;
  }

  function currentFlowPosition() {
    const concepts = data.concepts || [];
    let pos = 0;
    for (let i = 0; i < conceptIndex; i++) pos += getConceptFlow(concepts[i]).length;
    pos += itemIndex;
    return pos;
  }

  function currentStagePosition() {
    if (stage === STAGES.GOALS) return 0;
    if (stage === STAGES.PREREQ) return 1;
    if (stage === STAGES.CONCEPT) return 2 + currentFlowPosition();
    return totalStages() - 1;
  }

  function updateProgress() {
    const total = totalStages();
    const pos = currentStagePosition();
    const pct = Math.max(0, Math.min(100, Math.round((pos / total) * 100)));
    setProgressUI(pct);
  }

  function saveProgress() {
    setStudentProgress(studentId, week, {
      stage,
      conceptIndex,
      stepIndex: itemIndex,
      assessment: assessmentState,
    });
  }

  function clampToValidPosition() {
    const concepts = data.concepts || [];
    if (!concepts.length) {
      conceptIndex = 0;
      itemIndex = 0;
      return;
    }

    conceptIndex = Math.max(0, Math.min(conceptIndex, concepts.length - 1));

    const flow = getConceptFlow(concepts[conceptIndex]);
    if (!flow.length) {
      itemIndex = 0;
      return;
    }

    itemIndex = Math.max(0, Math.min(itemIndex, flow.length - 1));
  }

  function applyResumeIfAvailable() {
    if (isCardDone(studentId, week)) return;

    const saved = getStudentProgress(studentId, week)?.progress;
    if (!saved) return;

    if (saved.stage && Object.values(STAGES).includes(saved.stage)) {
      stage = saved.stage;
    }

    if (Number.isFinite(saved.conceptIndex)) conceptIndex = Number(saved.conceptIndex);
    if (Number.isFinite(saved.stepIndex)) itemIndex = Number(saved.stepIndex);

    if (saved.assessment && typeof saved.assessment === 'object') {
      assessmentState = {
        ...assessmentState,
        ...saved.assessment,
      };
    }

    clampToValidPosition();

    // focus the current item after first render
    pendingFocus = { conceptIndex, itemIndex };
    firstPaint = true;
  }

  function isLastPosition() {
    const concepts = data.concepts || [];
    if (!concepts.length) return true;

    const lastConceptIdx = concepts.length - 1;
    const lastFlow = getConceptFlow(concepts[lastConceptIdx]);
    const lastItemIdx = Math.max(0, lastFlow.length - 1);

    return conceptIndex === lastConceptIdx && itemIndex === lastItemIdx;
  }

  function finishCard() {
    // Persist completion
    markCardDone(studentId, week);

    // Pass title for certificate hook readiness
    const cardTitle = String(data?.title || '');
    const finalScore = Number.isFinite(assessmentState?.score) ? assessmentState.score : 0;

    // Use existing completion handler (shows UI + returns home)
    completeLesson({ studentId, week, cardTitle, finalScore });
  }

  function render() {
    mountEl.innerHTML = '';
    activeQuestion = null;

    if (stage === STAGES.GOALS) {
      renderGoalsStage();
      return;
    }

    if (stage === STAGES.PREREQ) {
      renderPrereqStage();
      return;
    }

    if (stage === STAGES.ASSESSMENT) {
      renderAssessmentStage();
      return;
    }

    renderConceptStage();
  }

  function renderGoalsStage() {
    const card = document.createElement('div');
    card.className = 'lesson-stage card';

    card.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">المرحلة الأولى</span>
        <h3 class="stage-title">عرض الأهداف كاملة</h3>
      </div>
      <div class="stage-body"></div>
    `;

    const body = card.querySelector('.stage-body');
    const list = document.createElement('ul');
    list.className = 'goal-list';

    if (goalsList.length) {
      goalsList.forEach((goal, idx) => {
        const item = document.createElement('li');
        item.className = 'goal-item';
        item.innerHTML = `
          <span class="goal-index">${idx + 1}</span>
          <span class="goal-text">${escapeHtml(goal.text)}</span>
        `;
        list.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'stage-empty';
      empty.textContent = 'لا توجد أهداف مسجلة بعد.';
      body.appendChild(empty);
    }

    body.appendChild(list);

    const nav = document.createElement('div');
    nav.className = 'lesson-nav';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary w-100';
    btn.textContent = 'متابعة';
    btn.addEventListener('click', () => {
      stage = STAGES.PREREQ;
      render();
    });

    nav.appendChild(btn);
    card.appendChild(nav);
    mountEl.appendChild(card);

    updateProgress();
    saveProgress();
  }

  function renderPrereqStage() {
    const card = document.createElement('div');
    card.className = 'lesson-stage card';

    card.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">المرحلة الثانية</span>
        <h3 class="stage-title">عرض المتطلبات السابقة</h3>
      </div>
      <div class="stage-body"></div>
    `;

    const body = card.querySelector('.stage-body');
    const list = document.createElement('ul');
    list.className = 'goal-list prereq-list';

    if (prereqList.length) {
      prereqList.forEach((req, idx) => {
        const item = document.createElement('li');
        item.className = 'goal-item';
        item.innerHTML = `
          <span class="goal-index">${idx + 1}</span>
          <span class="goal-text">${escapeHtml(req)}</span>
        `;
        list.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'stage-empty';
      empty.textContent = 'لا توجد متطلبات سابقة لهذه البطاقة.';
      body.appendChild(empty);
    }

    body.appendChild(list);

    const nav = document.createElement('div');
    nav.className = 'lesson-nav';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary w-100';
    btn.textContent = 'متابعة';
    btn.addEventListener('click', () => {
      stage = STAGES.CONCEPT;
      conceptIndex = 0;
      itemIndex = 0;
      render();
    });

    nav.appendChild(btn);
    card.appendChild(nav);
    mountEl.appendChild(card);

    updateProgress();
    saveProgress();
  }

  function renderConceptStage() {
    const concept = data.concepts?.[conceptIndex];
    if (!concept) {
      if (assessment) {
        stage = STAGES.ASSESSMENT;
        render();
        return;
      }
      finishCard();
      return;
    }

    const flow = getConceptFlow(concept);
    if (!flow.length) {
      conceptIndex++;
      itemIndex = 0;
      render();
      return;
    }

    // clamp
    if (itemIndex < 0) itemIndex = 0;

    if (itemIndex >= flow.length) {
      conceptIndex++;
      itemIndex = 0;
      render();
      return;
    }

    const card = document.createElement('div');
    card.className = 'concept';

    const cardInner = document.createElement('div');
    cardInner.className = 'card';

    cardInner.innerHTML = `
      <div class="stage-progress">
        <span class="stage-badge">المرحلة الثالثة</span>
        <div class="stage-progress-body"></div>
      </div>
      <div class="concept-header">
        <div class="row">
          <span class="concept-index">${conceptIndex + 1}</span>
          <h3 class="concept-title">${escapeHtml(concept.title || '')}</h3>
        </div>
      </div>
      <div class="concept-body" data-concept-index="${conceptIndex}"></div>
    `;

    const stageBody = cardInner.querySelector('.stage-progress-body');
    stageBody.appendChild(renderGoalsProgress(conceptIndex));

    const body = cardInner.querySelector('.concept-body');

    // render items up to current
    for (let i = 0; i <= itemIndex; i++) {
      const item = flow[i];
      if (!item || !item.type) continue;

      if (item.type === 'question') {
        body.appendChild(renderQuestionItem(item, i));
      } else if (item.type === 'video') {
        body.appendChild(renderVideoItem(item, i));
      } else {
        body.appendChild(renderTextItem(item, i));
      }
    }

    // single button bar (always)
    const bar = document.createElement('div');
    bar.className = 'lesson-nav';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary w-100';
    btn.textContent = 'متابعة';

    bar.appendChild(btn);
    body.appendChild(bar);

    // decide behavior for current item
    const currentItem = flow[itemIndex];
    if (currentItem?.type === 'question' && activeQuestion) {
      activeQuestion.btn = btn;
      btn.addEventListener('click', () => onVerifyOrAdvanceQuestion());
    } else {
      btn.addEventListener('click', () => advanceWithFocus());
    }

    card.appendChild(cardInner);
    mountEl.appendChild(card);

    updateProgress();
    saveProgress();

    if (pendingFocus) {
      requestAnimationFrame(() => {
        scrollAndFocusToItem(pendingFocus.itemIndex);
        pendingFocus = null;
      });
    }
    firstPaint = false;
  }

  function renderAssessmentStage() {
    if (!assessment) {
      finishCard();
      return;
    }

    const card = document.createElement('div');
    card.className = 'lesson-stage card assessment';

    card.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">المرحلة الرابعة</span>
        <h3 class="stage-title">${escapeHtml(assessment.title)}</h3>
        <p class="stage-desc">${escapeHtml(assessment.description)}</p>
      </div>
      <div class="stage-body assessment-body"></div>
    `;

    const body = card.querySelector('.assessment-body');

    assessment.questions.forEach((question, index) => {
      const item = document.createElement('div');
      item.className = 'assessment-question';
      item.appendChild(renderAssessmentQuestion(question, index));
      body.appendChild(item);
    });

    const actions = document.createElement('div');
    actions.className = 'lesson-nav';

    const btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn btn-primary w-100';
    btnSubmit.textContent = 'احسب النتيجة';

    const btnFinish = document.createElement('button');
    btnFinish.className = 'btn btn-outline w-100';
    btnFinish.textContent = 'إنهاء البطاقة';

    const result = document.createElement('div');
    result.className = 'assessment-result hidden';

    if (assessmentState.completed) {
      applyAssessmentResult(result, assessmentState);
      result.classList.remove('hidden');
      btnSubmit.disabled = true;
    }

    btnSubmit.addEventListener('click', () => {
      if (assessmentState.completed && assessmentState.attempts >= 2) return;

      const { score, total } = scoreAssessment(assessment.questions);
      assessmentState = {
        attempts: assessmentState.attempts + 1,
        completed: true,
        score,
        total,
      };

      showToast('نتيجة التقييم', `حصلت على ${score} من ${total} نقطة.`, 'success', 3500);
      render();
    });

    btnFinish.addEventListener('click', () => {
      if (!assessmentState.completed) {
        showToast('تنبيه', 'احسب النتيجة أولًا قبل إنهاء البطاقة', 'warning');
        return;
      }
      finishCard();
    });

    actions.appendChild(btnSubmit);
    actions.appendChild(btnFinish);

    card.appendChild(actions);
    card.appendChild(result);
    mountEl.appendChild(card);

    updateProgress();
    saveProgress();
  }

  function applyAssessmentResult(container, state) {
    const retryLeft = state.attempts < 2;

    container.innerHTML = `
      <div class="assessment-score">
        حصلت على <strong>${state.score}</strong> من <strong>${state.total}</strong> نقطة.
      </div>
      <div class="assessment-note">
        ${retryLeft ? 'يمكنك إعادة المحاولة مرة واحدة فقط.' : 'تم استهلاك فرصة إعادة المحاولة.'}
      </div>
    `;

    if (retryLeft) {
      const btnRetry = document.createElement('button');
      btnRetry.type = 'button';
      btnRetry.className = 'btn btn-ghost w-100';
      btnRetry.textContent = 'إعادة المحاولة (مرة واحدة)';
      btnRetry.addEventListener('click', () => {
        assessmentState = {
          attempts: state.attempts,
          completed: false,
          score: null,
          total: null,
        };

        assessment.questions.forEach((question) => resetAssessmentQuestion(question));
        render();
      });
      container.appendChild(btnRetry);
    }
  }

  function renderTextItem(item, idx) {
    const map = {
      goal:     { title: 'الهدف', cls: '' },
      explain:  { title: 'الشرح', cls: '' },
      example:  { title: 'مثال محلول', cls: 'example' },
      example2: { title: 'مثال إضافي', cls: 'example' },
      mistake:  { title: 'خطأ شائع', cls: 'warning' },
      note:     { title: 'ملاحظة', cls: 'note' },
      detail:   { title: 'تفصيل إضافي', cls: 'detail' },
    };

    const cfg = map[item.type] || { title: 'محتوى', cls: '' };

    const el = document.createElement('div');
    el.className = `step ${cfg.cls || ''}`.trim();
    el.setAttribute('data-step-index', String(idx));
    el.setAttribute('data-step-key', item.type);

    const details = Array.isArray(item.details)
      ? item.details.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
      : '';

    el.innerHTML = `
      <p class="step-title">${cfg.title}</p>
      <div class="step-text">${escapeHtml(item.text ?? '')}</div>
      ${details ? `<ul class="step-details">${details}</ul>` : ''}
    `;
    return el;
  }

  function renderVideoItem(item, idx) {
    const el = document.createElement('div');
    el.className = 'step video';
    el.setAttribute('data-step-index', String(idx));
    el.setAttribute('data-step-key', 'video');

    const title = item?.title || 'فيديو توضيحي';
    const description = item?.description || item?.text || '';
    const url = item?.url || item?.src || '';

    const embed = renderVideoEmbed(url);

    el.innerHTML = `
      <p class="step-title">${escapeHtml(title)}</p>
      ${description ? `<div class="step-text">${escapeHtml(description)}</div>` : ''}
      <div class="video-frame">${embed}</div>
    `;

    return el;
  }

  function renderVideoEmbed(url) {
    if (!url) {
      return '<div class="video-empty">لم يتم إضافة رابط فيديو بعد.</div>';
    }

    const youtubeId = getYouTubeId(url);
    if (youtubeId) {
      const safeId = encodeURIComponent(youtubeId);
      return `
        <iframe
          class="video-embed"
          src="https://www.youtube.com/embed/${safeId}"
          title="فيديو الدرس"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      `;
    }

    return `
      <video class="video-embed" controls preload="metadata" src="${escapeHtml(url)}"></video>
    `;
  }

  function renderQuestionItem(item, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'question-wrap';
    wrap.setAttribute('data-step-index', String(idx));
    wrap.setAttribute('data-step-key', 'question');

    // IMPORTANT: stable question object for this flow item (persists across re-renders)
    const qData = getStableQuestionObjectForFlowItem(item);

    const title = document.createElement('p');
    title.className = 'question-title';
    title.textContent = qData.text || 'سؤال';

    const attemptsWrap = document.createElement('div');
    attemptsWrap.className = 'attempts';
    attemptsWrap.innerHTML = `
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    `;

    const qMount = document.createElement('div');

    const actions = document.createElement('div');
    actions.className = 'question-actions';
    actions.appendChild(attemptsWrap);

    wrap.appendChild(title);
    wrap.appendChild(qMount);
    wrap.appendChild(actions);

    try {
      const q = renderQuestion({ mountEl: qMount, question: qData });

      activeQuestion = {
        check: q.check,
        attempts: 0,
        solutionShown: false,
        btn: null,
        dotsWrap: attemptsWrap,
        container: wrap,
        qData,
        verifiedOk: false,
      };
    } catch (err) {
      console.error(err);
      const errBox = document.createElement('div');
      errBox.className = 'solution';
      errBox.innerHTML = `
        <p class="solution-title">خطأ في إعداد السؤال</p>
        <div class="solution-text">تأكد من نوع السؤال وحقوله (input/mcq).</div>
      `;
      wrap.appendChild(errBox);
      showToast('خطأ', 'في مشكلة ببيانات السؤال (JSON)', 'error', 4500);
      activeQuestion = null;
    }

    return wrap;
  }

  function renderAssessmentQuestion(question, index) {
    const wrap = document.createElement('div');
    wrap.className = 'assessment-item';

    const title = document.createElement('p');
    title.className = 'assessment-title';
    title.textContent = `${index + 1}. ${question.text}`;

    wrap.appendChild(title);

    if (question.type === 'mcq') {
      const groupName = `assessment-${index}`;

      (question.choices || []).forEach((choice, cIdx) => {
        const label = document.createElement('label');
        label.className = 'choice';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = groupName;
        radio.value = String(cIdx);
        radio.checked = question._selectedIndex === cIdx;
        radio.addEventListener('change', () => {
          question._selectedIndex = cIdx;
        });

        const span = document.createElement('span');
        span.textContent = choice;

        label.appendChild(radio);
        label.appendChild(span);
        wrap.appendChild(label);
      });

      return wrap;
    }

    const input = document.createElement('input');
    input.className = 'input ltr';
    input.type = 'text';
    input.placeholder = question.placeholder || 'اكتب إجابتك هنا';
    input.value = question._value || '';
    input.addEventListener('input', () => {
      question._value = input.value;
    });

    wrap.appendChild(input);
    return wrap;
  }

  function resetAssessmentQuestion(question) {
    delete question._value;
    delete question._selectedIndex;
  }

  function scoreAssessment(questions) {
    let score = 0;
    let total = 0;

    questions.forEach((question) => {
      const points = Number.isFinite(question.points) ? question.points : 1;
      total += points;

      if (question.type === 'mcq') {
        if (question._selectedIndex === question.correctIndex) score += points;
        return;
      }

      const rawUser = question._value ?? '';
      const rawAns = question.answer ?? '';
      const ok = compareAnswer(rawUser, rawAns);
      if (ok) score += points;
    });

    return { score, total };
  }

  function compareAnswer(userValue, answerValue) {
    const user = normalizeSpaces(userValue);
    const ans = normalizeSpaces(answerValue);

    if (isNumericAnswer(ans)) {
      const userNum = parseNumericValue(user);
      const ansNum = parseNumericValue(ans);

      return Number.isFinite(userNum) && Number.isFinite(ansNum) && userNum === ansNum;
    }

    return user !== '' && user === ans;
  }

  function normalizeSpaces(s) {
    if (s == null) return '';
    return String(s).trim().replace(/\s+/g, ' ');
  }

  function toLatinDigits(str) {
    const map = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
      '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
      '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    };
    return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
  }

  function parseNumericValue(value) {
    if (value == null) return NaN;
    const normalized = toLatinDigits(String(value))
      .trim()
      .replace(',', '.')
      .replace(/\s+/g, '');

    if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return NaN;

    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function isNumericAnswer(ans) {
    return Number.isFinite(parseNumericValue(ans));
  }

  function getYouTubeId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.replace('/', '');
      }
      if (parsed.hostname.includes('youtube.com')) {
        return parsed.searchParams.get('v');
      }
    } catch {
      return null;
    }
    return null;
  }

  function onVerifyOrAdvanceQuestion() {
    if (!activeQuestion || !activeQuestion.btn) return;

    if (activeQuestion.verifiedOk) {
      advanceWithFocus();
      return;
    }

    const ok = activeQuestion.check();

    if (ok) {
      activeQuestion.verifiedOk = true;
      activeQuestion.btn.disabled = true;

      showToast('صح ✔', pickRandom(ENCOURAGEMENTS), 'success');

      setTimeout(() => {
        advanceWithFocus();
      }, 850);

      return;
    }

    activeQuestion.attempts++;
    const a = activeQuestion.attempts;

    if (a <= ENGINE.MAX_ATTEMPTS) {
      markAttempt(activeQuestion.dotsWrap, a);

      if (a < ENGINE.MAX_ATTEMPTS) {
        const hint =
          activeQuestion.qData.hints?.[a - 1] ||
          DEFAULT_HINTS[a - 1] ||
          FINAL_HINT;

        showToast('تلميح', hint, 'warning', 4000);
      } else {
        const hint3 = activeQuestion.qData.hints?.[a - 1] || FINAL_HINT;
        showToast('تلميح قوي', hint3, 'warning', 4500);

        if (!activeQuestion.solutionShown) {
          showToast('الحل', 'تم عرض الحل النموذجي تحت', 'danger', 4500);
          showSolution(activeQuestion.container, activeQuestion.qData.solution);
          activeQuestion.solutionShown = true;
        }
      }
    } else {
      showToast('جرّب كمان', 'ارجع للحل واعمل متابعة مرة ثانية', 'info', 2500);
    }
  }

  function markAttempt(wrap, count) {
    const dots = wrap.querySelectorAll('.dot');
    for (let i = 0; i < count && i < dots.length; i++) {
      dots[i].classList.add('used');
    }
  }

  function showSolution(container, solutionText) {
    const existing = container.querySelector('.solution');
    if (existing) return;

    const sol = document.createElement('div');
    sol.className = 'solution';
    sol.innerHTML = `
      <p class="solution-title">الحل النموذجي</p>
      <div class="solution-text">${escapeHtml(solutionText || '')}</div>
    `;
    container.appendChild(sol);
  }

  function setPendingFocusToNext() {
    const concepts = data.concepts || [];
    const concept = concepts[conceptIndex];
    const flow = concept ? getConceptFlow(concept) : [];

    let nextConcept = conceptIndex;
    let nextItem = itemIndex + 1;

    if (nextItem >= flow.length) {
      nextConcept = conceptIndex + 1;
      nextItem = 0;
    }

    pendingFocus = { conceptIndex: nextConcept, itemIndex: nextItem };
  }

  function advance() {
    const concepts = data.concepts || [];
    const concept = concepts[conceptIndex];
    const flow = concept ? getConceptFlow(concept) : [];

    // If we are at the last item of the last concept and trying to advance
    if (isLastPosition()) {
      if (assessment) {
        stage = STAGES.ASSESSMENT;
        render();
        return;
      }
      finishCard();
      return;
    }

    itemIndex++;
    if (itemIndex >= flow.length) {
      conceptIndex++;
      itemIndex = 0;
    }
    render();
  }

  function advanceWithFocus() {
    setPendingFocusToNext();
    advance();
  }

  function scrollAndFocusToItem(iIdx) {
    const target = mountEl.querySelector(`[data-step-index="${iIdx}"]`);
    if (!target) return;

    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }

  function renderGoalsProgress(currentIndex) {
    const list = document.createElement('ul');
    list.className = 'goal-progress';

    if (!goalsList.length) {
      const empty = document.createElement('li');
      empty.className = 'goal-progress-item muted';
      empty.textContent = 'لم يتم تحديد أهداف لهذه البطاقة بعد.';
      list.appendChild(empty);
      return list;
    }

    goalsList.forEach((goal, idx) => {
      const item = document.createElement('li');
      let status = 'upcoming';
      let statusText = 'قادم';

      if (idx < currentIndex) {
        status = 'done';
        statusText = 'مكتمل ✔️';
      } else if (idx === currentIndex) {
        status = 'current';
        statusText = 'الهدف الحالي';
      }

      item.className = `goal-progress-item ${status}`;
      item.innerHTML = `
        <span class="goal-status">${statusText}</span>
        <span class="goal-text">${escapeHtml(goal.text)}</span>
      `;

      list.appendChild(item);
    });

    return list;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getGoalsList(dataObj) {
    if (Array.isArray(dataObj?.goals) && dataObj.goals.length) {
      return dataObj.goals.map((goal) => ({
        text: typeof goal === 'string' ? goal : String(goal?.text || ''),
      })).filter((goal) => goal.text.trim() !== '');
    }

    const goals = [];
    (dataObj?.concepts || []).forEach((concept) => {
      const flow = Array.isArray(concept?.flow) ? concept.flow : [];
      const goalItem = flow.find((item) => item?.type === 'goal');
      const text = goalItem?.text || concept?.title || 'هدف';
      goals.push({ text: String(text) });
    });

    return goals;
  }

  function getPrereqList(dataObj) {
    if (Array.isArray(dataObj?.prerequisites)) {
      return dataObj.prerequisites.filter((item) => String(item).trim() !== '')
        .map((item) => String(item));
    }

    if (Array.isArray(dataObj?.prereq)) {
      return dataObj.prereq.filter((item) => String(item).trim() !== '')
        .map((item) => String(item));
    }

    return [];
  }

  // Apply resume (if any) before first render
  applyResumeIfAvailable();

  // start
  render();
}
