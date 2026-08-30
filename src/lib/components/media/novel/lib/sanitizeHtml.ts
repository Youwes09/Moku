const ALLOWED = new Set([
  "P", "BR", "HR", "EM", "I", "STRONG", "B", "U", "S",
  "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "DIV", "SPAN",
]);

function clean(node: Node, out: Node, doc: Document): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as Element;
    if (ALLOWED.has(el.tagName)) {
      const fresh = doc.createElement(el.tagName.toLowerCase());
      clean(el, fresh, doc);
      out.appendChild(fresh);
    } else {
      clean(el, out, doc);
    }
  }
}

export function sanitizeNovelHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]+>/g, "");
  const doc  = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  const frag = doc.createElement("div");
  clean(body, frag, doc);
  return frag.innerHTML;
}
