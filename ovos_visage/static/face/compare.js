// Comparison sheet on 480x800 screens: by default the Kickstarter reference frame, our face at rest and on viseme 0.
// The reference image is not in the repo; pass its data URL to window.setReference() (320x400 crop, screen at x 40..280).
// ?codes=0,1,2 instead shows the face at rest followed by each listed viseme code held open.
import { Face } from "./face.js";

const HOLD_SECONDS = 1e6;
const PANEL_W = 480;
const GAP = 24;
const SHEET_H = 800 + 50 + 32;

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function panel(label, frame) {
  const node = el("section", "panel");
  node.append(frame, el("div", "label", label));
  return node;
}

function faceFrame(apply) {
  const frame = el("div", "frame");
  const holder = el("div", "face-page");
  frame.append(holder);
  const face = new Face(holder);
  clearTimeout(face.blinkTimer);
  apply(face);
  return frame;
}

function holdViseme(code) {
  return (face) => {
    face.setMode("speaking");
    face.playVisemes([[String(code), HOLD_SECONDS]]);
  };
}

const reference = el("div", "frame reference");
const sheet = document.getElementById("sheet");
const codes = new URLSearchParams(location.search).get("codes");
const first = codes ? [] : [panel("Kickstarter reference", reference)];
const visemes = codes ? codes.split(",").filter(Boolean) : ["0"];
sheet.append(...first, panel("visage: rest", faceFrame(() => {})), ...visemes.map((code) => panel(`visage: viseme ${code}`, faceFrame(holdViseme(code)))));

function fit() {
  const width = sheet.children.length * (PANEL_W + GAP) - GAP + 32;
  sheet.style.transform = `scale(${Math.min(1, innerWidth / width, innerHeight / SHEET_H)})`;
}

window.setReference = (url) => {
  reference.style.backgroundImage = `url("${url}")`;
};
window.addEventListener("resize", fit);
fit();
