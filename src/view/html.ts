import { passthroughTaggedLiteral } from "../util/taggedLiteral.js";


export function escapeHtml(html: string) {
  return html.replace(
      /[^0-9A-Za-z ]/g,
      c => "&#" + c.charCodeAt(0) + ";"
  );
}

export const html = passthroughTaggedLiteral
