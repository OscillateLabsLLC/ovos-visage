// SYSTEM_Status (SPEC 8.2): OVOS's status-success / status-fail Lottie, played once and held on its last frame, in a
// chip-sized circle with the label beneath. Without the animation file: an accent ring with a check, or a dimmed ring
// with a cross (SPEC 9).
import { mount, statusAnimation } from "../lottie.js";
import { el, glow, ring } from "./widgets.js";
import { statusModel } from "./templates_model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CHECK = "M 34 52 L 46 64 L 68 38";
const CROSS = "M 38 38 L 62 62 M 62 38 L 38 62";
let view = null;

function ringGlyph(ok) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.classList.add("status-glyph");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ok ? CHECK : CROSS);
  svg.append(path);
  return [ring(1), svg];
}

function play(ok) {
  view.handle?.destroy();
  view.chip.replaceChildren();
  view.chip.className = "circle lottie-chip";
  const handle = mount(view.chip, statusAnimation(ok), { loop: false });
  handle.ready.then((playing) => {
    if (playing || handle.destroyed) return;
    view.chip.classList.add("status-ring", "gradient-fill", "bloom");
    view.chip.classList.toggle("off", !ok);
    view.chip.append(glow(), ...ringGlyph(ok));
  });
  view.handle = handle;
}

export function render(container, data) {
  view = { chip: el("div"), label: el("div", "template-label"), ok: null, handle: null };
  container.append(view.chip, view.label);
  update(data);
}

export function update(data) {
  const model = statusModel(data);
  view.label.textContent = model.label;
  if (model.ok === view.ok) return;
  view.ok = model.ok;
  play(model.ok);
}

export function destroy() {
  view?.handle?.destroy();
  view = null;
}
