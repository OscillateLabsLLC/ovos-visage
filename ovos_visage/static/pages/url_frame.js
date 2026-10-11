// SYSTEM_UrlFrame (SPEC 8.2): the page in a sandboxed iframe; when the site refuses framing, the URL as plain text.
// The middle layer reads the site's framing headers (/frameable/<namespace>); a load timeout covers what it cannot see.
import { el, glow, icon, ring } from "./widgets.js";
import { urlModel } from "./templates_model.js";

const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";
const LOAD_TIMEOUT_MS = 8000;
let view = null;
let timer = null;

function showText(reason) {
  clearTimeout(timer);
  view.frame.remove();
  view.root.classList.add("refused");
  view.reason.textContent = reason;
}

async function framingAllowed(namespace) {
  try {
    const response = await fetch(`/frameable/${encodeURIComponent(namespace)}`);
    return response.ok ? await response.json() : { frameable: null };
  } catch {
    return { frameable: null };
  }
}

async function load(model, namespace) {
  view.url.textContent = model.url;
  if (!model.frameable) return showText("not a web address");
  const verdict = await framingAllowed(namespace);
  if (verdict.frameable === false) return showText(verdict.reason);
  timer = setTimeout(() => showText("did not load"), LOAD_TIMEOUT_MS);
  view.frame.addEventListener("load", () => clearTimeout(timer), { once: true });
  view.frame.src = model.url;
}

export function render(container, data, ctx) {
  view = { root: el("section", "url-frame"), url: el("div", "url-text"), reason: el("div", "template-hint"), frame: el("iframe", "template-iframe") };
  view.frame.setAttribute("sandbox", SANDBOX);
  view.frame.setAttribute("referrerpolicy", "no-referrer");
  const chip = el("div", "circle url-chip gradient-fill");
  chip.append(glow(), ring(1), icon("globe", "url-globe"));
  view.root.append(view.frame, chip, view.url, view.reason);
  container.append(view.root);
  view.loaded = null;
  update(data, ctx);
}

export function update(data, ctx) {
  const model = urlModel(data);
  if (view.loaded === model.url) return;
  view.loaded = model.url;
  load(model, ctx.namespace);
}

export function destroy() {
  clearTimeout(timer);
}
