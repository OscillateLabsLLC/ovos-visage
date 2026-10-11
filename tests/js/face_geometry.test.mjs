import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { VISAGE_FACE as g } from "../../ovos_visage/static/face/face.js";
import { MOUTH_SHAPES, REST_CODE, mouthShapes } from "../../ovos_visage/static/face/visemes.js";

const SCREEN_H = 800;
const CENTRE_X = 240;
const restHalfWidth = (Math.max(...MOUTH_SHAPES[REST_CODE].map(([x]) => x)) - Math.min(...MOUTH_SHAPES[REST_CODE].map(([x]) => x))) / 2;
const scale = g.mouthWidth / (2 * restHalfWidth);
const eyeOuter = g.eyeR + g.eyeStroke / 2;
const toScreenY = (y) => g.mouthY + (y - 50) * scale;

function mouthExtent() {
  const ys = Object.values(mouthShapes(g.openScale)).flat().map(([, y]) => toScreenY(y));
  return { top: Math.min(...ys) - g.mouthStroke / 2, bottom: Math.max(...ys) + g.mouthStroke / 2 };
}

test("the face at rest is close to round: eyes-plus-mouth box between 1:1 and 1.15:1", () => {
  const width = 2 * (g.eyeDx + eyeOuter);
  const restBottom = Math.max(...MOUTH_SHAPES[REST_CODE].map(([, y]) => toScreenY(y))) + g.mouthStroke / 2;
  const height = restBottom - (g.eyeY - eyeOuter);
  assert.ok(width / height >= 1 && width / height <= 1.15, `${width} x ${height.toFixed(0)}`);
});

test("the face stays in the upper part of the screen and every viseme fits the SVG box", () => {
  const { top, bottom } = mouthExtent();
  assert.ok(bottom < 0.7 * SCREEN_H, `mouth bottom ${bottom.toFixed(0)}`);
  assert.ok(g.eyeY - eyeOuter >= g.box.top && bottom <= g.box.top + g.box.height, `box ${g.box.top}..${g.box.top + g.box.height}, mouth ${top.toFixed(0)}..${bottom.toFixed(0)}`);
});

test("the badge disc holds the face with 15-18 px of margin and matches face.css", () => {
  const cy = g.box.top + g.box.height / 2;
  const eyeFar = Math.hypot(g.eyeDx, g.eyeY - cy) + eyeOuter;
  assert.ok(eyeFar <= g.badge.r, `eye reaches ${eyeFar.toFixed(0)} of r ${g.badge.r}`);
  assert.ok(mouthExtent().bottom - cy <= g.badge.r);
  const css = readFileSync(new URL("../../ovos_visage/static/face/face.css", import.meta.url), "utf8");
  const badgeScale = Number(/--face-badge-scale:\s*([\d.]+);/.exec(css)[1]);
  const badgeH = Number(/--face-badge-h:\s*([\d.]+)px;/.exec(css)[1]);
  assert.ok(Math.abs(2 * g.badge.r * badgeScale - badgeH) < 0.5, `${2 * g.badge.r} * ${badgeScale} vs ${badgeH}`);
  const eyeMarginPx = (g.badge.r - eyeFar) * badgeScale;
  assert.ok(eyeMarginPx >= 15 && eyeMarginPx <= 18, `eye margin ${eyeMarginPx.toFixed(1)} px`);
  const restTop = g.eyeY - eyeOuter;
  const restBottom = Math.max(...MOUTH_SHAPES[REST_CODE].map(([, y]) => toScreenY(y))) + g.mouthStroke / 2;
  assert.ok(Math.abs((restTop + restBottom) / 2 - cy) <= 5, `rest face centre ${((restTop + restBottom) / 2).toFixed(0)} vs disc ${cy}`);
  assert.equal(CENTRE_X * 2, 480);
});
