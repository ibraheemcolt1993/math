const mathxState = {
  targetInput: null,
  targetTokenRange: null,
  previewTimeout: null,
  renderTimeout: null
};

const mathxElements = {
  modal: document.getElementById('mathxEditor'),
  field: document.getElementById('mathxField'),
  previewBox: document.getElementById('mathxPreviewBox'),
  previewError: document.getElementById('mathxPreviewError'),
  arabicToggle: document.getElementById('mathxArabicToggle'),
  btnClose: document.getElementById('btnCloseMathxEditor'),
  btnCancel: document.getElementById('btnMathxCancel'),
  btnInsert: document.getElementById('btnMathxInsert'),
  btnCopy: document.getElementById('btnMathxCopy'),
  previewRoot: document.getElementById('lessonContent')
};

function configureMathField() {
  if (!mathxElements.field) return;
  if (typeof mathxElements.field.setOptions === 'function') {
    mathxElements.field.setOptions({
      virtualKeyboardMode: 'manual',
      smartFence: true,
      smartSuperscript: true
    });
  } else {
    mathxElements.field.setAttribute('inputmode', 'text');
  }
}

function getLatexValue() {
  if (!mathxElements.field) return '';
  if (typeof mathxElements.field.getValue === 'function') {
    try {
      return mathxElements.field.getValue('latex-expanded');
    } catch {
      return mathxElements.field.getValue();
    }
  }
  return mathxElements.field.value || mathxElements.field.textContent || '';
}

function setLatexValue(value) {
  if (!mathxElements.field) return;
  if (typeof mathxElements.field.setValue === 'function') {
    mathxElements.field.setValue(value);
    return;
  }
  if ('value' in mathxElements.field) {
    mathxElements.field.value = value;
  } else {
    mathxElements.field.textContent = value;
  }
}

function executeMathCommand(command, value) {
  if (!mathxElements.field) return;
  if (typeof mathxElements.field.executeCommand === 'function') {
    mathxElements.field.executeCommand(command, value);
    return;
  }
  const current = getLatexValue();
  if (command === 'insert') {
    setLatexValue(`${current}${value ?? ''}`);
    return;
  }
  if (command === 'deleteBackward') {
    setLatexValue(current.slice(0, -1));
    return;
  }
  if (command === 'deleteAll') {
    setLatexValue('');
  }
}

function findMathTokenAtCursor(text, selectionStart, selectionEnd) {
  const regex = /\[\[math:([\s\S]+?)\]\]/g;
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = regex.lastIndex;
    const intersects =
      (selectionStart >= start && selectionStart <= end) ||
      (selectionEnd >= start && selectionEnd <= end) ||
      (selectionStart <= start && selectionEnd >= end);
    if (intersects) {
      return { start, end, latex: match[1] };
    }
  }
  return null;
}

function openMathxEditor(targetInput) {
  if (!mathxElements.modal) return;
  mathxState.targetInput = targetInput || null;
  mathxState.targetTokenRange = null;
  if (mathxState.targetInput && 'value' in mathxState.targetInput) {
    const text = mathxState.targetInput.value || '';
    const selectionStart = mathxState.targetInput.selectionStart ?? text.length;
    const selectionEnd = mathxState.targetInput.selectionEnd ?? text.length;
    const token = findMathTokenAtCursor(text, selectionStart, selectionEnd);
    if (token) {
      mathxState.targetTokenRange = { start: token.start, end: token.end };
      setLatexValue(token.latex);
    } else {
      setLatexValue('');
    }
  } else {
    setLatexValue('');
  }
  mathxElements.modal.classList.remove('hidden');
  mathxElements.modal.setAttribute('aria-hidden', 'false');
  mathxElements.field?.focus?.();
  schedulePreviewRender();
}

function closeMathxEditor() {
  if (!mathxElements.modal) return;
  mathxElements.modal.classList.add('hidden');
  mathxElements.modal.setAttribute('aria-hidden', 'true');
  mathxState.targetInput = null;
  mathxState.targetTokenRange = null;
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

function replaceTokenRange(textarea, range, token) {
  if (!textarea || !range) return;
  const text = textarea.value || '';
  const before = text.slice(0, range.start);
  const after = text.slice(range.end);
  textarea.value = `${before}${token}${after}`;
  const nextPos = range.start + token.length;
  textarea.setSelectionRange(nextPos, nextPos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleInsert() {
  const latex = getLatexValue().trim();
  if (!latex) {
    return;
  }
  const token = `[[math:${latex}]]`;
  if (mathxState.targetInput && 'value' in mathxState.targetInput) {
    if (mathxState.targetTokenRange) {
      replaceTokenRange(mathxState.targetInput, mathxState.targetTokenRange, token);
    } else {
      insertTokenAtCursor(mathxState.targetInput, token);
    }
  }
  closeMathxEditor();
}

function handleCopy() {
  const latex = getLatexValue().trim();
  if (!latex) return;
  navigator.clipboard?.writeText(latex).catch(() => undefined);
}

function isMathJaxReady() {
  return Boolean(window.MathJax && MathJax.Hub && typeof MathJax.Hub.Queue === 'function');
}

function supportsArabicExtension() {
  return Boolean(isMathJaxReady() && !MathJax.__stub);
}

function shouldArabicRender() {
  return Boolean(mathxElements.arabicToggle?.checked);
}

function wrapLatexForArabic(latex) {
  const trimmed = (latex || '').trim();
  if (!trimmed) return '';
  if (!supportsArabicExtension()) {
    return trimmed;
  }
  return shouldArabicRender() ? `\\alwaysar{${trimmed}}` : `\\ar{${trimmed}}`;
}

function renderPreview(latex) {
  if (!mathxElements.previewBox) return;
  const target = latex || '';
  const wrappedLatex = wrapLatexForArabic(target);
  const hasMathJax = isMathJaxReady();
  const hasKatex = window.katex && typeof window.katex.render === 'function';

  mathxElements.previewBox.textContent = '';

  if (!hasMathJax && !hasKatex) {
    mathxElements.previewBox.textContent = target;
    if (mathxElements.previewError) {
      mathxElements.previewError.hidden = false;
      mathxElements.previewError.textContent = 'تعذر تحميل مكتبة المعاينة.';
    }
    return;
  }

  if (mathxElements.previewError) {
    mathxElements.previewError.hidden = true;
    mathxElements.previewError.textContent = '';
  }

  if (hasMathJax) {
    const script = document.createElement('script');
    script.type = 'math/tex; mode=display';
    script.textContent = wrappedLatex || target || '\\; ';
    mathxElements.previewBox.appendChild(script);
    MathJax.Hub.Queue(['Typeset', MathJax.Hub, mathxElements.previewBox]);
    return;
  }

  try {
    window.katex.render(target || '\\; ', mathxElements.previewBox, {
      throwOnError: true,
      displayMode: true
    });
  } catch (error) {
    mathxElements.previewBox.textContent = target;
    if (mathxElements.previewError) {
      mathxElements.previewError.hidden = false;
      mathxElements.previewError.textContent = 'هناك خطأ في الصيغة.';
    }
  }
}

function schedulePreviewRender() {
  clearTimeout(mathxState.previewTimeout);
  mathxState.previewTimeout = setTimeout(() => {
    renderPreview(getLatexValue());
  }, 100);
}

function replaceMathTokens(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    if (node.parentElement?.closest?.('.mathx-inline')) {
      node = walker.nextNode();
      continue;
    }
    if (node.nodeValue && node.nodeValue.includes('[[math:')) {
      nodes.push(node);
    }
    node = walker.nextNode();
  }

  nodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    const regex = /\[\[math:([\s\S]+?)\]\]/g;
    let match;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const span = document.createElement('span');
      span.className = 'mathx-inline';
      span.dataset.latex = match[1];
      fragment.appendChild(span);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  });
}

function renderMathTokens(root) {
  replaceMathTokens(root);
  const mathNodes = root?.querySelectorAll?.('.mathx-inline') || [];
  const hasMathJax = isMathJaxReady();
  const hasKatex = window.katex && typeof window.katex.render === 'function';
  mathNodes.forEach((node) => {
    if (node.dataset.mathxRendered === 'true') return;
    const latex = node.dataset.latex || '';
    if (!hasMathJax && !hasKatex) {
      node.textContent = latex;
      node.classList.add('mathx-inline-fallback');
      node.dataset.mathxRendered = 'true';
      return;
    }

    if (hasMathJax) {
      if (!node.querySelector('script[type^="math/tex"]')) {
        node.textContent = '';
        const script = document.createElement('script');
        script.type = 'math/tex';
        script.textContent = wrapLatexForArabic(latex) || latex || '\\; ';
        node.appendChild(script);
      }
      node.dataset.mathxRendered = 'true';
      return;
    }

    try {
      window.katex.render(latex || '\\; ', node, { throwOnError: true, displayMode: false });
      node.classList.remove('mathx-inline-fallback');
      node.dataset.mathxRendered = 'true';
    } catch {
      node.textContent = latex;
      node.classList.add('mathx-inline-fallback');
      node.dataset.mathxRendered = 'true';
    }
  });
  if (hasMathJax && mathNodes.length) {
    MathJax.Hub.Queue(['Typeset', MathJax.Hub, root]);
  }
}

function schedulePreviewTokenRender() {
  clearTimeout(mathxState.renderTimeout);
  mathxState.renderTimeout = setTimeout(() => {
    renderMathTokens(mathxElements.previewRoot);
  }, 120);
}

function bindMathxEvents() {
  if (!mathxElements.modal) return;
  mathxElements.modal.addEventListener('click', (event) => {
    const closeTarget = event.target.closest('[data-mathx-close="true"]');
    if (closeTarget) {
      closeMathxEditor();
      return;
    }

    const tool = event.target.closest('[data-mathx-insert]');
    if (tool) {
      executeMathCommand('insert', tool.dataset.mathxInsert);
      schedulePreviewRender();
      return;
    }

    const command = event.target.closest('[data-mathx-command]');
    if (command) {
      const type = command.dataset.mathxCommand;
      if (type === 'backspace') {
        executeMathCommand('deleteBackward');
      } else if (type === 'clear') {
        executeMathCommand('deleteAll');
      }
      schedulePreviewRender();
    }
  });

  mathxElements.field?.addEventListener('input', schedulePreviewRender);
  mathxElements.btnClose?.addEventListener('click', closeMathxEditor);
  mathxElements.btnCancel?.addEventListener('click', closeMathxEditor);
  mathxElements.btnInsert?.addEventListener('click', handleInsert);
  mathxElements.btnCopy?.addEventListener('click', handleCopy);
  mathxElements.arabicToggle?.addEventListener('change', () => {
    schedulePreviewRender();
    schedulePreviewTokenRender();
  });

  document.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-action="open-mathx"]');
    if (!openBtn) return;
    const targetId = openBtn.dataset.targetId;
    const targetInput = targetId ? document.getElementById(targetId) : null;
    openMathxEditor(targetInput);
  });
}

function observePreview() {
  if (!mathxElements.previewRoot) return;
  const observer = new MutationObserver(() => {
    schedulePreviewTokenRender();
  });
  observer.observe(mathxElements.previewRoot, { childList: true, subtree: true });
  schedulePreviewTokenRender();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    configureMathField();
    bindMathxEvents();
    observePreview();
  });
} else {
  configureMathField();
  bindMathxEvents();
  observePreview();
}
