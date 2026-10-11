// ovos-skill-date-time / date: a circle with weekday, day-month and year (SPEC 8.4).
import { el, glow, ring } from "./widgets.js";

const PYTHON_NONE = "None";
let view = null;

function locationLine(value) {
  return value && value !== PYTHON_NONE ? value : "";
}

export function render(container, data) {
  const circle = el("div", "circle clock date-circle");
  view = { weekday: el("div", "weekday"), daymonth: el("div", "daymonth"), year: el("div", "year") };
  circle.append(glow(), ring(1), view.weekday, view.daymonth, view.year);
  view.location = el("div", "skill-details");
  container.append(circle, view.location);
  update(data);
}

export function update(data) {
  view.weekday.textContent = data.weekday_string ?? "";
  view.daymonth.textContent = data.daymonth_string ?? data.date_string ?? "";
  view.year.textContent = data.year_string ?? "";
  view.location.textContent = locationLine(data.location_string);
}
