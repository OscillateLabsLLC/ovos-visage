// ovos-skill-alerts.openvoiceos / AlarmsOverviewCard (SPEC 8.5): gradient ring chips with a swinging bell for one or
// two alarms; beyond that a two-by-two grid of gradient circles, "+n more" past four. A ringing (expired) alarm is
// the loudest thing on screen: shaking bell, red bloom on a loop. Otherwise only the next to fire glows.
import { alarmGrid, alarmsModel, nextToFire } from "./alerts_model.js";
import { el, glow, icon, ring } from "./widgets.js";

const MAX_CHIPS = 2;
const RINGING = "Ringing";
let page = null;

function timeText(alarm) {
  const time = el("div", "alarm-time", alarm.time);
  if (alarm.ampm) time.append(el("span", "alarm-ampm", alarm.ampm));
  return time;
}

function circle(kind, alarm, isNext) {
  const node = el("div", `circle ${kind} gradient-fill${alarm.expired ? " alarm-ringing bloom-loop" : ""}`);
  if (alarm.expired || isNext) node.append(glow());
  return node;
}

function chip(alarm, isNext) {
  const node = circle("alarm-chip", alarm, isNext);
  const repeat = alarm.expired ? el("div", "alarm-repeat alarm-label", RINGING) : el("div", "alarm-repeat", alarm.repeat);
  node.append(ring(1), icon("bell", "alarm-bell"), timeText(alarm), el("div", "alarm-name", alarm.name), repeat);
  return node;
}

function cell(alarm, isNext) {
  const node = circle("alarm-cell", alarm, isNext);
  node.append(icon("bell", "alarm-bell"), timeText(alarm), el("div", "alarm-name", alarm.name));
  if (alarm.expired) node.append(el("div", "alarm-label", RINGING));
  return node;
}

function grid(alarms) {
  const { shown, more, next } = alarmGrid(alarms);
  const cells = el("div", "alarm-grid stagger-enter");
  cells.append(...shown.map((alarm) => cell(alarm, alarm.id === next)));
  if (more) cells.append(el("div", "circle alarm-cell alarm-more gradient-fill", `+${more} more`));
  return cells;
}

export function render(container, data) {
  page = el("section", "alarm-page stagger-enter");
  container.append(page);
  update(data);
}

export function update(data) {
  const alarms = alarmsModel(data);
  page.classList.toggle("two", alarms.length === MAX_CHIPS);
  let body = [el("div", "alarm-none", "No alarms")];
  if (alarms.length > MAX_CHIPS) body = [grid(alarms)];
  else if (alarms.length) body = alarms.map((alarm) => chip(alarm, alarm.id === nextToFire(alarms)));
  page.replaceChildren(el("div", "alerts-header", "Alarms"), ...body);
}
