// SYSTEM_InputBox (SPEC 8.2), display-only: a glowing ring chip with a listening microphone, the title and
// placeholder as a prompt beneath, confirm and exit as muted hints.
// Nothing is clickable; the POC has no input (SPEC 1).
import { el, glow, icon, ring } from "./widgets.js";
import { inputBoxModel } from "./templates_model.js";

let view = null;

export function render(container, data) {
  const box = el("section", "input-box stagger-enter");
  const chip = el("div", "circle input-chip gradient-fill");
  chip.append(glow(), ring(1), icon("mic", "input-mic"));
  view = { title: el("div", "input-title"), placeholder: el("div", "input-placeholder"), hints: el("div", "template-hint") };
  box.append(chip, view.title, view.placeholder, view.hints);
  container.append(box);
  update(data);
}

export function update(data) {
  const model = inputBoxModel(data);
  view.title.textContent = model.title;
  view.placeholder.textContent = model.placeholder;
  view.hints.textContent = [model.confirm, model.exit].filter(Boolean).join("  ·  ");
}
