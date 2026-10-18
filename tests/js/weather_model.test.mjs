import assert from "node:assert/strict";
import { test } from "node:test";
import { degrees, nowModel, percent, toNumber } from "../../ovos_visage/static/pages/weather_model.js";

test("numbers from a comma-decimal locale (nl) parse as decimals", () => {
  assert.equal(toNumber("21,6"), 21.6);
  assert.equal(toNumber("-3,5"), -3.5);
  assert.equal(toNumber("1,000"), 1, "a comma between digits is a decimal point, never thousands");
  assert.equal(toNumber(21.6), 21.6);
  assert.equal(toNumber("abc"), null);
  assert.equal(toNumber(""), null);
});

test("degrees and percent round comma decimals and show the placeholder otherwise", () => {
  assert.equal(degrees("21,6"), "22°");
  assert.equal(percent("40,4"), "40%");
  assert.equal(degrees("abc"), degrees(null));
});

test("wind speed never renders NaN", () => {
  const model = nowModel("SingleDay", { currentTemperature: "21,5", windSpeed: "7,2", chanceOfPrecipitation: "40" });
  assert.equal(model.details, "wind 7");
  assert.equal(nowModel("SingleDay", { currentTemperature: "21", windSpeed: "calm" }).details, "");
});
