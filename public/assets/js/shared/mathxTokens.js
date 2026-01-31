const TOKEN_REGEX = /\[\[math:([\s\S]+?)\]\]/g;

function isMathJaxReady() {
  return Boolean(window.MathJax?.Hub && typeof window.MathJax.Hub.Queue === 'function');
}

function isArabicExtReady() {
  return Boolean(
    window.MathJax?.Extension?.Arabic &&
      (window.MathJax.Extension.Arabic.version || window.MathJax.Extension.Arabic)
  );
}

function wrapLatexForArabic(latexRaw, arabicMode) {
  if (!arabicMode || !isArabicExtReady()) return latexRaw;
  return `\\ar{${latexRaw}}`;
}

export function renderMathTokensInElement(root, { arabicMode = document.documentElement.lang === 'ar' } = {}) {
  if (!root) return;

  const mathReady = isMathJaxReady();
  const wrapArabic = arabicMode && isArabicExtReady();
  const nodesToProcess = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.includes('[[math:')) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.tagName === 'SCRIPT') return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-mathx-rendered="1"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    nodesToProcess.push(walker.currentNode);
  }

  let didUpdate = false;

  nodesToProcess.forEach((textNode) => {
    const rawText = textNode.nodeValue;
    if (!rawText) return;
    let match = null;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let nodeUpdated = false;
    TOKEN_REGEX.lastIndex = 0;

    while ((match = TOKEN_REGEX.exec(rawText)) !== null) {
      const before = rawText.slice(lastIndex, match.index);
      if (before) fragment.append(document.createTextNode(before));

      const latexRaw = match[1];
      const span = document.createElement('span');
      span.className = 'mathx-inline';
      span.dataset.mathxRendered = '1';

      if (!mathReady) {
        span.textContent = latexRaw;
      } else {
        const script = document.createElement('script');
        script.type = 'math/tex';
        script.textContent = wrapArabic ? wrapLatexForArabic(latexRaw, true) : latexRaw;
        span.append(script);
      }

      fragment.append(span);
      lastIndex = match.index + match[0].length;
      didUpdate = true;
      nodeUpdated = true;
    }

    const after = rawText.slice(lastIndex);
    if (after) fragment.append(document.createTextNode(after));

    if (nodeUpdated) {
      textNode.replaceWith(fragment);
    }
  });

  if (didUpdate && mathReady) {
    try {
      window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, root]);
    } catch (error) {
      console.warn('MathJax typeset failed', error);
    }
  }
}
