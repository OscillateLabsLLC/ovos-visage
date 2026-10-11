import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ROWS, busyModel, homeModel, mediaTypes, skillHue, skillName, suggestionsModel, windowRows } from "../../ovos_visage/static/pages/ocp_browse_model.js";

const YT = "ovos-skill-youtube-music.openvoiceos";
// Shape measured from a live youtube-music playlist (MediaEntry.infocard): no artist field.
const card = (track, duration, uri) => ({ track, album: YT, duration, image: "", source: "/venv/ovos_skill_youtube_music/ui/icon.png", uri });
const PLAYLIST = [
  card("Moonlight Sonata (Flute & Piano)", 339000, "yt://1"),
  card("Moonlight Sonata (Orchestra Version)", 339000, "yt://2"),
  card("Moonlight Sonata (Marimba Version)", 284000, "yt://3"),
];

test("skill ids read as plain names", () => {
  assert.equal(skillName(YT), "youtube music");
  assert.equal(skillName("skill-ovos-somafm.openvoiceos"), "somafm");
  assert.equal(skillName("skill-easter-eggs.openvoiceos"), "easter eggs");
  assert.equal(skillName(undefined), "");
});

test("busy shows OCP's footer text, else the stock label", () => {
  assert.equal(busyModel({ footer_text: "Searching..." }).label, "Searching...");
  assert.equal(busyModel({}).label, "Searching media");
});

test("suggestions: the playlist with source and length beneath, the playing entry marked", () => {
  const model = suggestionsModel({ playlistModel: { data: PLAYLIST }, searchModel: { data: [] }, uri: "yt://2" });
  assert.equal(model.heading, "Playlist");
  assert.deepEqual(model.rows.map((r) => r.current), [false, true, false]);
  assert.equal(model.rows[2].subtitle, "youtube music · 4:44");
  assert.equal(model.rows[0].cover, null);
});

test("suggestions fall back to search results when there is no playlist", () => {
  const model = suggestionsModel({ playlistModel: { data: [] }, searchModel: { data: PLAYLIST.slice(0, 1) } });
  assert.equal(model.heading, "Search results");
  assert.equal(model.rows.length, 1);
  assert.equal(suggestionsModel({}).rows.length, 0);
});

test("long lists keep the playing row in view and count the rest", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, current: i === 15 }));
  const { rows: shown, hidden } = windowRows(rows);
  assert.equal(shown.length, MAX_ROWS);
  assert.equal(hidden, 20 - MAX_ROWS);
  assert.ok(shown.some((r) => r.current));
  assert.equal(windowRows(rows.slice(0, 3)).hidden, 0);
});

test("home lists featured OCP skills with their media types, else the playlist as recent entries", () => {
  // skillCards as measured live after ovos.common_play.OCP.homescreen.app.
  const cards = [
    { skill_id: "ovos-skill-news.openvoiceos", title: "News Skill", image: "/venv/news.png", media_type: [8, 0] },
    { skill_id: "skill-ovos-somafm.openvoiceos", title: "somafm skill", image: "/venv/somafm.png", media_type: [2, 7, 0] },
  ];
  const skills = homeModel({ skillCards: cards });
  assert.equal(skills.heading, "Media");
  assert.deepEqual(skills.rows.map((r) => [r.title, r.subtitle]), [["News Skill", "news"], ["somafm skill", "music · radio"]]);
  assert.equal(mediaTypes(7), "radio");
  const recent = homeModel({ skillCards: [], playlistModel: { data: PLAYLIST } });
  assert.deepEqual([recent.heading, recent.rows.length], ["Recent", 3]);
});

test("rows fall back to the skill icon for a thumbnail; raw paths never reach the page", () => {
  const served = { ...PLAYLIST[0], image: "", source: "/res-abs/0123456789abcdef01234567" };
  assert.equal(suggestionsModel({ playlistModel: { data: [served] } }).rows[0].cover, "/res-abs/0123456789abcdef01234567");
  assert.equal(suggestionsModel({ playlistModel: { data: PLAYLIST } }).rows[0].cover, null);
  const logo = { ...PLAYLIST[0], image: "https://somafm.com/img3/dronezone-400.jpg" };
  assert.equal(suggestionsModel({ playlistModel: { data: [logo] } }).rows[0].cover, logo.image);
});

test("home chips carry the served skill icon and a hue that is stable per skill", () => {
  const card = { skill_id: "skill-ovos-somafm.openvoiceos", title: "somafm skill", image: "/res-abs/aaaaaaaaaaaaaaaaaaaaaaaa", media_type: [2, 7] };
  const home = homeModel({ skillCards: [card, { ...card, skill_id: "ovos-skill-news.openvoiceos", title: "News" }] });
  assert.equal(home.layout, "chips");
  assert.equal(home.rows[0].cover, card.image);
  assert.equal(skillHue(card.skill_id), skillHue(card.skill_id));
  assert.notEqual(home.rows[0].hue, home.rows[1].hue);
  assert.ok(home.rows.every((row) => row.hue >= 0 && row.hue < 360));
  assert.equal(homeModel({ playlistModel: { data: PLAYLIST } }).layout, "rows");
});

test("suggestions fill up with search results after the playlist, labelled, without repeating an entry", () => {
  const results = [PLAYLIST[1], card("Drone Zone", 0, "yt://9"), card("Groove Salad", 0, "yt://10")];
  const model = suggestionsModel({ playlistModel: { data: [PLAYLIST[1]] }, searchModel: { data: results }, uri: "yt://2" });
  assert.equal(model.heading, "Playlist");
  assert.deepEqual(model.rows.map((r) => [r.title, r.section ?? null, r.current]), [
    ["Moonlight Sonata (Orchestra Version)", null, true],
    ["Drone Zone", "Search results", false],
    ["Groove Salad", null, false],
  ]);
});
