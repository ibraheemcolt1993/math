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
import { replaceMathTokensInElement } from '../shared/stripMathTokens.js';
import { judgeTextAnswer } from '../shared/textAnswerJudge.js';

const LEGACY_ORDER = ['goal', 'explain', 'example', 'example2', 'mistake', 'note', 'question'];
const STAGES = {
  GOALS: 'goals',
  PREREQ: 'prereq',
  CONCEPT: 'concept',
  ASSESSMENT: 'assessment',
};

export function initEngine({ week, studentId, data, mountEl, preview = false }) {
  mountEl.innerHTML = '';

  let stage = STAGES.GOALS;
  let conceptIndex = 0;
  let itemIndex = 0;

  let assessmentState = {
    attempts: 0,
    completed: false,
    score: null,
    total: null,
    currentIndex: 0,
  };
  let prereqIndex = 0;

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
          (item?.type && item.type !== 'question' ? item.type : null) ||
          (Array.isArray(q?.choices) ? 'mcq' : 'input');
      }

      // Ensure common fields exist
      if (q.text == null) q.text = item?.text || 'سؤال';
      if (!Array.isArray(q.hints)) q.hints = q.hints ? [q.hints] : [];
      if (q.solution == null) q.solution = '';
      if (q.type === 'ordering' && !Array.isArray(q.items)) {
        q.items = Array.isArray(item?.items)
          ? item.items
          : Array.isArray(item?.choices)
            ? item.choices
            : Array.isArray(q?.choices)
              ? q.choices
              : [];
      }
      if (q.type === 'match' && !Array.isArray(q.pairs)) {
        q.pairs = Array.isArray(item?.pairs) ? item.pairs : Array.isArray(q?.pairs) ? q.pairs : [];
      }
      if (q.type === 'fillblank' && !Array.isArray(q.blanks)) {
        q.blanks = Array.isArray(item?.blanks)
          ? item.blanks
          : Array.isArray(q?.blanks)
            ? q.blanks
            : [];
      }
      if (q.validation && typeof q.validation !== 'object') {
        q.validation = null;
      }
      if (q.isRequired == null) q.isRequired = item?.isRequired !== false;

      return q;
    }

    // Otherwise infer from item structure (question written directly in flow)
    const inferredType =
      item?.qtype ||
      item?.questionType ||
      (item?.type && item.type !== 'question' ? item.type : null) ||
      (Array.isArray(item?.choices) ? 'mcq' : 'input');

    const q = {
      type: inferredType,
      text: item?.text || 'سؤال',
      hints: Array.isArray(item?.hints) ? item.hints : [],
      solution: item?.solution || '',
      isRequired: item?.isRequired !== false,
      validation: item?.validation && typeof item.validation === 'object' ? item.validation : null
    };

    if (inferredType === 'mcq') {
      q.choices = item?.choices || [];
      q.correctIndex = typeof item?.correctIndex === 'number' ? item.correctIndex : 0;
    } else if (inferredType === 'ordering') {
      q.items = Array.isArray(item?.items)
        ? item.items
        : Array.isArray(item?.choices)
          ? item.choices
          : [];
    } else if (inferredType === 'match') {
      q.pairs = Array.isArray(item?.pairs) ? item.pairs : [];
    } else if (inferredType === 'fillblank') {
      q.blanks = Array.isArray(item?.blanks) ? item.blanks : [];
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
        isRequired: question?.isRequired !== false,
        validation: question?.validation && typeof question.validation === 'object' ? question.validation : null
      };

      if (inferredType === 'mcq') {
        normalized.choices = Array.isArray(question?.choices) ? question.choices : [];
        normalized.correctIndex =
          typeof question?.correctIndex === 'number' ? question.correctIndex : 0;
      } else if (inferredType === 'input') {
        normalized.answer = question?.answer ?? '';
        normalized.placeholder = question?.placeholder || 'اكتب إجابتك هنا';
      } else if (inferredType === 'ordering') {
        normalized.items = Array.isArray(question?.items)
          ? question.items
          : Array.isArray(question?.choices)
            ? question.choices
            : [];
      } else if (inferredType === 'match') {
        normalized.pairs = Array.isArray(question?.pairs) ? question.pairs : [];
      } else if (inferredType === 'fillblank') {
        normalized.blanks = Array.isArray(question?.blanks) ? question.blanks : [];
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
    return total;
  }

  function totalStages() {
    const base = 2 + totalFlowItems();
    const total = assessment ? base + 1 : base;
    return Math.max(1, total);
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
    const pct = Math.max(0, Math.min(100, Math.round(((pos + 1) / total) * 100)));
    setProgressUI(pct);
  }

  function saveProgress() {
    if (preview) return;
    setStudentProgress(studentId, week, {
      stage,
      conceptIndex,
      stepIndex: itemIndex,
      prereqIndex,
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
    if (preview) return;
    if (isCardDone(studentId, week)) return;

    const saved = getStudentProgress(studentId, week)?.progress;
    if (!saved) return;

    if (saved.stage && Object.values(STAGES).includes(saved.stage)) {
      stage = saved.stage;
    }

    if (Number.isFinite(saved.conceptIndex)) conceptIndex = Number(saved.conceptIndex);
    if (Number.isFinite(saved.stepIndex)) itemIndex = Number(saved.stepIndex);
    if (Number.isFinite(saved.prereqIndex)) prereqIndex = Number(saved.prereqIndex);

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
    if (preview) {
      const completeEl = document.getElementById('lessonComplete');
      if (completeEl) {
        completeEl.classList.remove('hidden');
        completeEl.removeAttribute('hidden');
        completeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

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
      replaceMathTokensInElement(mountEl);
      return;
    }

    if (stage === STAGES.PREREQ) {
      renderPrereqStage();
      replaceMathTokensInElement(mountEl);
      return;
    }

    if (stage === STAGES.ASSESSMENT) {
      renderAssessmentStage();
      replaceMathTokensInElement(mountEl);
      return;
    }

    renderConceptStage();
    replaceMathTokensInElement(mountEl);
  }

  function renderGoalsStage() {
    const card = document.createElement('div');
    card.className = 'lesson-stage card';

    card.innerHTML = `
      <div class="stage-header">
        <div class="stage-header-top">
          ${renderBackButton()}
          <span class="stage-badge">المرحلة الأولى</span>
        </div>
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
      prereqIndex = 0;
      render();
    });

    nav.appendChild(btn);
    card.appendChild(nav);
    mountEl.appendChild(card);
    bindStageBack(card);

    updateProgress();
    saveProgress();
  }

  function renderPrereqStage() {
    const card = document.createElement('div');
    card.className = 'lesson-stage card';

    card.innerHTML = `
      <div class="stage-header">
        <div class="stage-header-top">
          ${renderBackButton()}
          <span class="stage-badge">المرحلة الثانية</span>
        </div>
        <h3 class="stage-title">عرض المتطلبات السابقة</h3>
      </div>
      <div class="stage-body"></div>
    `;

    const body = card.querySelector('.stage-body');

    if (prereqList.length) {
      const currentIndex = Math.max(0, Math.min(prereqIndex, prereqList.length - 1));
      prereqIndex = currentIndex;

      const progress = document.createElement('div');
      progress.className = 'prereq-progress';
      progress.textContent = `المتطلب ${currentIndex + 1} من ${prereqList.length}`;
      body.appendChild(progress);

      const currentReq = prereqList[currentIndex];
      const list = document.createElement('div');
      list.className = 'prereq-stack';

      if (currentReq.type === 'input' || currentReq.type === 'mcq') {
        const wrap = document.createElement('div');
        wrap.className = 'question-wrap';
        const title = document.createElement('p');
        title.className = 'question-title';
        title.textContent = currentReq.text || `سؤال ${currentIndex + 1}`;
        wrap.appendChild(title);

        const mount = document.createElement('div');
        wrap.appendChild(mount);
        list.appendChild(wrap);

        let check = null;
        try {
          const q = renderQuestion({ mountEl: mount, question: currentReq });
          check = q?.check;
        } catch (error) {
          const err = document.createElement('div');
          err.className = 'solution';
          err.innerHTML = '<p class="solution-title">تعذر عرض السؤال</p>';
          wrap.appendChild(err);
        }

        const nav = document.createElement('div');
        nav.className = 'lesson-nav';

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary w-100';
        btn.textContent = currentIndex === prereqList.length - 1
          ? 'تحقق والانتقال للمرحلة التالية'
          : 'تحقق والمتابعة';
        btn.addEventListener('click', () => {
          if (!check) return;

          if (currentReq.isRequired === false && !hasResponse(currentReq)) {
            showToast('تم التجاوز', 'تم تجاوز السؤال الاختياري', 'info', 2500);
            moveToNextPrereqItem();
            return;
          }

          if (!hasResponse(currentReq)) {
            showToast('تنبيه', 'جاوب على السؤال أولًا قبل المتابعة', 'warning', 3000);
            return;
          }

          const ok = check();
          if (!ok) {
            showToast('إجابة غير صحيحة', 'حاول مرة أخرى', 'error', 3000);
            return;
          }

          showToast('إجابة صحيحة', pickRandom(ENCOURAGEMENTS), 'success', 2500);
          moveToNextPrereqItem();
        });

        nav.appendChild(btn);
        list.appendChild(nav);
      } else {
        const item = document.createElement('div');
        item.className = 'goal-item';
        item.innerHTML = `
          <span class="goal-index">${currentIndex + 1}</span>
          <span class="goal-text">${escapeHtml(currentReq.text || currentReq)}</span>
        `;
        list.appendChild(item);

        const nav = document.createElement('div');
        nav.className = 'lesson-nav';

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary w-100';
        btn.textContent = currentIndex === prereqList.length - 1
          ? 'متابعة للمرحلة التالية'
          : 'متابعة';
        btn.addEventListener('click', () => moveToNextPrereqItem());
        nav.appendChild(btn);
        list.appendChild(nav);
      }

      body.appendChild(list);
    } else {
      const empty = document.createElement('div');
      empty.className = 'stage-empty';
      empty.textContent = 'لا توجد متطلبات سابقة لهذه البطاقة.';
      body.appendChild(empty);

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
    }
    mountEl.appendChild(card);
    bindStageBack(card);

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
        <div class="stage-header-top">
          ${renderBackButton()}
          <span class="stage-badge">المرحلة الثالثة</span>
        </div>
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

      if (isQuestionItem(item)) {
        body.appendChild(renderQuestionItem(item, i));
      } else if (item.type === 'video') {
        body.appendChild(renderVideoItem(item, i));
      } else if (item.type === 'image') {
        body.appendChild(renderImageItem(item, i));
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
    if (isQuestionItem(currentItem) && activeQuestion) {
      activeQuestion.btn = btn;
      btn.addEventListener('click', () => onVerifyOrAdvanceQuestion());
    } else {
      btn.addEventListener('click', () => advanceWithFocus());
    }

    card.appendChild(cardInner);
    mountEl.appendChild(card);
    bindStageBack(cardInner);

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
        <div class="stage-header-top">
          ${renderBackButton()}
          <span class="stage-badge">المرحلة الرابعة</span>
        </div>
        <h3 class="stage-title">${escapeHtml(assessment.title)}</h3>
        <p class="stage-desc">${escapeHtml(assessment.description)}</p>
      </div>
      <div class="stage-body assessment-body"></div>
    `;

    const body = card.querySelector('.assessment-body');
    const totalQuestions = assessment.questions.length;

    if (!totalQuestions) {
      const empty = document.createElement('div');
      empty.className = 'stage-empty';
      empty.textContent = 'لا توجد أسئلة تقييم لهذه البطاقة.';
      body.appendChild(empty);

      const actions = document.createElement('div');
      actions.className = 'lesson-nav';

      const btnFinish = document.createElement('button');
      btnFinish.className = 'btn btn-primary w-100';
      btnFinish.textContent = 'إنهاء البطاقة';
      btnFinish.addEventListener('click', () => finishCard());

      actions.appendChild(btnFinish);
      card.appendChild(actions);
      mountEl.appendChild(card);
      bindStageBack(card);

      updateProgress();
      saveProgress();
      return;
    }
    const currentIndex = Math.max(0, Math.min(assessmentState.currentIndex, totalQuestions - 1));
    assessmentState.currentIndex = currentIndex;

    const progress = document.createElement('div');
    progress.className = 'assessment-progress';
    progress.textContent = `السؤال ${currentIndex + 1} من ${totalQuestions}`;
    body.appendChild(progress);

    const currentQuestion = assessment.questions[currentIndex];
    const item = document.createElement('div');
    item.className = 'assessment-question';
    item.appendChild(renderAssessmentQuestion(currentQuestion, currentIndex));
    body.appendChild(item);

    const actions = document.createElement('div');
    actions.className = 'lesson-nav';

    const btnCheck = document.createElement('button');
    btnCheck.className = 'btn btn-primary w-100';
    btnCheck.textContent = currentIndex === totalQuestions - 1 ? 'تحقق وأنهِ التقييم' : 'تحقق وانتقل للسؤال التالي';

    btnCheck.addEventListener('click', () => {
      if (!currentQuestion) return;

      if (currentQuestion.isRequired !== false && !hasResponse(currentQuestion)) {
        showToast('تنبيه', 'جاوب على السؤال أولًا قبل المتابعة', 'warning', 3000);
        return;
      }

      if (currentQuestion.isRequired === false && !hasResponse(currentQuestion)) {
        showToast('تم التجاوز', 'تم تجاوز السؤال الاختياري', 'info', 2500);
        moveToNextAssessmentQuestion(totalQuestions);
        return;
      }

      const isCorrect = isAssessmentQuestionCorrect(currentQuestion);

      if (isCorrect) {
        showToast('إجابة صحيحة', pickRandom(ENCOURAGEMENTS), 'success', 2500);
        moveToNextAssessmentQuestion(totalQuestions);
      } else {
        showToast('إجابة غير صحيحة', 'جرّب مرة أخرى قبل المتابعة', 'error', 3000);
      }
    });

    actions.appendChild(btnCheck);
    card.appendChild(actions);
    mountEl.appendChild(card);
    bindStageBack(card);

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
      nonexample: { title: 'لا مثال', cls: 'warning' },
      note:     { title: 'ملاحظة', cls: 'note' },
      detail:   { title: 'تفصيل إضافي', cls: 'detail' },
      hintlist: { title: 'تلميحات', cls: 'detail' },
    };

    const cfg = map[item.type] || { title: 'محتوى', cls: '' };

    const el = document.createElement('div');
    el.className = `step ${cfg.cls || ''}`.trim();
    el.setAttribute('data-step-index', String(idx));
    el.setAttribute('data-step-key', item.type);

    const title = document.createElement('p');
    title.className = 'step-title';
    title.textContent = cfg.title;

    const text = document.createElement('div');
    text.className = 'step-text';
    text.appendChild(buildTokenFragment(item.text ?? ''));

    el.appendChild(title);
    el.appendChild(text);

    if (Array.isArray(item.details) && item.details.length) {
      const list = document.createElement('ul');
      list.className = 'step-details';
      item.details.forEach((line) => {
        const li = document.createElement('li');
        li.appendChild(buildTokenFragment(line));
        list.appendChild(li);
      });
      el.appendChild(list);
    }
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

  function renderImageItem(item, idx) {
    const el = document.createElement('div');
    el.className = 'step image';
    el.setAttribute('data-step-index', String(idx));
    el.setAttribute('data-step-key', 'image');

    const title = item?.title || 'صورة توضيحية';
    const description = item?.description || item?.text || '';
    const url = item?.url || '';

    const titleEl = document.createElement('p');
    titleEl.className = 'step-title';
    titleEl.textContent = title;
    el.appendChild(titleEl);

    if (description) {
      const descEl = document.createElement('div');
      descEl.className = 'step-text';
      descEl.appendChild(buildTokenFragment(description));
      el.appendChild(descEl);
    }

    if (url) {
      const img = document.createElement('img');
      img.className = 'step-image';
      img.src = url;
      img.alt = title;
      img.loading = 'lazy';
      el.appendChild(img);
    } else {
      const empty = document.createElement('div');
      empty.className = 'video-empty';
      empty.textContent = 'لم يتم إضافة صورة بعد.';
      el.appendChild(empty);
    }

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

  function isQuestionItem(item) {
    return ['question', 'ordering', 'mcq', 'input', 'match', 'fillblank'].includes(item?.type);
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
    if (qData.isRequired === false) {
      const badge = document.createElement('span');
      badge.className = 'question-badge';
      badge.textContent = 'اختياري';
      title.appendChild(badge);
    }

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

    if (question.isRequired === false) {
      const badge = document.createElement('span');
      badge.className = 'question-badge';
      badge.textContent = 'اختياري';
      wrap.appendChild(badge);
    }

    const mount = document.createElement('div');
    wrap.appendChild(mount);

    try {
      const prevText = question.text;
      const prevPrompt = question.prompt;
      if (question.type !== 'fillblank') {
        question.prompt = '';
        question.text = '';
      }
      renderQuestion({ mountEl: mount, question });
      question.text = prevText;
      question.prompt = prevPrompt;
    } catch (error) {
      const err = document.createElement('div');
      err.className = 'solution';
      err.innerHTML = '<p class="solution-title">تعذر عرض السؤال</p>';
      wrap.appendChild(err);
    }

    return wrap;
  }

  function resetAssessmentQuestion(question) {
    delete question._value;
    delete question._selectedIndex;
  }

  function moveToNextPrereqItem() {
    if (prereqIndex >= prereqList.length - 1) {
      stage = STAGES.CONCEPT;
      conceptIndex = 0;
      itemIndex = 0;
      render();
      return;
    }

    prereqIndex += 1;
    render();
  }

  function moveToNextAssessmentQuestion(totalQuestions) {
    const isLast = assessmentState.currentIndex >= totalQuestions - 1;

    if (!isLast) {
      assessmentState.currentIndex += 1;
      render();
      return;
    }

    const { score, total } = scoreAssessment(assessment.questions);
    assessmentState = {
      ...assessmentState,
      completed: true,
      score,
      total,
    };

    showToast('إجابة صحيحة', 'تم إنهاء التقييم بنجاح', 'success', 4500);
    setTimeout(() => {
      finishCard();
    }, 4500);
  }

  function isAssessmentQuestionCorrect(question) {
    if (!question) return false;

    if (question.type === 'mcq') {
      return question._selectedIndex === question.correctIndex;
    }

    if (question.type === 'ordering') {
      return isOrderingCorrect(question);
    }

    if (question.type === 'match') {
      return isMatchCorrect(question);
    }

    if (question.type === 'fillblank') {
      return isFillBlankCorrect(question);
    }

    const rawUser = question._value ?? '';
    const rawAns = question.answer ?? '';
    const textSpec = question.textSpec || question.spec || question.answerSpec;
    return compareAnswer(rawUser, rawAns, question.validation, textSpec);
  }

  function scoreAssessment(questions) {
    let score = 0;
    let total = 0;

    questions.forEach((question) => {
      const points = Number.isFinite(question.points) ? question.points : 1;
      if (!question.isRequired && !hasResponse(question)) {
        return;
      }
      total += points;

      if (question.type === 'mcq') {
        if (question._selectedIndex === question.correctIndex) score += points;
        return;
      }

      if (question.type === 'ordering') {
        if (isOrderingCorrect(question)) score += points;
        return;
      }

      if (question.type === 'match') {
        if (isMatchCorrect(question)) score += points;
        return;
      }

      if (question.type === 'fillblank') {
        if (isFillBlankCorrect(question)) score += points;
        return;
      }

      const rawUser = question._value ?? '';
      const rawAns = question.answer ?? '';
      const textSpec = question.textSpec || question.spec || question.answerSpec;
      const ok = compareAnswer(rawUser, rawAns, question.validation, textSpec);
      if (ok) score += points;
    });

    return { score, total };
  }

  function compareAnswer(userValue, answerValue, validation = {}, textSpec = null) {
    const user = normalizeSpaces(userValue);
    const ans = normalizeSpaces(extractAnswerValue(answerValue));

    if (validation.numericOnly || isNumericAnswer(ans)) {
      const userNum = parseNumericValue(user);
      const ansNum = parseNumericValue(ans);

      return Number.isFinite(userNum) && Number.isFinite(ansNum) && userNum === ansNum;
    }

    if (textSpec) {
      return judgeTextAnswer(userValue, textSpec).ok;
    }

    if (user !== '' && user === ans) return true;

    if (validation.fuzzyAutocorrect && user !== '') {
      const normalizedUser = normalizeArabic(user);
      const normalizedAns = normalizeArabic(ans);
      if (normalizedUser === normalizedAns) return true;
      if (stripLeadingAl(normalizedUser) === stripLeadingAl(normalizedAns)) return true;
      return similarity(normalizedUser, normalizedAns) >= 0.85;
    }

    return false;
  }

  function extractAnswerValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      return String(value.answer ?? value.text ?? value.value ?? '');
    }
    return String(value);
  }

  function normalizeSpaces(s) {
    if (s == null) return '';
    return toLatinDigits(String(s)).trim().replace(/\s+/g, ' ');
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

    if (/^[-+]?[\d.]+\/[-+]?[\d.]+$/.test(normalized)) {
      const [numRaw, denRaw] = normalized.split('/');
      const num = Number(numRaw);
      const den = Number(denRaw);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return NaN;
      return num / den;
    }

    if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return NaN;

    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function isNumericAnswer(ans) {
    return Number.isFinite(parseNumericValue(ans));
  }

  function normalizeArabic(value) {
    return normalizeSpaces(value)
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/ـ/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .toLowerCase();
  }

  function stripLeadingAl(value) {
    return normalizeSpaces(value)
      .split(' ')
      .map((word) => (word.startsWith('ال') ? word.slice(2) : word))
      .join(' ');
  }

  function similarity(a, b) {
    if (!a && !b) return 1;
    const aLen = a.length;
    const bLen = b.length;
    if (!aLen || !bLen) return 0;

    const dp = Array.from({ length: aLen + 1 }, () => Array(bLen + 1).fill(0));
    for (let i = 0; i <= aLen; i += 1) dp[i][0] = i;
    for (let j = 0; j <= bLen; j += 1) dp[0][j] = j;

    for (let i = 1; i <= aLen; i += 1) {
      for (let j = 1; j <= bLen; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    const distance = dp[aLen][bLen];
    return 1 - distance / Math.max(aLen, bLen);
  }

  function hasResponse(question) {
    if (!question) return false;
    if (question.type === 'mcq') return typeof question._selectedIndex === 'number';
    if (question.type === 'ordering') {
      return Array.isArray(question._order) && question._order.some((item) => item != null);
    }
    if (question.type === 'match') {
      return Array.isArray(question._matches)
        && question._matches.some((value) => String(value || '').trim());
    }
    if (question.type === 'fillblank') {
      return Array.isArray(question._blanks)
        && question._blanks.some((value) => String(value || '').trim());
    }
    return String(question._value || '').trim() !== '';
  }

  function isOrderingCorrect(question) {
    const originalItems = Array.isArray(question.items)
      ? question.items
      : Array.isArray(question.choices)
        ? question.choices
        : [];
    const order = Array.isArray(question._order) ? question._order : [];
    if (!originalItems.length) return true;
    if (order.length !== originalItems.length) return false;
    if (order.some((item) => item == null)) return false;
    return order.every((value, index) => String(value ?? '').trim() === String(originalItems[index] ?? '').trim());
  }

  function isMatchCorrect(question) {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    const selections = Array.isArray(question._matches) ? question._matches : [];
    if (!pairs.length) return true;
    if (selections.length !== pairs.length) return false;
    if (selections.some((value) => !String(value || '').trim())) return false;
    return pairs.every((pair, index) => {
      const expected = String(pair?.right ?? '').trim();
      const actual = String(selections[index] ?? '').trim();
      return expected !== '' && expected === actual;
    });
  }

  function isFillBlankCorrect(question) {
    const blanks = Array.isArray(question.blanks) ? question.blanks : [];
    const values = Array.isArray(question._blanks) ? question._blanks : [];
    const validation = { fuzzyAutocorrect: true, ...(question.validation || {}) };
    if (!blanks.length) return true;
    if (values.length < blanks.length) return false;
    return blanks.every((ans, index) => {
      const spec = Array.isArray(question.textSpec)
        ? question.textSpec[index]
        : (question.textSpec || question.spec || question.answerSpec);
      return compareAnswer(values[index] ?? '', ans ?? '', validation, spec);
    });
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

    if (activeQuestion.qData.isRequired === false && !hasResponse(activeQuestion.qData)) {
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
    replaceMathTokensInElement(sol);
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
      let statusIcon = '➜';

      if (idx < currentIndex) {
        status = 'done';
        statusIcon = '✔';
      } else if (idx === currentIndex) {
        status = 'current';
        statusIcon = '●';
      }

      item.className = `goal-progress-item ${status}`;
      item.innerHTML = `
        <span class="goal-status" aria-hidden="true">${statusIcon}</span>
        <span class="goal-text">${escapeHtml(goal.text)}</span>
      `;

      list.appendChild(item);
    });

    return list;
  }

  function buildTokenFragment(text) {
    const fragment = document.createDocumentFragment();
    const raw = String(text ?? '');
    const regex = /\[\[(frac|table|sqrt|cbrt):([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match = null;

    while ((match = regex.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
      }

      const type = match[1];
      const body = match[2];

      if (type === 'frac') {
        const [top, bottom] = body.split('|');
        const frac = document.createElement('span');
        frac.className = 'token-frac';

        const numerator = document.createElement('span');
        numerator.className = 'token-frac-top';
        numerator.textContent = top ?? '';

        const denominator = document.createElement('span');
        denominator.className = 'token-frac-bottom';
        denominator.textContent = bottom ?? '';

        frac.appendChild(numerator);
        frac.appendChild(denominator);
        fragment.appendChild(frac);
      } else if (type === 'table') {
        const [sizePart, ...cells] = body.split('|');
        const [rowsRaw, colsRaw] = String(sizePart || '').toLowerCase().split('x');
        const rows = Number(rowsRaw);
        const cols = Number(colsRaw);

        if (Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0) {
          const table = document.createElement('table');
          table.className = 'token-table';
          const tbody = document.createElement('tbody');
          let cellIndex = 0;

          for (let r = 0; r < rows; r += 1) {
            const tr = document.createElement('tr');
            for (let c = 0; c < cols; c += 1) {
              const td = document.createElement('td');
              td.textContent = cells[cellIndex] ?? '';
              tr.appendChild(td);
              cellIndex += 1;
            }
            tbody.appendChild(tr);
          }

          table.appendChild(tbody);
          fragment.appendChild(table);
        } else {
          fragment.appendChild(document.createTextNode(match[0]));
        }
      } else if (type === 'sqrt' || type === 'cbrt') {
        const root = document.createElement('span');
        root.className = 'token-root';
        const symbol = document.createElement('span');
        symbol.className = 'token-root-symbol';
        symbol.textContent = type === 'sqrt' ? '√' : '∛';
        const value = document.createElement('span');
        value.className = 'token-root-value';
        value.textContent = body ?? '';
        root.appendChild(symbol);
        root.appendChild(value);
        fragment.appendChild(root);
      } else {
        fragment.appendChild(document.createTextNode(match[0]));
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < raw.length) {
      fragment.appendChild(document.createTextNode(raw.slice(lastIndex)));
    }

    return fragment;
  }

  function renderBackButton() {
    if (stage === STAGES.GOALS) return '';

    return `
      <button type="button" class="btn btn-ghost btn-sm stage-back" data-action="stage-back">
        رجوع
      </button>
    `;
  }

  function jumpToLastConceptItem() {
    const concepts = data.concepts || [];
    if (!concepts.length) {
      conceptIndex = 0;
      itemIndex = 0;
      return;
    }
    const lastConceptIdx = concepts.length - 1;
    const lastFlow = getConceptFlow(concepts[lastConceptIdx]);
    conceptIndex = lastConceptIdx;
    itemIndex = Math.max(0, lastFlow.length - 1);
  }

  function handleStageBack() {
    if (stage === STAGES.PREREQ) {
      stage = STAGES.GOALS;
      render();
      return;
    }

    if (stage === STAGES.CONCEPT) {
      stage = STAGES.PREREQ;
      render();
      return;
    }

    if (stage === STAGES.ASSESSMENT) {
      stage = STAGES.CONCEPT;
      jumpToLastConceptItem();
      render();
    }
  }

  function bindStageBack(container) {
    const btn = container.querySelector('[data-action="stage-back"]');
    if (!btn) return;
    btn.addEventListener('click', handleStageBack);
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
    const rawGoals = Array.isArray(dataObj?.goals) ? dataObj.goals : [];
    const concepts = Array.isArray(dataObj?.concepts) ? dataObj.concepts : [];

    const normalizeGoalText = (value) => {
      if (value == null) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'object') return String(value.text || '').trim();
      return String(value).trim();
    };

    if (!concepts.length && rawGoals.length) {
      return rawGoals.map((goal, idx) => ({
        text: normalizeGoalText(goal) || `هدف ${idx + 1}`,
      }));
    }

    return concepts.map((concept, idx) => {
      const rawGoal = rawGoals[idx];
      const flow = Array.isArray(concept?.flow) ? concept.flow : [];
      const flowGoal = flow.find((item) => item?.type === 'goal');
      const resolvedGoal =
        normalizeGoalText(rawGoal) ||
        normalizeGoalText(flowGoal?.text) ||
        normalizeGoalText(concept?.title) ||
        `هدف ${idx + 1}`;

      return { text: resolvedGoal };
    });
  }

  function getPrereqList(dataObj) {
    const raw = Array.isArray(dataObj?.prerequisites)
      ? dataObj.prerequisites
      : Array.isArray(dataObj?.prereq)
        ? dataObj.prereq
        : [];

    return raw.map((item) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return { type: 'text', text };
      }
      if (item && typeof item === 'object') {
        const type = item.type === 'mcq' ? 'mcq' : 'input';
        const text = String(item.text || '').trim();
        if (!text) return null;
        return {
          type,
          text,
          choices: Array.isArray(item.choices) ? item.choices : [],
          hints: Array.isArray(item.hints) ? item.hints : [],
          answer: item.answer ?? '',
          correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : 0,
          isRequired: item.isRequired !== false,
          validation: item.validation && typeof item.validation === 'object' ? item.validation : null
        };
      }
      return null;
    }).filter(Boolean);
  }

  // Apply resume (if any) before first render
  applyResumeIfAvailable();

  // start
  render();
}
