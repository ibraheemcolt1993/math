/* =========================================================
   engine.js — Unlimited Flow Engine (single "متابعة" button)
   - Concepts can use: concept.flow = [ {type:..., ...}, ... ]  ✅ (no limits)
   - Backward compatible: if no flow, we build flow from legacy fields
   - One button only: "متابعة"
     * On text items: reveals next item
     * On question items: "متابعة" = تحقق للسؤال الحالي
       - Wrong: hints/attempts/solution
       - Correct: toast تعزيز + مهلة قصيرة ثم يكشف اللي بعده تلقائيًا
   - Auto scroll + focus to newly revealed item after advancing
   ========================================================= */

import { ENGINE } from '../core/constants.js';
import { showToast } from '../ui/toast.js';
import { ENCOURAGEMENTS, DEFAULT_HINTS, FINAL_HINT, pickRandom } from '../ui/text.js';
import { renderQuestion } from '../questions/registry.js';
import { setStudentProgress } from '../core/storage.js';
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
  let activeQuestion = null; // { check, attempts, solutionShown, btn, dotsWrap, container, question }

  function getConceptFlow(concept) {
    if (Array.isArray(concept.flow) && concept.flow.length) return concept.flow;

    // Backward compatible: build flow from legacy keys
    const flow = [];
    for (const key of LEGACY_ORDER) {
      if (key === 'question') {
        if (concept.question) {
          flow.push({ type: 'question', ...concept.question });
        }
      } else {
        if (concept[key]) flow.push({ type: key, text: concept[key] });
      }
    }
    return flow;
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
    // keep compatibility with storage schema: stepIndex
    setStudentProgress(studentId, week, {
      conceptIndex,
      stepIndex: itemIndex,
    });
  }

  function render() {
    mountEl.innerHTML = '';
    activeQuestion = null;

    const concept = data.concepts?.[conceptIndex];
    if (!concept) {
      completeLesson({ studentId, week });
      return;
    }

    const flow = getConceptFlow(concept);
    if (!flow.length) {
      // concept with no content: move on
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
      // "متابعة" acts as verify for the current question
      activeQuestion.btn = btn;
      btn.addEventListener('click', () => onVerifyOrAdvanceQuestion());
    } else {
      // normal advance
      btn.addEventListener('click', () => advanceWithFocus());
    }

    card.appendChild(cardInner);
    mountEl.appendChild(card);

    updateProgress();
    saveProgress();

    // Auto scroll/focus to newly revealed content (after pressing متابعة)
    if (!firstPaint && pendingFocus) {
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

    const title = document.createElement('p');
    title.className = 'question-title';
    title.textContent = item.text || 'سؤال';

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

    const q = renderQuestion({ mountEl: qMount, question: item });

    activeQuestion = {
      check: q.check,
      attempts: 0,
      solutionShown: false,
      btn: null,
      dotsWrap: attemptsWrap,
      container: wrap,
      question: item,
      verifiedOk: false,
    };

    return wrap;
  }

  function onVerifyOrAdvanceQuestion() {
    if (!activeQuestion || !activeQuestion.btn) return;

    // if already correct, advance (this case rarely used؛ عادة بنتقدم تلقائيًا)
    if (activeQuestion.verifiedOk) {
      advanceWithFocus();
      return;
    }

    const ok = activeQuestion.check();

    if (ok) {
      activeQuestion.verifiedOk = true;
      activeQuestion.btn.disabled = true;

      showToast('صح ✔', pickRandom(ENCOURAGEMENTS), 'success');

      // give student time to read encouragement, then reveal next item
      setTimeout(() => {
        advanceWithFocus();
      }, 850);

      return;
    }

    // wrong
    activeQuestion.attempts++;
    const a = activeQuestion.attempts;

    if (a <= ENGINE.MAX_ATTEMPTS) {
      markAttempt(activeQuestion.dotsWrap, a);

      if (a < ENGINE.MAX_ATTEMPTS) {
        const hint =
          activeQuestion.question.hints?.[a - 1] ||
          DEFAULT_HINTS[a - 1] ||
          FINAL_HINT;

        showToast('تلميح', hint, 'warning', 4000);
      } else {
        const hint3 = activeQuestion.question.hints?.[a - 1] || FINAL_HINT;
        showToast('تلميح قوي', hint3, 'warning', 4500);

        if (!activeQuestion.solutionShown) {
          showToast('الحل', 'تم عرض الحل النموذجي تحت', 'danger', 4500);
          showSolution(activeQuestion.container, activeQuestion.question.solution);
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
    const concept = data.concepts?.[conceptIndex];
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
    const concept = data.concepts?.[conceptIndex];
    const flow = concept ? getConceptFlow(concept) : [];

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

  // start
  render();
}
