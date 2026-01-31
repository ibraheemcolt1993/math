const TOKEN_REGEX = /\[\[math:([\s\S]+?)\]\]/g;

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

  nodesToProcess.forEach((textNode) => {
    const rawText = textNode.nodeValue;
    if (!rawText) return;
    const nextText = rawText.replace(TOKEN_REGEX, (_, latexRaw) => {
      const normalized = String(latexRaw ?? '').trim();
      return normalized ? `معادلة محذوفة: ${normalized}` : 'معادلة محذوفة';
    });

    if (nextText !== rawText) {
      textNode.nodeValue = nextText;
    }
  });
}
