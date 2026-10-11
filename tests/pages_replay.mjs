// Replays a .jsonl fixture through the browser Mirror and prints every page shown, with the weather view-model
// computed from the session data at the moment the page was shown (tests/test_skill_pages.py).
import { readFileSync } from "node:fs";
import { Mirror } from "../ovos_visage/static/mirror.js";
import { animatedIconName, forecastModel, nowModel, sunTimesModel } from "../ovos_visage/static/pages/weather_model.js";

const MODELS = {
  CurrentWeather: nowModel,
  SingleDay: nowModel,
  DailyForecast: forecastModel,
  HourlyForecast: forecastModel,
  SunriseSunset: (page, data) => sunTimesModel(data),
};
const ANIMATED_CODES = 18;

function shown(mirror) {
  const current = mirror.current();
  if (!current) return null;
  const data = structuredClone(mirror.ns(current.namespace).data);
  const model = MODELS[current.page]?.(current.page, data) ?? null;
  return { namespace: current.namespace, page: current.page, data, model };
}

const mirror = new Mirror();
const pages = [];
const lines = readFileSync(process.argv[2], "utf8").split("\n").filter((line) => line.trim());
for (const line of lines) {
  mirror.apply(JSON.parse(line));
  const page = shown(mirror);
  const last = pages.at(-1);
  if (page && (last?.namespace !== page.namespace || last?.page !== page.page)) pages.push(page);
}
const icons = Array.from({ length: ANIMATED_CODES }, (_, code) => animatedIconName(code));
console.log(JSON.stringify({ pages, icons }));
