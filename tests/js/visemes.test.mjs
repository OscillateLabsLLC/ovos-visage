import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MOUTH_SHAPES, REST_CODE, lerpPoints, shapePoints, toPath, visemeAt } from "../../ovos_visage/static/face/visemes.js";

const fixture = new URL("../fixtures/corebus/visemes_what_time_is_it.jsonl", import.meta.url);
const recorded = readFileSync(fixture, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .find((msg) => msg.type === "enclosure.mouth.viseme_list").data.visemes;

test("pairs are code plus cumulative end time", () => {
  const visemes = [["4", 0.35], ["0", 0.375], ["3", 0.4]];
  assert.equal(visemeAt(visemes, 0), 4);
  assert.equal(visemeAt(visemes, 0.349), 4);
  assert.equal(visemeAt(visemes, 0.35), 0);
  assert.equal(visemeAt(visemes, 0.39), 3);
  assert.equal(visemeAt(visemes, 0.4), null);
  assert.equal(visemeAt(visemes, -0.1), null);
  assert.equal(visemeAt([], 0), null);
});

test("recorded 'what time is it' list plays through and ends", () => {
  assert.equal(recorded.length, 27);
  const ends = recorded.map(([, end]) => end);
  assert.deepEqual(ends, [...ends].sort((a, b) => a - b));
  assert.equal(visemeAt(recorded, 0.1), 4);
  assert.equal(visemeAt(recorded, 0.36), 0);
  const last = ends.at(-1);
  assert.equal(visemeAt(recorded, last - 0.001), Number(recorded.at(-1)[0]));
  assert.equal(visemeAt(recorded, last), null);
  const seen = new Set();
  for (let t = 0; t < last; t += 0.01) seen.add(visemeAt(recorded, t));
  assert.ok(seen.size >= 3, `expected several distinct shapes, saw ${[...seen]}`);
});

test("all seven shapes have identical point counts and differ", () => {
  const counts = Object.values(MOUTH_SHAPES).map((points) => points.length);
  assert.equal(counts.length, 7);
  assert.equal(new Set(counts).size, 1);
  const paths = new Set(Object.values(MOUTH_SHAPES).map(toPath));
  assert.equal(paths.size, 7);
});

test("closed rest shape has no opening; open shapes do", () => {
  const height = (points) => Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));
  const UPPER_CENTRE = 4;
  const LOWER_CENTRE = 12;
  const centreGap = (code) => {
    const points = shapePoints(code);
    assert.ok(Math.abs(points[UPPER_CENTRE][0] - points[LOWER_CENTRE][0]) < 1e-9);
    return points[LOWER_CENTRE][1] - points[UPPER_CENTRE][1];
  };
  assert.equal(centreGap(REST_CODE), 0);
  assert.ok(centreGap(0) > centreGap(3) && centreGap(3) > centreGap(5) && centreGap(5) > 0);
  assert.ok(height(shapePoints(0)) > height(shapePoints(6)));
  assert.equal(shapePoints(99).length, shapePoints(REST_CODE).length);
});

test("tweening hits both endpoints and stays point-aligned", () => {
  const a = MOUTH_SHAPES[0];
  const b = MOUTH_SHAPES[4];
  assert.deepEqual(lerpPoints(a, b, 0), a);
  assert.deepEqual(lerpPoints(a, b, 1), b);
  assert.equal(lerpPoints(a, b, 0.5).length, a.length);
  assert.match(toPath(lerpPoints(a, b, 0.5)), /^M [\d.]+ [\d.]+( C [\d. -]+)+ Z$/);
});

test("openScale shrinks the open shapes and leaves the rest smile alone", async () => {
  const { mouthShapes } = await import("../../ovos_visage/static/face/visemes.js");
  const width = (points) => Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
  const scaled = mouthShapes(0.67);
  assert.deepEqual(scaled[REST_CODE], MOUTH_SHAPES[REST_CODE]);
  assert.ok(Math.abs(width(scaled[0]) / width(MOUTH_SHAPES[0]) - 0.67) < 1e-9);
  assert.ok(width(scaled[0]) < width(scaled[REST_CODE]));
});

test("every open shape leaves a hole inside the hollow outline's stroke", () => {
  const STROKE_UNITS = 24 / (178 / 112);
  for (const code of [0, 1, 2, 3, 5, 6]) {
    const points = shapePoints(code);
    const gap = points[12][1] - points[4][1];
    const halfWidth = (Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]))) / 2;
    assert.ok(gap > STROKE_UNITS + 6, `code ${code}: centre opening ${gap.toFixed(1)} vs stroke ${STROKE_UNITS.toFixed(1)}`);
    assert.ok(halfWidth * 2 > STROKE_UNITS + 12, `code ${code}: width ${(halfWidth * 2).toFixed(1)}`);
  }
});
