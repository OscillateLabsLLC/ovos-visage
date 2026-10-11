// Replays a .jsonl fixture through the browser's Mirror and prints its state, for tests/test_mirror_parity.py.
import { readFileSync } from "node:fs";
import { Mirror } from "../ovos_visage/static/mirror.js";

const mirror = new Mirror();
const lines = readFileSync(process.argv[2], "utf8").split("\n").filter((line) => line.trim());
for (const line of lines) mirror.apply(JSON.parse(line));
const current = mirror.current();
console.log(JSON.stringify({
  active: mirror.active,
  namespaces: mirror.namespaces,
  current: current ? [current.namespace, current.page] : null,
}));
