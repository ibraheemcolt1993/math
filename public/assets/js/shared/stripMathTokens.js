const TOKEN_REGEX = /\[\[math:([\s\S]+?)\]\]/g;

function createMathNode(latex) {
  const span = document.createElement('span');
  span.className = 'token-math';
  span.dataset.latex = latex;
  span.textContent = `\\(${latex}\\)`;
  return span;
}

function typesetMath(nodes) {
  if (!nodes.length) return;
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
    window.MathJax.typesetClear?.(nodes);
    window.MathJax.typesetPromise(nodes);
  }
}

export function replaceMathTokensInElement(root) {
  if (!root) return;

  const nodesToProcess = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.includes('[[math:')) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.tagName === 'SCRIPT') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    nodesToProcess.push(walker.currentNode);
  }

  const mathNodes = [];

  nodesToProcess.forEach((textNode) => {
    const rawText = textNode.nodeValue;
    if (!rawText) return;
    TOKEN_REGEX.lastIndex = 0;
    let lastIndex = 0;
    let match = null;
    const fragment = document.createDocumentFragment();

    while ((match = TOKEN_REGEX.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(rawText.slice(lastIndex, match.index)));
      }

      const normalized = String(match[1] ?? '').trim();
      if (normalized) {
        const mathNode = createMathNode(normalized);
        mathNodes.push(mathNode);
        fragment.appendChild(mathNode);
      } else {
        fragment.appendChild(document.createTextNode('معادلة فارغة'));
      }

      lastIndex = TOKEN_REGEX.lastIndex;
    }

    if (lastIndex < rawText.length) {
      fragment.appendChild(document.createTextNode(rawText.slice(lastIndex)));
    }

    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  });

  typesetMath(mathNodes);
}
