// The Kickstarter concept face: two shaded ring eyes and a viseme-driven mouth. Used by SYSTEM_Face and the attention overlay.
import { MOUTH_SHAPES, REST_CODE, lerpPoints, mouthShapes, toPath, visemeAt } from "./visemes.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const EASE_MS = 45;
const BLINK_MIN_MS = 3000;
const BLINK_MAX_MS = 7000;
const BLINK_MS = 150;
const WIDEN_MS = 600;
const LISTEN_BARS = 7;
export const MODES = ["rest", "listening", "thinking", "speaking"];
const MOUTH_LOCAL = { cx: 100, cy: 50 };
const FRAME_W = 480;

// The visage face, screen px on the 480x800 frame. Eyes, strokes and the rest smile are the 2018 Kickstarter face as
// measured (SPEC 9); spacing and the open mouth deviate on purpose: eyes 260 apart instead of 316
// and the mouth 45 lower, so the face reads round rather than a wide oval, and the open visemes are hollow outlines
// at full size instead of filled shapes at 0.67. Each eye is a grey ring with a white round-capped arc over its top
// half. box is the part of the screen the face SVG covers, centred on the rest face (y 119..492) so the compact badge
// disc (radius badge.r around the box centre) holds the face visually centred with ~16 px of margin at 104 px.
export const VISAGE_FACE = {
  eyeDx: 130, eyeY: 190, eyeR: 57, eyeStroke: 28,
  eyeTop: "#f5f5f5", eyeBottom: "#6d6d6d",
  mouthY: 480, mouthWidth: 178, mouthStroke: 24, openScale: 1,
  box: { top: 75, height: 470 },
  badge: { r: 363 },
};

function restWidth() {
  const xs = MOUTH_SHAPES[REST_CODE].map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs);
}

function svg(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  parent?.append(node);
  return node;
}

function addBadge(g, root) {
  const { top, height } = g.box;
  svg("circle", { class: "badge-disc", cx: FRAME_W / 2, cy: top + height / 2, r: g.badge.r }, root);
}

function addEye(g, root, cx) {
  const eye = svg("g", { class: "eye", "stroke-width": g.eyeStroke, fill: "none" }, root);
  svg("circle", { cx, cy: g.eyeY, r: g.eyeR, stroke: g.eyeBottom }, eye);
  const [left, right] = [cx - g.eyeR, cx + g.eyeR];
  const top = `M ${left} ${g.eyeY} A ${g.eyeR} ${g.eyeR} 0 0 1 ${right} ${g.eyeY}`;
  svg("path", { d: top, stroke: g.eyeTop, "stroke-linecap": "round" }, eye);
}

function mouthTransform(g, scale) {
  const x = FRAME_W / 2 - MOUTH_LOCAL.cx * scale;
  return `translate(${x} ${g.mouthY - MOUTH_LOCAL.cy * scale}) scale(${scale})`;
}

function buildSvg(g) {
  const { top, height } = g.box;
  const root = svg("svg", { viewBox: `0 ${top} ${FRAME_W} ${height}`, class: "face", "data-mode": "rest" });
  root.style.setProperty("--face-top", `${top}px`);
  root.style.setProperty("--face-h", `${height}px`);
  addBadge(g, root);
  for (const sign of [-1, 1]) addEye(g, root, FRAME_W / 2 + sign * g.eyeDx);
  const scale = g.mouthWidth / restWidth();
  root.style.setProperty("--lip-stroke", `${g.mouthStroke / scale}`);
  const mouth = svg("g", { class: "mouth", transform: mouthTransform(g, scale) }, root);
  const lips = svg("path", { class: "lips" }, mouth);
  const bars = svg("g", { class: "bars" }, mouth);
  for (let i = 0; i < LISTEN_BARS; i++) svg("rect", { x: 61 + i * 12, y: 38, width: 6, height: 24, rx: 3 }, bars);
  return { root, lips };
}

export class Face {
  constructor(container, geometry = VISAGE_FACE) {
    const { root, lips } = buildSvg(geometry);
    this.root = root;
    this.lips = lips;
    this.shapes = mouthShapes(geometry.openScale);
    this.points = this.shapes[REST_CODE];
    this.mode = "rest";
    this.visemes = null;
    this.anchorMs = 0;
    this.lastFrameMs = performance.now();
    container.append(root);
    this.frame = requestAnimationFrame((now) => this.tick(now));
    this.scheduleBlink();
  }

  setMode(mode) {
    this.mode = MODES.includes(mode) ? mode : "rest";
    this.root.dataset.mode = this.mode;
    if (this.mode !== "speaking") this.visemes = null;
  }

  setSleeping(sleeping) {
    this.root.classList.toggle("sleeping", Boolean(sleeping));
  }

  // Visemes are timed from speech start on the producing machine. Visage assumes that machine is this one and that
  // the list arrives at speech start (measured: start and arrival differ by ~3 ms), so it anchors on arrival.
  playVisemes(visemes, anchorMs = performance.now()) {
    this.visemes = Array.isArray(visemes) ? visemes : null;
    this.anchorMs = anchorMs;
  }

  widen() {
    this.flash("wide", WIDEN_MS);
  }

  flash(cls, ms) {
    this.root.classList.add(cls);
    setTimeout(() => this.root.classList.remove(cls), ms);
  }

  scheduleBlink() {
    const delay = BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
    this.blinkTimer = setTimeout(() => {
      this.flash("blink", BLINK_MS);
      this.scheduleBlink();
    }, delay);
  }

  targetCode(now) {
    if (this.mode !== "speaking" || !this.visemes) return REST_CODE;
    return visemeAt(this.visemes, (now - this.anchorMs) / 1000) ?? REST_CODE;
  }

  tick(now) {
    const k = 1 - Math.exp(-(now - this.lastFrameMs) / EASE_MS);
    this.lastFrameMs = now;
    this.code = this.targetCode(now);
    this.points = lerpPoints(this.points, this.shapes[this.code], k);
    this.lips.setAttribute("d", toPath(this.points));
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.blinkTimer);
    this.root.remove();
  }
}
