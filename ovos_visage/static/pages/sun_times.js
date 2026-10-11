// ovos-skill-weather SunriseSunset: a sunrise circle and a sunset circle (SPEC 8.3).
import { el } from "./widgets.js";
import { iconUrl, sunTimesModel } from "./weather_model.js";

let view = null;

function sunCircle(kind) {
  const node = el("div", `circle sun-time ${kind}`);
  const icon = el("img", "weather-icon");
  icon.src = iconUrl("sun");
  icon.alt = "";
  node.append(icon, el("div", "value"), el("div", "small", kind));
  return node;
}

export function render(container, data) {
  const header = el("header", "skill-header");
  header.append(el("div", "heading"), el("div", "location"));
  view = { header, sunrise: sunCircle("sunrise"), sunset: sunCircle("sunset") };
  container.append(view.header, view.sunrise, view.sunset);
  update(data);
}

export function update(data) {
  const model = sunTimesModel(data);
  view.header.querySelector(".heading").textContent = model.heading;
  view.header.querySelector(".location").textContent = model.location;
  view.sunrise.querySelector(".value").textContent = model.sunrise;
  view.sunset.querySelector(".value").textContent = model.sunset;
}
