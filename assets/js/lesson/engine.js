/* =========================================================
   engine.js — Sequential Lesson Engine (with "متابعة" + Scroll/Focus)
   - Renders concepts & steps in strict order
   - No skipping
   - "متابعة" after each text step, and after answering question correctly
   - Auto scroll + focus to the newly revealed step/question after "متابعة"
   - Attempts: 3 hints then show solution; after that allow retry without extra hints
   ========================================================= */

import { ENGINE } from '../core/constants.js';
import { showToast } from '../ui/toast.js';
import { ENCOURAGEMENTS, DEFAULT_HINTS, FINAL_HINT, pickRandom } from '../ui/text.js';
import { renderQuestion } from '../questions/registry.js';
import { setStudentProgress } from '../core/storage.js';
import { calcProgressPercent, setProgressUI } from './progress.js';
import { completeLesson } from './completion.js';

const STEPS_ORDER = [
  'goal',
  'explain',
  'example',
  'example2',
  'mistake',
  'note',
  'question'
];

export function initEngine({ week, studentId, data, mountEl }) {
  mountEl.innerHTML = '';

  let conceptIndex = 0;
  let stepIndex = 0;

  const stepsPerConcept = STEPS_ORDER.length;

  // Scroll/focus control
  let pendingFocus = null; // { conceptIndex, stepIndex }
  let firstPaint = true;

  function render() {
    mountEl.innerHTML = '';

    const concept = data.concepts?.[conceptIndex];
    if (!concept) {
      completeLesson({ studentId, week });
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

    // render steps up to current
    for (let i = 0; i <= stepIndex; i++) {
      const stepKey = STEPS_ORDER[i];

      // skip if missing
      if (stepKey !== 'question' && !concept[stepKey]) continue;
      if (stepKey === 'question' && !concept.question) continue;

      if (stepKey === 'question') {
        body.appendChild(renderQuestionStep(concept.question, i));
      } else {
        body.appendChild(renderTextStep(stepKey, concept[stepKey], i));
      }
    }

    // add "متابعة" button for current step (text steps)
    const currentKey = STEPS_ORDER[stepIndex];
    if (currentKey !== 'question') {
      body.appendChild(renderContinueBar({
        enabled: true,
        onClick: () => nextStepWithFocus(),
      }));
    }
    // for question: continue bar is controlled by question logic after correct

    card.appendChild(cardInner);
    mountEl.appendChild(card);

    updateProgress();
    saveProgress();

    // Auto scroll/focus to newly revealed content (after pressing متابعة)
    if (!firstPaint && pendingFocus) {
      requestAnimationFrame(() => {
        scrollAndFocusToStep(pendingFocus.conceptIndex, pendingFocus.stepIndex);
        pendingFocus = null;
      });
    }
    firstPaint = false;
  }

  function nextStepWithFocus() {
    nextStep();
    // render() will happen inside nextStep -> render(); so set pendingFocus BEFORE render
    // But nextStep currently calls render at end, so we set pendingFocus before calling nextStep
  }

  function renderContinueBar({ enabled, onClick }) {
    const wrap = document.createElement('div');
    wrap.className = 'lesson-nav';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary w-100';
    btn.textContent = 'متابعة';
    btn.disabled = !enabled;
    btn.addEventListener('click', onClick);

    wrap.appendChild(btn);
    return wrap;
  }

  function renderTextStep(type, text, idx) {
    const map = {
      goal: { title: 'الهدف', cls: '' },
      explain: { title: 'الشرح', cls: '' },
      example: { title: 'مثال محلول', cls: 'example' },
      example2: { title: 'مثال إضافي', cls: 'example' },
      mistake: { title: 'خطأ شائع', cls: 'warning' },
      note: { title: 'ملاحظة', cls: 'note' },
    };

    const cfg = map[type];
    const el = document.createElement('div');
    el.className = `step ${cfg.cls || ''}`.trim();
    el.setAttribute('data-step-index', String(idx));
    el.setAttribute('data-step-key', type);

    el.innerHTML = `
      <p class="step-title">${cfg.title}</p>
      <div class="step-text">${escapeHtml(text)}</div>
    `;
    return el;
  }

  function renderQuestionStep(question, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'question-wrap';
    wrap.setAttribute('data-step-index', String(idx));
    wrap.setAttribute('data-step-key', 'question');

    const title = document.createElement('p');
    title.className = 'question-title';
    title.textContent = question.text || 'سؤال';

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

    const btnCheck = document.createElement('button');
    btnCheck.className = 'btn btn-primary';
    btnCheck.textContent = 'تحقق';

    actions.appendChild(attemptsWrap);
    actions.appendChild(btnCheck);

    wrap.appendChild(title);
    wrap.appendChild(qMount);
    wrap.appendChild(actions);

    // continue bar (disabled until correct)
    const nav = document.createElement('div');
    nav.className = 'lesson-nav';

    const btnNext = document.createElement('button');
    btnNext.className = 'btn btn-primary w-100';
    btnNext.textContent = 'متابعة';
    btnNext.disabled = true;

    nav.appendChild(btnNext);
    wrap.appendChild(nav);

    let attempts = 0;
    let solutionShown = false;

    const q = renderQuestion({
      mountEl: qMount,
      question,
    });

    btnCheck.addEventListener('click', () => {
      const ok = q.check();

      if (ok) {
        showToast('صح ✔', pickRandom(ENCOURAGEMENTS), 'success');
        btnNext.disabled = false;
        btnCheck.disabled = true;
        return;
      }

      // wrong
      attempts++;

      if (attempts <= ENGINE.MAX_ATTEMPTS) {
        markAttempt(attemptsWrap, attempts);

        if (attempts < ENGINE.MAX_ATTEMPTS) {
          const hint =
            question.hints?.[attempts - 1] ||
            DEFAULT_HINTS[attempts - 1] ||
            FINAL_HINT;

          showToast('تلميح', hint, 'warning', 4000);
        } else {
          const hint3 = question.hints?.[attempts - 1] || FINAL_HINT;
          showToast('تلميح قوي', hint3, 'warning', 4500);

          if (!solutionShown) {
            showToast('الحل', 'تم عرض الحل النموذجي تحت', 'danger', 4500);
            showSolution(wrap, question.solution);
            solutionShown = true;
          }
        }
      } else {
        showToast('جرّب كمان', 'ارجع للحل واعمل التحقق مرة ثانية', 'info', 2500);
      }
    });

    btnNext.addEventListener('click', () => {
      // set pending focus to the NEXT step before moving
      setPendingFocusToNext();
      nextStep();
    });

    return wrap;
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
    // Calculate where we will land after nextStep()
    let nextConcept = conceptIndex;
    let nextStep = stepIndex + 1;

    if (nextStep >= STEPS_ORDER.length) {
      nextConcept = conceptIndex + 1;
      nextStep = 0;
    }

    pendingFocus = { conceptIndex: nextConcept, stepIndex: nextStep };
  }

  function nextStep() {
    stepIndex++;
    if (stepIndex >= STEPS_ORDER.length) {
      conceptIndex++;
      stepIndex = 0;
    }
    render();
  }

  function updateProgress() {
    const percent = calcProgressPercent({
      data,
      conceptIndex,
      stepIndex,
      stepsPerConcept,
    });
    setProgressUI(percent);
  }

  function saveProgress() {
    setStudentProgress(studentId, week, {
      conceptIndex,
      stepIndex,
    });
  }

  function scrollAndFocusToStep(cIdx, sIdx) {
    // We render only current concept card, so focus is within current mount
    // Try to find element by data-step-index in DOM
    const target = mountEl.querySelector(`[data-step-index="${sIdx}"]`);
    if (!target) return;

    // Make focusable temporarily
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Focus without additional scroll jump
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

  // Hook "متابعة" for text steps: set pending focus then advance
  function nextStepWithFocus() {
    setPendingFocusToNext();
    nextStep();
  }

  // start
  render();
}
