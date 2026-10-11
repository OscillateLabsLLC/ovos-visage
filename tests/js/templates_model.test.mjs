import assert from "node:assert/strict";
import { test } from "node:test";
import {
  htmlModel,
  htmlSrcdoc,
  imageModel,
  imageSource,
  inputBoxModel,
  isShortText,
  loadingModel,
  pageDurationMs,
  paginate,
  shortLayout,
  splitShort,
  statusModel,
  textFrameModel,
  urlModel,
} from "../../ovos_visage/static/pages/templates_model.js";

test("every model tolerates null, undefined and missing keys", () => {
  for (const data of [undefined, null, {}, { title: null, text: null, label: null, image: null, url: null }]) {
    assert.deepEqual(textFrameModel(data), { title: "", text: "" });
    assert.deepEqual(loadingModel(data), { label: "" });
    assert.deepEqual(statusModel(data), { ok: false, label: "" });
    assert.deepEqual(imageModel(data), { src: null, fit: "contain", background: "transparent", title: "", caption: "" });
    assert.deepEqual(htmlModel(data), { html: "", base: "" });
    assert.deepEqual(urlModel(data), { url: "", frameable: false });
    assert.deepEqual(inputBoxModel(data), { title: "", placeholder: "", confirm: "", exit: "" });
  }
});

test("paginate fills each page as far as fits() allows and never drops a word", () => {
  const words = Array.from({ length: 23 }, (_, i) => `w${i}`).join(" ");
  const pages = paginate(words, (candidate) => candidate.split(" ").length <= 10);
  assert.deepEqual(pages.map((p) => p.split(" ").length), [10, 10, 3]);
  assert.equal(pages.join(" "), words);
  assert.deepEqual(paginate("onlyoneverylongword", () => false), ["onlyoneverylongword"]);
  assert.deepEqual(paginate("", () => true), []);
});

test("pages stay up at reading pace with a floor", () => {
  assert.equal(pageDurationMs(180), 60000);
  assert.equal(pageDurationMs(66), 22000);
  assert.equal(pageDurationMs(3), 4000);
});

test("status is Enabled only on the exact string the producer sends", () => {
  assert.equal(statusModel({ status: "Enabled" }).ok, true);
  for (const status of ["Disabled", "enabled", true, 1]) assert.equal(statusModel({ status }).ok, false, String(status));
});

test("image sources: data:image, http(s) and /res/ load; bare paths and other schemes do not", () => {
  assert.equal(imageSource("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(imageSource("https://x.org/a.png"), "https://x.org/a.png");
  assert.equal(imageSource("/res/ns/qt5/a.svg"), "/res/ns/qt5/a.svg");
  for (const bad of ["/etc/passwd", "file:///tmp/a.png", "javascript:alert(1)", "data:text/html,<b>x</b>"]) {
    assert.equal(imageSource(bad), null, bad);
  }
  assert.deepEqual(["fit", "crop", "stretch", "CROP", "zoom"].map((fill) => imageModel({ fill }).fit), [
    "contain",
    "cover",
    "fill",
    "cover",
    "contain",
  ]);
});

test("html base is injected only for http(s) or /res/ resource locations", () => {
  assert.equal(htmlSrcdoc(htmlModel({ html: "<p>x</p>", resourceLocation: "https://a.org/" })), '<base href="https://a.org/"><p>x</p>');
  assert.equal(
    htmlSrcdoc(htmlModel({ html: "<html><head><title>t</title></head></html>", resourceLocation: "/res/ns/" })),
    '<html><head><base href="/res/ns/"><title>t</title></head></html>',
  );
  assert.equal(htmlSrcdoc(htmlModel({ html: "<p>x</p>", resourceLocation: "/home/me/skill/" })), "<p>x</p>");
});

test("url frames only http(s)", () => {
  assert.equal(urlModel({ url: "https://example.com" }).frameable, true);
  assert.equal(urlModel({ url: "file:///etc/hosts" }).frameable, false);
  assert.equal(urlModel({ url: "javascript:alert(1)" }).frameable, false);
});

test("short answers stay one line while big, wrap before shrinking below 48 px, and never go below 40 px", () => {
  assert.equal(isShortText("tails"), true);
  assert.equal(isShortText(""), false);
  assert.equal(isShortText("x".repeat(25)), false);
  assert.deepEqual(shortLayout("tails", 252), { lines: ["tails"], px: 72 });
  const ip = shortLayout("192.168.100.200", 252);
  assert.deepEqual(ip.lines, ["192.168.", "100.200"]);
  assert.ok(ip.px >= 48 && 8 * 0.56 * ip.px <= 252, `${ip.px}px`);
  assert.deepEqual(shortLayout("supercalifragilistic", 252).lines, ["supercalifragilistic"]);
  assert.equal(shortLayout("supercalifragilistic", 252).px, 40);
  assert.ok(shortLayout("x".repeat(24).replace(/x{12}/, "$& "), 252).px >= 40);
});

test("splitShort balances the halves at a space or punctuation", () => {
  assert.deepEqual(splitShort("New York City"), ["New York", "City"]);
  assert.deepEqual(splitShort("10.0.0.1"), ["10.0.", "0.1"]);
  assert.equal(splitShort("abcdef"), null);
});
