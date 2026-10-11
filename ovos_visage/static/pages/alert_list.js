// ovos-skill-alerts.openvoiceos / ListView (SPEC 8.5): a hero chip (ticking reminder icon in a glowing gradient
// circle, item count inside) with the header beneath it, then the {main, secondary} items as plain stacked rows.
import { listModel } from "./alerts_model.js";
import { el, glow, icon, ring } from "./widgets.js";

let page = null;

function item({ main, secondary }) {
  const entry = el("li", "list-item");
  entry.append(el("div", "list-main", main));
  if (secondary) entry.append(el("div", "list-secondary", secondary));
  return entry;
}

function hero(count) {
  const circle = el("div", "circle list-hero gradient-fill");
  circle.append(glow(), ring(1), icon("reminder", "list-icon"), el("div", "list-count", String(count)));
  return circle;
}

export function render(container, data) {
  page = el("section", "alert-list stagger-enter");
  container.append(page);
  update(data);
}

export function update(data) {
  const model = listModel(data);
  const list = el("ul", "alert-items stagger-enter");
  list.append(...model.items.map(item));
  page.replaceChildren(hero(model.items.length), el("div", "alerts-header", model.header), list);
}
