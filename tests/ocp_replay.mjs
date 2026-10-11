// Replays a .jsonl fixture through the browser Mirror and prints every page shown, plus the view-model of the current
// OCP screen after each ovos.common_play session update, the way the pages compute it (tests/test_ocp_page.py).
// Utterances are listed with the OCP status at that moment, so tests can check what "stop" did.
import { readFileSync } from "node:fs";
import { Mirror } from "../ovos_visage/static/mirror.js";
import { busyModel, homeModel, suggestionsModel } from "../ovos_visage/static/pages/ocp_browse_model.js";
import { anchorFor, isSyncPlayer, progressAt, trackModel } from "../ovos_visage/static/pages/ocp_model.js";

const OCP = "ovos.common_play";
const PLAYER_PAGES = new Set(["PlayerLoader", "OVOSSyncPlayer"]);
const BROWSE = { busy: busyModel, SuggestionsView: suggestionsModel, Home: homeModel };

const mirror = new Mirror();
const pages = [];
const models = [];
const utterances = [];
let track = null;
let anchor = null;

// Replays have no wall clock, so the page's clock is read at the moment of each update: `shownMs` is what it displays.
function screenModel(page, data) {
  if (PLAYER_PAGES.has(page)) {
    track = trackModel(data, track);
    anchor = anchorFor(anchor, track, 0);
    return { syncPlayer: isSyncPlayer(data), track, shownMs: anchor.positionMs, progress: progressAt(track, 0) };
  }
  return BROWSE[page] ? { browse: BROWSE[page](data) } : null;
}

const lines = readFileSync(process.argv[2], "utf8").split("\n").filter((line) => line.trim());
lines.forEach((line, index) => {
  const message = JSON.parse(line);
  mirror.apply(message);
  const current = mirror.current();
  const last = pages.at(-1);
  if (current && (last?.namespace !== current.namespace || last?.page !== current.page)) {
    pages.push({ namespace: current.namespace, page: current.page });
  }
  if (message.event_name === "recognizer_loop:utterance") {
    utterances.push({ line: index + 1, text: message.data.utterances[0], status: mirror.ns(OCP).data.status ?? null });
  }
  const ocpUpdate = message.namespace === OCP && message.type === "mycroft.session.set";
  if (ocpUpdate && current?.namespace === OCP) {
    const model = screenModel(current.page, mirror.ns(OCP).data);
    if (model) models.push({ line: index + 1, page: current.page, status: mirror.ns(OCP).data.status ?? null, ...model });
  }
});
console.log(JSON.stringify({ pages, models, utterances }));
