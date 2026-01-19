/* =========================================================
   registry.js — Question Type Registry
   - renderQuestion({ mountEl, question }) => { check() }
   ========================================================= */

import { renderInputQuestion } from './input.js';
import { renderMcqQuestion } from './mcq.js';
import { renderMatchQuestion } from './match.js';

const REGISTRY = {
  input: renderInputQuestion,
  mcq: renderMcqQuestion,
  match: renderMatchQuestion, // structure only for now
};

export function renderQuestion({ mountEl, question }) {
  if (!question || !question.type) {
    throw new Error('سؤال غير صالح: type مفقود');
  }

  const renderer = REGISTRY[question.type];
  if (!renderer) {
    throw new Error(`نوع سؤال غير مدعوم: ${question.type}`);
  }

  return renderer({ mountEl, question });
}

export function registerQuestionType(type, renderer) {
  REGISTRY[type] = renderer;
}
