// ovos.common_play / busy: OCP searching for media (SPEC 8.6). OCP's own installing.json Lottie, as busy.qml plays it,
// in a chip-sized circle with OCP's label beneath; a ring with thinking dots when the animation is not cached.
import { mount } from "../lottie.js";
import { ringFit } from "../lottie_fit.js";
import { busyModel } from "./ocp_browse_model.js";
import { el, ring } from "./widgets.js";

export const INSTALLING = "/res/ovos.common_play/qt5/animations/installing.json";
const DOTS = 3;
let label = null;
let handle = null;

// Fallback: the ring becomes a dashed arc turning around the thinking dots (ocp.css .ocp-busy.no-lottie).
function ringWithDots(chip) {
  const dots = el("div", "ocp-dots");
  for (let i = 0; i < DOTS; i++) dots.append(el("span"));
  chip.classList.add("no-lottie");
  return [ring(1), dots];
}

function fitRing(chip) {
  const fit = handle?.animation && ringFit(handle.animation.animationData);
  const svg = chip.querySelector("svg");
  if (fit && svg) Object.assign(svg.style, fit);
}

export function render(container, data) {
  const chip = el("div", "circle ocp-busy");
  label = el("div", "ocp-busy-label");
  container.append(chip, label);
  handle = mount(chip, INSTALLING, { loop: true });
  handle.ready.then((playing) => (playing ? fitRing(chip) : chip.replaceChildren(...ringWithDots(chip))));
  update(data);
}

export function update(data) {
  label.textContent = busyModel(data).label;
}

export function destroy() {
  handle?.destroy();
  handle = null;
}
