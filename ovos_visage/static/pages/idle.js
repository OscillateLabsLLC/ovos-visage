// ovos-skill-homescreen.openvoiceos / idle: weather circle, clock circle, widget chips, notification badge (SPEC 8.1).
import { el, ring, weatherIcon } from "./widgets.js";

const TIMER_EVENT = "ovos.timer.widget.manager.update";
const ALARM_EVENT = "ovos.alarm.widget.manager.update";
const MEDIA_EVENT = "ovos.media.widget.manager.update";
let view = null;

function build() {
  const weather = el("div", "circle weather");
  weather.append(el("img"), el("div", "temp"));
  const clock = el("div", "circle clock");
  clock.append(ring(1), el("div", "time"), el("div", "date"));
  const chips = el("div", "chips");
  const timer = countChip();
  const alarm = countChip();
  const media = el("div", "circle chip");
  media.append(el("div", "big", "♪"), el("div", "small title"), el("div", "small artist"));
  chips.append(timer, alarm, media);
  return { weather, clock, chips, timer, alarm, media, badge: el("div", "badge") };
}

function countChip() {
  const chip = el("div", "circle chip");
  chip.append(ring(1), el("div", "big"), el("div", "small"));
  return chip;
}

function dateLine(data) {
  const day = data.day_string ?? "";
  const month = data.month_string ?? "";
  const dayMonth = data.dateFormat === "MDY" ? `${month} ${day}` : `${day} ${month}`;
  return [data.weekday_string, dayMonth.trim()].filter(Boolean).join(", ") || (data.date_string ?? "");
}

function notificationCount(data) {
  const model = data.notification_model;
  const stored = Array.isArray(model) ? model.length : Number(model?.count ?? 0);
  return Math.max(Number(data.notifcation_counter ?? 0), stored);
}

function showCount(chip, widget, noun) {
  const count = Number(widget?.count ?? 0);
  chip.classList.toggle("hidden", count <= 0);
  chip.querySelector(".big").textContent = String(count);
  chip.querySelector(".small").textContent = count === 1 ? noun : `${noun}s`;
}

function showMedia(chip, event) {
  const playing = event?.state === "playing";
  chip.classList.toggle("hidden", !playing);
  chip.querySelector(".title").textContent = event?.widget?.title ?? "";
  chip.querySelector(".artist").textContent = event?.widget?.artist ?? "";
}

export function render(container, data, ctx) {
  view = build();
  container.append(view.badge, view.weather, view.clock, view.chips);
  update(data, ctx);
}

export function update(data, ctx) {
  const hasWeather = Boolean(data.weather_api_enabled) && data.weather_temp !== undefined && data.weather_temp !== null;
  view.weather.classList.toggle("hidden", !hasWeather);
  if (hasWeather) {
    view.weather.querySelector("img").src = weatherIcon(data.weather_code);
    view.weather.querySelector(".temp").textContent = `${Math.round(Number(data.weather_temp))}°`;
  }
  view.clock.querySelector(".time").textContent = data.time_string ?? "--:--";
  view.clock.querySelector(".date").textContent = dateLine(data);
  const count = notificationCount(data);
  view.badge.classList.toggle("hidden", count <= 0);
  view.badge.textContent = String(count);
  showCount(view.timer, ctx.events[TIMER_EVENT], "timer");
  showCount(view.alarm, ctx.events[ALARM_EVENT], "alarm");
  showMedia(view.media, ctx.events[MEDIA_EVENT]);
}
