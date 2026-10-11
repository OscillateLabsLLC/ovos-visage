// Shared circle builders: a ring circle (clock, timer) and the weather circle.
const SVG_NS = "http://www.w3.org/2000/svg";
const RING_R = 46;
const RING_LENGTH = 2 * Math.PI * RING_R;

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function ring(fraction = 1) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.classList.add("ring");
  for (const cls of ["track", "value"]) {
    const circle = document.createElementNS(SVG_NS, "circle");
    Object.entries({ cx: 50, cy: 50, r: RING_R, class: cls }).forEach(([k, v]) => circle.setAttribute(k, v));
    svg.append(circle);
  }
  setRing(svg, fraction);
  return svg;
}

/** The breathing halo behind a hero ring (visage.css .hero-glow); set --glow on the circle to tint it. */
export function glow() {
  return el("div", "hero-glow");
}

/** A self-animating icon from static/icons/ (each SVG carries its own keyframes and reduced-motion guard). */
export function icon(name, className = "") {
  const img = el("img", `icon ${className}`.trim());
  img.src = `/static/icons/${name}.svg`;
  img.alt = "";
  return img;
}

export function setRing(svg, fraction) {
  const value = svg.querySelector(".value");
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0));
  value.style.strokeDasharray = `${RING_LENGTH}`;
  value.style.strokeDashoffset = `${RING_LENGTH * (1 - clamped)}`;
}

// ovos-skill-homescreen's weather_code switch (SPEC 8.1).
const HOMESCREEN_WEATHER_ICONS = ["sun", "partial_clouds", "clouds", "rain", "rain", "storm", "snow", "fog"];

export function weatherIcon(code) {
  const name = HOMESCREEN_WEATHER_ICONS[Number(code)] ?? "clouds";
  return `/static/icons/${name}.svg`;
}
