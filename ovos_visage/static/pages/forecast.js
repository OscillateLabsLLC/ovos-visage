// ovos-skill-weather DailyForecast and HourlyForecast: a vertical column of small weather circles (SPEC 8.3).
import { el } from "./widgets.js";
import { forecastModel, iconUrl } from "./weather_model.js";

let view = null;

function itemCircle(item) {
  const node = el("div", "circle forecast-item");
  const icon = el("img", "weather-icon");
  icon.src = iconUrl(item.icon);
  icon.alt = item.icon.replace("_", " ");
  const temps = el("div", "temps");
  temps.append(el("span", "main", item.main), el("span", "sub", item.sub));
  node.append(el("div", "label", item.label), icon, temps);
  return node;
}

export function render(container, data, ctx) {
  const header = el("header", "skill-header");
  header.append(el("div", "heading"), el("div", "location"));
  view = { header, column: el("div", "forecast-column") };
  container.append(view.header, view.column);
  update(data, ctx);
}

export function update(data, ctx) {
  const model = forecastModel(ctx.page, data);
  view.header.querySelector(".heading").textContent = model.heading;
  view.header.querySelector(".location").textContent = model.location;
  view.column.dataset.kind = ctx.page;
  view.column.replaceChildren(...model.items.map(itemCircle));
}
