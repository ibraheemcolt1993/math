/* =========================================================
   engine.js — Unlimited Flow Engine (single "متابعة" button) + Resume + Completion
   - Concepts can use: concept.flow = [ {type:..., ...}, ... ]  ✅ (no limits)
   - Backward compatible: if no flow, we build flow from legacy fields
   - One button only: "متابعة"
     * On text items: reveals next item
     * On question items: "متابعة" = تحقق للسؤال الحالي
       - Wrong: hints/attempts/solution
       - Correct: toast تعزيز + مهلة قصيرة ثم يكشف اللي بعده تلقائيًا
   - Auto scroll + focus to newly revealed item after advancing
   - Fix: infer question.type if flow item doesn't include it
   - Resume: load saved { conceptIndex, stepIndex } from storage and continue
   - Completion: when finishing the last item of the last concept -> mark done + show completion + return home
   ========================================================= */

import { ENGINE } from '../core/constants.js';
import { showToast } from '../ui/toast.js';
import { ENCOURAGEMENTS, DEFAULT_HINTS, FINAL_HINT, pickRandom } from '../ui/text.js';
import { renderQuestion } from '../questions/registry.js';
import { setStudentProgress, getStudentProgress, isCardDone, markCardDone } from '../core/storage.js';
import { setProgressUI } from './progress.js';
import { completeLesson } from './completion.js';

const LEGACY_ORDER = ['goal', 'explain', 'example', 'example2', 'mistake', 'note', 'question'];

export function initEngine({ week, studentId, data, mountEl }) {
  mountEl.innerHTML = '';

  let conceptIndex = 0;
  let itemIndex = 0;

  // Scroll/focus control
  let pendingFocus = null; // { conceptIndex, itemIndex }
  let firstPaint = true;

  // Question state (for current question only)
  let activeQuestion = null; // { check, attempts, solutionShown, btn, dotsWrap, container, qData, verifiedOk }

  function getConceptFlow(concept) {
    if (Array.isArray(concept.flow) && concept.flow.length) return concept.flow;

    // Backward compatible: build flow from legacy keys
    const flow = [];
    for (const key of LEGACY_ORDER) {
      if (key === 'question') {
        if (concept.question) {
          flow.push({ type: 'question', q: concept.question });
        }
      } else {
        if (concept[key]) flow.push({ type: key, text: concept[key] });
      }
    }
    return flow;
  }

  function normalizeFlowQuestionItem(item) {
    if (item?.q && typeof item.q === 'object') {
      return { ...item.q };
    }

    const inferredType =
      item?.qtype ||
      item?.questionType ||
      (Array.isArray(item?.choices) ? 'mcq' : 'input');

    const q = {
      type: inferredType,
      text: item?.text || 'سؤال',
      hints: item?.hints || [],
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

  function totalFlowItems() {
    const concepts = data.concepts || [];
    let total = 0;
    for (const c of concepts) total += getConceptFlow(c).length;
    return Math.max(1, total);
  }

  function currentFlowPosition() {
    const concepts = data.concepts || [];
    let pos = 0;
    for (let i = 0; i < conceptIndex; i++) pos += getConceptFlow(concepts[i]).length;
    pos += itemIndex;
    return pos;
  }

  function updateProgress() {
    const total = totalFlowItems();
    const pos = currentFlowPosition();
    const pct = Math.max(0, Math.min(100, Math.round((pos / total) * 100)));
    setProgressUI(pct);
  }

  function saveProgress() {
    setStudentProgress(studentId, week, {
      conceptIndex,
      stepIndex: itemIndex,
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

    if (Number.isFinite(saved.conceptIndex)) conceptIndex = Number(saved.conceptIndex);
    if (Number.isFinite(saved.stepIndex)) itemIndex = Number(saved.stepIndex);

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

    // Use existing completion handler (shows UI + returns home)
    completeLesson({ studentId, week });
  }

  function render() {
    mountEl.innerHTML = '';
    activeQuestion = null;

    const concept = data.concepts?.[conceptIndex];
    if (!concept) {
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
      <div class="concept-header">
        <div class="row">
          <span class="concept-index">${conceptIndex + 1}</span>
          <h3 class="concept-title">${escapeHtml(concept.title || '')}</h3>
        </div>
      </div>
      <div class="concept-body" data-concept-index="${conceptIndex}"></div>
    `;

    const body = cardInner.querySelector('.concept-body');

    // render items up to current
    for (let i = 0; i <= itemIndex; i++) {
      const item = flow[i];
      if (!item || !item.type) continue;

      if (item.type === 'question') {
        body.appendChild(renderQuestionItem(item, i));
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

  function renderTextItem(item, idx) {
    const map = {
      goal:    { title: 'الهدف', cls: '' },
      explain: { title: 'الشرح', cls: '' },
      example: { title: 'مثال محلول', cls: 'example' },
      example2:{ title: 'مثال إضافي', cls: 'example' },
      mistake: { title: 'خطأ شائع', cls: 'warning' },
      note:    { title: 'ملاحظة', cls: 'note' },
    };

    const cfg = map[item.type] || { title: 'محتوى', cls: '' };

    const el = document.createElement('div');
    el.className = `step ${cfg.cls || ''}`.trim();
    el.setAttribute('data-step-index', String(idx));
    el.setAttribute('data-step-key', item.type);

    el.innerHTML = `
      <p class="step-title">${cfg.title}</p>
      <div class="step-text">${escapeHtml(item.text ?? '')}</div>
    `;
    return el;
  }

  function renderQuestionItem(item, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'question-wrap';
    wrap.setAttribute('data-step-index', String(idx));
    wrap.setAttribute('data-step-key', 'question');

    const qData = normalizeFlowQuestionItem(item);

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

    // If we are at the last item of the last concept and trying to advance -> finish
    if (isLastPosition()) {
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

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // Apply resume (if any) before first render
  applyResumeIfAvailable();

  // start
  render();
}
