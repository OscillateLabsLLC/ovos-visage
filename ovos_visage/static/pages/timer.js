// ovos-skill-alerts.openvoiceos / Timer: one ring per timer, stacked (SPEC 8.5, Kickstarter "1 min" frame).
// Circles are kept per alertId and only updated, so the ring's CSS transition spans the skill's 1 s updates.
import { timerModel } from "./alerts_model.js";
import { el, glow, ring, setRing } from "./widgets.js";

const FINISHED = "Time's up";
// Text scales with the ring so "1:00:00" fits a 140 px ring as well as a 300 px one.
const RING_TO_EM = 18;
let stack = null;
const circles = new Map();
const longest = new Map();

function buildCircle() {
  const circle = el("div", "circle timer-ring gradient-fill");
  const svg = ring(1);
  circle.append(glow(), svg, el("div", "timer-delta"), el("div", "timer-name"), el("div", "timer-over"));
  return { circle, svg };
}

function paint(entry, timer, size) {
  entry.circle.style.width = entry.circle.style.height = `${size}px`;
  entry.circle.style.fontSize = `${size / RING_TO_EM}px`;
  entry.circle.classList.toggle("expired", timer.expired);
  entry.circle.classList.toggle("bloom-loop", timer.expired);
  entry.circle.dataset.tone = timer.tone;
  entry.circle.querySelector(".timer-delta").textContent = timer.expired ? FINISHED : timer.delta;
  entry.circle.querySelector(".timer-name").textContent = timer.name;
  entry.circle.querySelector(".timer-over").textContent = timer.expired ? timer.delta : "";
  setRing(entry.svg, timer.fraction);
}

export function render(container, data) {
  stack = el("div", "timer-stack stagger-enter");
  circles.clear();
  container.append(stack);
  update(data);
}

export function update(data) {
  const model = timerModel(data, longest);
  const seen = new Set();
  model.timers.forEach((timer, index) => {
    if (!circles.has(timer.id)) circles.set(timer.id, buildCircle());
    const entry = circles.get(timer.id);
    // Moving a node restarts its CSS transitions, so only insert when the order actually changed.
    if (stack.children[index] !== entry.circle) stack.insertBefore(entry.circle, stack.children[index] ?? null);
    paint(entry, timer, model.size);
    seen.add(timer.id);
  });
  for (const [id, entry] of circles) {
    if (!seen.has(id)) {
      entry.circle.remove();
      circles.delete(id);
    }
  }
  stack.classList.toggle("empty", seen.size === 0);
}
