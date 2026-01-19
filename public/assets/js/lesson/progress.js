/* =========================================================
   progress.js — Progress Calculation & UI
   ========================================================= */

export function calcProgressPercent({ data, conceptIndex, stepIndex, stepsPerConcept }) {
  const concepts = data?.concepts || [];
  const totalConcepts = concepts.length || 1;

  const totalSteps = totalConcepts * stepsPerConcept;
  const currentStep = (conceptIndex * stepsPerConcept) + stepIndex;

  const pct = Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100)));
  return pct;
}

export function setProgressUI(percent) {
  const bar = document.getElementById('progressBar');
  const txt = document.getElementById('progressPercent');
  if (bar) bar.style.width = `${percent}%`;
  if (txt) txt.textContent = `${percent}%`;
}
