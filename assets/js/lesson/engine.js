/* =========================================================
   engine.js — Sequential Lesson Engine
   - Renders concepts & steps in strict order
   - Handles questions, attempts, hints, solutions
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

  function render() {
    mountEl.innerHTML = '';

    const concept = data.concepts[conceptIndex];
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
      <div class="concept-body"></div>
    `;

    const body = cardInner.querySelector('.concept-body');

    // render steps up to current
    for (let i = 0; i <= stepIndex; i++) {
      const stepKey = STEPS_ORDER[i];
      if (!concept[stepKey]) continue;

      if (stepKey === 'question') {
        renderQuestionStep(body, concept.question);
      } else {
        body.appendChild(renderTextStep(stepKey, concept[stepKey]));
      }
    }

    card.appendChild(cardInner);
    mountEl.appendChild(card);

    updateProgress();
    saveProgress();
  }

  function renderTextStep(type, text) {
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
    el.innerHTML = `
      <p class="step-title">${cfg.title}</p>
      <div class="step-text">${escapeHtml(text)}</div>
    `;
    return el;
  }

  function renderQuestionStep(container, question) {
    const wrap = document.createElement('div');
    wrap.className = 'question-wrap';

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

    container.appendChild(wrap);

    let attempts = 0;

    const q = renderQuestion({
      mountEl: qMount,
      question,
    });

    btnCheck.addEventListener('click', () => {
      const ok = q.check();
      if (ok) {
        showToast('صح ✔', pickRandom(ENCOURAGEMENTS), 'success');
        nextStep();
      } else {
        attempts++;
        markAttempt(attemptsWrap, attempts);

        if (attempts < ENGINE.MAX_ATTEMPTS) {
          const hint =
            question.hints?.[attempts - 1] ||
            DEFAULT_HINTS[attempts - 1] ||
            FINAL_HINT;
          showToast('تلميح', hint, 'warning', 4000);
        } else {
          showToast('الحل', 'شوف الحل النموذجي', 'danger', 5000);
          showSolution(container, question.solution);
          btnCheck.disabled = true;
        }
      }
    });
  }

  function markAttempt(wrap, count) {
    const dots = wrap.querySelectorAll('.dot');
    for (let i = 0; i < count && i < dots.length; i++) {
      dots[i].classList.add('used');
    }
  }

  function showSolution(container, solutionText) {
    const sol = document.createElement('div');
    sol.className = 'solution';
    sol.innerHTML = `
      <p class="solution-title">الحل النموذجي</p>
      <div class="solution-text">${escapeHtml(solutionText || '')}</div>
    `;
    container.appendChild(sol);
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
