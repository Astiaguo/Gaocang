export function isAnchored(body, note) {
  return note.start >= 0 && note.end <= body.length && body.slice(note.start, note.end) === note.quote;
}

export function annotationSegments(body, notes, start = 0, end = body.length) {
  const valid = notes.filter(note => isAnchored(body, note) && note.start < end && note.end > start);
  const edges = [...new Set([start, end, ...valid.flatMap(note => [Math.max(start, note.start), Math.min(end, note.end)])])].sort((a, b) => a - b);
  return edges.slice(0, -1).map((offset, index) => ({ start: offset, end: edges[index + 1], text: body.slice(offset, edges[index + 1]), ids: valid.filter(note => note.start <= offset && note.end >= edges[index + 1]).map(note => note.id) }));
}

export function renderAnnotated(body, notes, target) {
  const paragraphs = [];
  let start = 0;
  for (const match of body.matchAll(/\n[\t ]*\n+/gu)) {
    paragraphs.push([start, match.index]);
    start = match.index + match[0].length;
  }
  paragraphs.push([start, body.length]);
  for (const [from, to] of paragraphs) {
    if (from === to) continue;
    const heading = body.slice(from, to).match(/^#{1,6}\s+/u);
    const contentStart = from + (heading?.[0].length || 0);
    const paragraph = document.createElement(heading ? 'h2' : 'p');
    paragraph.className = paragraph.tagName === 'H2' ? 'prose-heading' : 'prose-paragraph';
    paragraph.dataset.start = String(contentStart);
    for (const part of annotationSegments(body, notes, contentStart, to)) {
      const span = document.createElement(part.ids.length ? 'mark' : 'span');
      span.dataset.start = String(part.start);
      span.dataset.end = String(part.end);
      if (part.ids.length) {
        span.dataset.annotations = JSON.stringify(part.ids);
        span.tabIndex = 0;
        span.setAttribute('role', 'button');
        span.title = '查看这段文字的批注';
      }
      span.textContent = part.text;
      paragraph.append(span);
    }
    target.append(paragraph);
  }
}

export function selectionAnchor(article, selection, body) {
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!article.contains(range.startContainer) || !article.contains(range.endContainer)) return null;
  const point = (node, offset) => {
    const element = node.nodeType === 1 ? node : node.parentElement;
    const span = element.closest('[data-start][data-end]');
    if (!span) {
      const child = node.childNodes[offset];
      const next = child?.nodeType === 1 ? (child.matches('[data-start][data-end]') ? child : child.querySelector('[data-start][data-end]')) : null;
      if (next) return Number(next.dataset.start);
      const last = node.querySelectorAll?.('[data-start][data-end]');
      return last?.length ? Number(last[last.length - 1].dataset.end) : null;
    }
    const prefix = document.createRange();
    prefix.setStart(span, 0);
    prefix.setEnd(node, offset);
    return Number(span.dataset.start) + prefix.toString().length;
  };
  const start = point(range.startContainer, range.startOffset);
  const end = point(range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return { start, end, quote: body.slice(start, end) };
}
