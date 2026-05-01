export const $ = (selector) => document.querySelector(selector);

export function show(selector) {
  $(selector)?.classList.remove("hidden");
}

export function hide(selector) {
  $(selector)?.classList.add("hidden");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
