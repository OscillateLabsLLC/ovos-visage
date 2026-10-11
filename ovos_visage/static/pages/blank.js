// Built-in idle when no namespace has a page (SPEC 6, 7.1 fallback): logo badge plus the browser's clock.
import { el, ring } from "./widgets.js";

const TICK_MS = 1000;
let view = null;
let ticker = null;

function tick() {
  const now = new Date();
  view.time.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  view.date.textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

export function render(container) {
  const logo = el("div", "circle logo");
  logo.append(ring(1), el("span"));
  const clock = el("div", "circle clock");
  view = { time: el("div", "time"), date: el("div", "date") };
  clock.append(ring(1), view.time, view.date);
  container.append(logo, clock);
  clearInterval(ticker);
  ticker = setInterval(tick, TICK_MS);
  tick();
}

export function update() {}

export function destroy() {
  clearInterval(ticker);
}
