// SYSTEM_Loading (SPEC 8.2): OVOS's own loading.json Lottie in a chip-sized circle, label beneath.
// Falls back to the thinking dots in a glowing ring chip when the animation is not in this install's cache.
import { ANIMATIONS, mount } from "../lottie.js";
import { ringFit } from "../lottie_fit.js";
import { el, glow, ring } from "./widgets.js";
import { loadingModel } from "./templates_model.js";

let label = null;
let handle = null;

function dots() {
  const row = el("div", "loading-dots");
  row.append(el("span"), el("span"), el("span"));
  return row;
}

// loading.json draws its ring in a corner of a 307x389 canvas; place the svg so that ring fills the chip's ring.
function fitRing(chip, handle) {
  const fit = handle.animation && ringFit(handle.animation.animationData);
  const svg = chip.querySelector("svg");
  if (fit && svg) Object.assign(svg.style, fit);
}

function fallback(chip) {
  chip.classList.add("gradient-fill");
  chip.replaceChildren(glow(), ring(1), dots());
}

export function render(container, data) {
  const chip = el("div", "circle lottie-chip");
  label = el("div", "template-label");
  container.append(chip, label);
  handle = mount(chip, ANIMATIONS.loading, { loop: true });
  handle.ready.then((playing) => (playing ? fitRing(chip, handle) : fallback(chip)));
  update(data);
}

export function update(data) {
  label.textContent = loadingModel(data).label;
}

export function destroy() {
  handle?.destroy();
  handle = null;
}
