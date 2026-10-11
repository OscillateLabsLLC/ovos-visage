// Replays a .jsonl fixture through the browser Mirror and prints every page shown with the SYSTEM_* view-model
// computed from the session data at that moment (tests/test_templates_pages.py).
import { readFileSync } from "node:fs";
import { Mirror } from "../ovos_visage/static/mirror.js";
import {
  htmlModel,
  htmlSrcdoc,
  imageModel,
  inputBoxModel,
  loadingModel,
  statusModel,
  textFrameModel,
  urlModel,
} from "../ovos_visage/static/pages/templates_model.js";

const MODELS = {
  SYSTEM_TextFrame: textFrameModel,
  SYSTEM_Loading: loadingModel,
  SYSTEM_Status: statusModel,
  SYSTEM_ImageFrame: imageModel,
  SYSTEM_AnimatedImageFrame: imageModel,
  SYSTEM_HtmlFrame: (data) => ({ ...htmlModel(data), srcdoc: htmlSrcdoc(htmlModel(data)) }),
  SYSTEM_UrlFrame: urlModel,
  SYSTEM_InputBox: inputBoxModel,
};

const mirror = new Mirror();
const pages = [];
for (const line of readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.trim())) {
  mirror.apply(JSON.parse(line));
  const current = mirror.current();
  const last = pages.at(-1);
  if (current && (last?.namespace !== current.namespace || last?.page !== current.page)) {
    const model = MODELS[current.page]?.(mirror.ns(current.namespace).data) ?? null;
    pages.push({ namespace: current.namespace, page: current.page, model });
  }
}
console.log(JSON.stringify({ pages }));
