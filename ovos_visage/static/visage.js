// Browser entry: one websocket from ovos-visage, a state mirror, the page router and the attention face.
import { Mirror, SYSTEM_NAMESPACE } from "./mirror.js";
import { Attention, isContentPage } from "./attention.js";
import { Face } from "./face/face.js";
import { BLANK, Router } from "./router.js";

const SNAPSHOT = "visage.snapshot";
const RECONNECT_MS = 2000;
const device = document.getElementById("device");
const screen = document.getElementById("screen");
const link = document.getElementById("link");
const mirror = new Mirror();
const attentionElement = document.getElementById("attention");
const attention = new Attention(attentionElement, new Face(attentionElement));
const router = new Router(document.getElementById("page"), sendFocus);
let socket = null;

function fitToWindow() {
  const scale = Math.min(window.innerWidth / device.offsetWidth, window.innerHeight / device.offsetHeight);
  device.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function sendFocus(namespace, number) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "focus", namespace, number }));
}

function setLink(online) {
  link.classList.toggle("online", online);
  link.classList.toggle("offline", !online);
}

function refresh() {
  const target = mirror.current() ?? BLANK;
  const ns = target === BLANK ? { data: {}, events: {} } : mirror.ns(target.namespace);
  const content = isContentPage(target, mirror.idleNamespace);
  attention.setCompact(content);
  screen.dataset.content = String(content);
  router.show(target, ns.data, { namespace: target.namespace, page: target.page, events: ns.events });
}

function onMessage(msg) {
  if (msg.type === SNAPSHOT) {
    mirror.load(msg.state);
    setLink(msg.gui_connected);
    router.reset();
  } else {
    mirror.apply(msg);
    if (msg.type === "mycroft.events.triggered" && msg.namespace === SYSTEM_NAMESPACE) attention.handle(msg.event_name, msg.data);
  }
  refresh();
}

function connect() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  socket.onmessage = (event) => onMessage(JSON.parse(event.data));
  socket.onclose = () => {
    setLink(false);
    setTimeout(connect, RECONNECT_MS);
  };
}

window.addEventListener("resize", fitToWindow);
fitToWindow();
refresh();
connect();
window.visage = { mirror, attention, router };
