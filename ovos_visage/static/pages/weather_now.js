// ovos-skill-weather CurrentWeather and SingleDay: big weather circle with high, low and rain chips (SPEC 8.3).
import { el } from "./widgets.js";
import { iconUrl, nowModel } from "./weather_model.js";

let view = null;

function chip() {
  const node = el("div", "circle chip");
  node.append(el("div", "big"), el("div", "small"));
  return node;
}

function build() {
  const header = el("header", "skill-header");
  header.append(el("div", "heading"), el("div", "location"));
  const circle = el("div", "circle weather-now");
  circle.append(el("img", "weather-icon"), el("div", "temp"));
  const chips = el("div", "chips");
  chips.append(chip(), chip(), chip());
  return { header, circle, chips, details: el("div", "skill-details") };
}

export function render(container, data, ctx) {
  view = build();
  container.append(view.header, view.circle, view.chips, view.details);
  update(data, ctx);
}

export function update(data, ctx) {
  const model = nowModel(ctx.page, data);
  view.header.querySelector(".heading").textContent = model.heading;
  view.header.querySelector(".location").textContent = model.location;
  const icon = view.circle.querySelector("img");
  if (icon.getAttribute("src") !== iconUrl(model.icon)) icon.src = iconUrl(model.icon);
  icon.alt = model.icon.replace("_", " ");
  view.circle.querySelector(".temp").textContent = model.big;
  [...view.chips.children].forEach((node, i) => {
    node.querySelector(".big").textContent = model.chips[i].value;
    node.querySelector(".small").textContent = model.chips[i].label;
  });
  view.details.textContent = model.details;
}
