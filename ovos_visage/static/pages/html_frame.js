// SYSTEM_HtmlFrame (SPEC 8.2): the skill's HTML in a sandboxed srcdoc iframe, full width, no chrome.
// Scripts may run but the frame gets an opaque origin (no allow-same-origin), so it cannot reach the visage page.
import { el } from "./widgets.js";
import { htmlModel, htmlSrcdoc } from "./templates_model.js";

const SANDBOX = "allow-scripts";
// Readable defaults on the black page; the skill's own styles override them. No color-scheme: a scheme that differs
// from the parent page makes Chrome paint the frame an opaque grey, a nested surface SPEC 9 rules out.
const DEFAULT_STYLE = "<style>:root{color:#fff;background:transparent;font:20px system-ui,sans-serif}a{color:#1e9bff}</style>";
let frame = null;

export function render(container, data) {
  frame = el("iframe", "template-iframe");
  frame.setAttribute("sandbox", SANDBOX);
  frame.setAttribute("referrerpolicy", "no-referrer");
  container.append(frame);
  update(data);
}

export function update(data) {
  const srcdoc = DEFAULT_STYLE + htmlSrcdoc(htmlModel(data));
  if (frame.srcdoc !== srcdoc) frame.srcdoc = srcdoc;
}
