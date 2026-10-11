// View models for the OCP browse screens (SPEC 8.6): busy, SuggestionsView and Home. Pure; tested under node.
//
// List entries are MediaEntry.infocard dicts (ovos_utils/ocp.py): {track, album (the skill id), duration (ms), image,
// source (skill icon path), uri}. There is no artist field, so the line under a title is the source skill and length.
import { coverUrl, formatTime } from "./ocp_model.js";

const SEARCHING = "Searching media";
// ovos_utils.ocp.MediaType values a skill card can list; 0 (GENERIC) says nothing and is left out.
const MEDIA_TYPES = {
  1: "audio", 2: "music", 3: "video", 4: "audiobooks", 5: "games", 6: "podcasts", 7: "radio", 8: "news", 9: "tv",
  10: "movies", 11: "trailers", 15: "documentaries", 16: "radio theatre", 17: "short films", 19: "series", 21: "cartoons",
  22: "anime", 23: "asmr",
};
const SKILL_AFFIXES = [/\.openvoiceos$/, /\.[a-z0-9_-]+$/, /^ovos-skill-/, /^skill-ovos-/, /^skill-/];
export const MAX_ROWS = 7;
// Home's skill chips: two columns of three fit above the attention strip.
export const MAX_CHIPS = 6;
const HUES = 360;

/** "ovos-skill-youtube-music.openvoiceos" -> "youtube music". */
export function skillName(skillId) {
  const name = SKILL_AFFIXES.reduce((id, affix) => id.replace(affix, ""), String(skillId ?? ""));
  return name.replace(/[-_]+/g, " ").trim();
}

export function busyModel(data = {}) {
  return { label: String(data.footer_text || SEARCHING) };
}

function entryRow(entry, currentUri) {
  const length = Number(entry.duration) > 0 ? formatTime(entry.duration) : "";
  return {
    title: String(entry.track || "Untitled"),
    subtitle: [skillName(entry.album), length].filter(Boolean).join(" · "),
    cover: coverUrl(entry.image) ?? coverUrl(entry.source),
    current: Boolean(currentUri) && entry.uri === currentUri,
  };
}

/** At most `size` rows, keeping the current one in view; `hidden` counts what was left out. */
export function windowRows(rows, size = MAX_ROWS) {
  if (rows.length <= size) return { rows, hidden: 0 };
  const current = Math.max(0, rows.findIndex((row) => row.current));
  const start = Math.min(Math.max(0, current - Math.floor(size / 2)), rows.length - size);
  return { rows: rows.slice(start, start + size), hidden: rows.length - size };
}

function entries(model) {
  return Array.isArray(model?.data) ? model.data : [];
}

/** The playlist first, then search results it does not already hold, the first of them labelled as a new section. */
export function suggestionsModel(data = {}) {
  const playlist = entries(data.playlistModel);
  const inPlaylist = new Set(playlist.map((entry) => entry.uri));
  const results = entries(data.searchModel).filter((entry) => !inPlaylist.has(entry.uri));
  const rows = [...playlist, ...results].map((entry) => entryRow(entry, data.uri));
  if (playlist.length && results.length) rows[playlist.length].section = "Search results";
  return { heading: playlist.length ? "Playlist" : "Search results", layout: "rows", ...windowRows(rows) };
}

export function mediaTypes(types) {
  const names = (Array.isArray(types) ? types : [types]).map((type) => MEDIA_TYPES[Number(type)]).filter(Boolean);
  return [...new Set(names)].join(" · ");
}

/** A stable hue per skill for its chip's gradient, so each skill keeps its colour between visits. */
export function skillHue(skillId) {
  let hash = 0;
  for (const char of String(skillId ?? "")) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % HUES;
}

function skillRow(card) {
  return {
    title: String(card.title || skillName(card.skill_id)),
    subtitle: mediaTypes(card.media_type),
    cover: coverUrl(card.image),
    hue: skillHue(card.skill_id),
    current: false,
  };
}

/** Featured OCP skills (skillCards, set when Home opens) when OCP lists any, else the current playlist as recent entries. */
export function homeModel(data = {}) {
  const cards = Array.isArray(data.skillCards) ? data.skillCards : [];
  if (cards.length) return { heading: "Media", layout: "chips", ...windowRows(cards.map(skillRow), MAX_CHIPS) };
  const rows = entries(data.playlistModel).map((entry) => entryRow(entry, data.uri));
  return { heading: "Recent", layout: "rows", ...windowRows(rows) };
}
