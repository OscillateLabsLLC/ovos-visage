// ovos.common_play now-playing (SPEC 8.6): the cover turns like a record inside the progress ring, over a blurred wash
// of itself; title, artist, and a status line with equaliser bars, time and a live dot. OCP shows PlayerLoader with
// playerBackend OVOSSyncPlayer; video and web backends get the fallback. Motion and state styling live in ocp.css.
import * as fallback from "./fallback.js";
import { anchorFor, isSyncPlayer, progressAt, statusParts, trackModel, uprightTarget } from "./ocp_model.js";
import { el, ring, setRing } from "./widgets.js";

const TICK_MS = 1000;
const VINYL = "/static/icons/vinyl.svg";
const EQ_BARS = 4;
const SETTLE_MS = 600;
let root = null;
let view = null;
let track = null;
let anchor = null;
let ticker = null;

function statusRow() {
  const status = el("div", "now-status");
  const eq = el("span", "now-eq");
  for (let i = 0; i < EQ_BARS; i++) eq.append(el("i"));
  status.append(eq, el("span", "now-word"), el("span", "now-live-dot"), el("span", "now-time"), el("span", "now-flags"));
  return status;
}

function build() {
  const stage = el("div", "now-stage");
  const disc = el("div", "circle now-disc");
  const cover = el("img", "now-cover");
  cover.alt = "";
  cover.addEventListener("error", () => showCover(null));
  disc.append(el("div", "now-glow"), cover, ring(0));
  stage.append(el("div", "now-wash"), disc);
  const meta = el("div", "now-meta");
  meta.append(el("div", "now-title"), el("div", "now-artist"), statusRow());
  return { stage, disc, cover, wash: stage.firstChild, meta };
}

function showCover(url) {
  view.disc.classList.toggle("no-cover", !url);
  const src = url ?? VINYL;
  if (view.cover.getAttribute("src") !== src) view.cover.src = src;
  view.wash.style.backgroundImage = url ? `url("${url}")` : "";
}

// Playing (or a new track while playing) starts the record turn from upright.
function startSpin() {
  Object.assign(view.cover.style, { transition: "", transform: "", animation: "none" });
  void view.cover.offsetWidth;
  view.cover.style.animation = "";
}

// Leaving playing eases the record back upright from wherever it stopped, so a paused logo never sits upside down.
function settleUpright() {
  const matrix = new DOMMatrix(getComputedStyle(view.cover).transform);
  const angle = (((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI) % 360 + 360) % 360;
  Object.assign(view.cover.style, { animation: "none", transition: "none", transform: `rotate(${angle}deg)` });
  void view.cover.offsetWidth;
  Object.assign(view.cover.style, { transition: `transform ${SETTLE_MS}ms ease-out`, transform: `rotate(${uprightTarget(angle)}deg)` });
}

function paintTrack(previousId) {
  showCover(track.cover);
  const playing = track.state === "playing";
  if (playing && (!view.spinning || previousId !== track.id)) startSpin();
  if (!playing && view.spinning !== false) settleUpright();
  view.spinning = playing;
  view.stage.dataset.state = track.state;
  view.meta.dataset.state = track.state;
  view.meta.querySelector(".now-title").textContent = track.title;
  view.meta.querySelector(".now-artist").textContent = track.artist;
}

function tick() {
  const progress = progressAt({ ...track, positionMs: anchor.positionMs }, performance.now() - anchor.at);
  setRing(view.disc.querySelector("svg.ring"), progress.fraction);
  const parts = statusParts(track, progress);
  const status = view.meta.querySelector(".now-status");
  status.querySelector(".now-word").textContent = parts.state;
  status.classList.toggle("live", parts.live);
  status.querySelector(".now-time").textContent = parts.live ? `${parts.time} · live` : parts.time;
  status.querySelector(".now-flags").textContent = parts.flags.join("  ");
}

function renderPlayer(container, data) {
  view = build();
  anchor = null;
  track = null;
  container.append(view.stage, view.meta);
  clearInterval(ticker);
  ticker = setInterval(tick, TICK_MS);
  updatePlayer(data);
}

function updatePlayer(data) {
  const previousId = track?.id;
  track = trackModel(data, track);
  anchor = anchorFor(anchor, track, performance.now());
  paintTrack(previousId);
  tick();
}

export function render(container, data, ctx) {
  root = { container, ctx, player: isSyncPlayer(data) };
  if (root.player) renderPlayer(container, data);
  else fallback.render(container, data, ctx);
}

export function update(data, ctx) {
  if (isSyncPlayer(data) !== root.player) {
    destroy();
    root.container.replaceChildren();
    render(root.container, data, ctx ?? root.ctx);
  } else if (root.player) updatePlayer(data);
  else fallback.update(data, ctx);
}

export function destroy() {
  clearInterval(ticker);
  ticker = null;
}
