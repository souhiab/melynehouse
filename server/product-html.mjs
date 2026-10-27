import sanitizeHtml from "sanitize-html";

// Product copy is authored by the owner, but it is still untrusted HTML when
// rendered in a customer browser. Keep the editor's useful formatting only.
export function sanitizeProductHtml(value) {
  if (!value) return null;
  const clean = sanitizeHtml(value, {
    allowedTags: ["p", "h2", "h3", "strong", "em", "ul", "ol", "li", "blockquote", "a", "br"],
    allowedAttributes: {
      a: ["href"],
      p: ["style"], h2: ["style"], h3: ["style"],
    },
    allowedStyles: {
      p: { "text-align": [/^(left|center|right|justify)$/] },
      h2: { "text-align": [/^(left|center|right|justify)$/] },
      h3: { "text-align": [/^(left|center|right|justify)$/] },
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
  }).trim();
  return clean || null;
}
