// Replays a .jsonl fixture through the browser Mirror and prints every page shown, plus the alerts view-model after
// each alerts session update, the way the Timer page computes it (tests/test_alerts_pages.py).
import { readFileSync } from "node:fs";
import { Mirror } from "../ovos_visage/static/mirror.js";
import { alarmsModel, listModel, timerModel } from "../ovos_visage/static/pages/alerts_model.js";

const ALERTS = "ovos-skill-alerts.openvoiceos";
const longest = new Map();
const MODELS = {
  Timer: (data) => timerModel(data, longest),
  AlarmsOverviewCard: (data) => alarmsModel(data),
  ListView: (data) => listModel(data),
};

const mirror = new Mirror();
const pages = [];
const models = [];
const lines = readFileSync(process.argv[2], "utf8").split("\n").filter((line) => line.trim());
for (const line of lines) {
  const message = JSON.parse(line);
  mirror.apply(message);
  const current = mirror.current();
  const last = pages.at(-1);
  const pageChanged = current && (last?.namespace !== current.namespace || last?.page !== current.page);
  if (pageChanged) pages.push({ namespace: current.namespace, page: current.page });
  const alertsChanged = message.namespace === ALERTS && message.type === "mycroft.session.set";
  if (current?.namespace === ALERTS && (pageChanged || alertsChanged)) {
    models.push({ page: current.page, model: MODELS[current.page]?.(mirror.ns(ALERTS).data) ?? null });
  }
}
console.log(JSON.stringify({ pages, models }));
