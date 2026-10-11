// ovos-skill-date-time / time: the concept's big blue clock ring (SPEC 8.4).
import { el, glow, ring } from "./widgets.js";

let view = null;

export function render(container, data) {
  const clock = el("div", "circle clock clock-ring");
  view = { clock, time: el("div", "time"), ampm: el("div", "ampm"), date: el("div", "date") };
  clock.append(glow(), ring(1), view.time, view.ampm, view.date);
  container.append(clock);
  update(data);
}

export function update(data) {
  view.time.textContent = data.time_string ?? "--:--";
  view.ampm.textContent = data.ampm_string ?? "";
  view.ampm.classList.toggle("hidden", !data.ampm_string);
  view.date.textContent = data.date_string ?? "";
}
