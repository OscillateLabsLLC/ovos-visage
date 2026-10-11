// JS mirror of ovos_visage/state.py. Same schema, same rules; keep the two in step.
export const ACTIVE_SKILLS = "mycroft.system.active_skills";
export const SYSTEM_NAMESPACE = "system";
const FOCUS_EVENT = "page_gained_focus";

const insert = (items, position, values) => items.splice(position, 0, ...values);
const remove = (items, position, count = 1) => items.splice(position, count);
const move = (items, from, to, count = 1) => insert(items, to, remove(items, from, count));

export class Mirror {
  constructor() {
    this.load({ active: [], namespaces: {}, idle_namespace: "ovos-skill-homescreen.openvoiceos" });
  }

  load(state) {
    this.active = [...state.active];
    this.idleNamespace = state.idle_namespace;
    this.namespaces = structuredClone(state.namespaces);
    this.lastActiveInsert = null;
  }

  ns(skillId) {
    if (!this.namespaces[skillId]) {
      this.namespaces[skillId] = { skill_id: skillId, pages: [], data: {}, focused_index: 0, events: {} };
    }
    return this.namespaces[skillId];
  }

  current() {
    for (const skillId of [...this.active, this.idleNamespace]) {
      const ns = this.namespaces[skillId];
      if (ns && ns.pages.length) {
        const index = Math.min(ns.focused_index, ns.pages.length - 1);
        return { namespace: skillId, page: ns.pages[index], index };
      }
    }
    return null;
  }

  apply(msg) {
    const handler = HANDLERS[msg.type];
    if (!handler) {
      console.warn("unknown GUI message", msg);
      return;
    }
    handler(this, msg);
  }
}

function listTarget(mirror, msg) {
  return msg.namespace === ACTIVE_SKILLS ? mirror.active : mirror.ns(msg.namespace).data[msg.property];
}

const HANDLERS = {
  "mycroft.session.set": (m, msg) => Object.assign(m.ns(msg.namespace).data, msg.data),
  "mycroft.session.delete": (m, msg) => delete m.ns(msg.namespace).data[msg.property],
  "mycroft.session.list.insert": (m, msg) => {
    if (msg.namespace === ACTIVE_SKILLS) {
      const ids = msg.data.map((item) => item.skill_id);
      m.lastActiveInsert = ids.at(-1) ?? null;
      return insert(m.active, msg.position, ids);
    }
    const data = m.ns(msg.namespace).data;
    data[msg.property] ??= [];
    insert(data[msg.property], msg.position, msg.values);
  },
  "mycroft.session.list.update": (m, msg) => {
    m.ns(msg.namespace).data[msg.property].splice(msg.position, msg.values.length, ...msg.values);
  },
  "mycroft.session.list.move": (m, msg) => move(listTarget(m, msg), msg.from, msg.to, msg.items_number ?? 1),
  "mycroft.session.list.remove": (m, msg) => {
    const removed = remove(listTarget(m, msg), msg.position, msg.items_number ?? 1);
    if (msg.namespace !== ACTIVE_SKILLS) return;
    for (const skillId of removed) Object.assign(m.ns(skillId), { pages: [], focused_index: 0 });
  },
  "mycroft.gui.list.insert": (m, msg) => {
    // Same rule as state.py: ovos-gui moves an active namespace to the front without telling clients when it had no pages.
    const ns = m.ns(msg.namespace);
    const index = m.active.indexOf(msg.namespace);
    if (!ns.pages.length && index > 0 && msg.namespace !== m.lastActiveInsert) move(m.active, index, 0);
    insert(ns.pages, msg.position, msg.data.map((item) => item.page));
  },
  "mycroft.gui.list.move": (m, msg) => move(m.ns(msg.namespace).pages, msg.from, msg.to, msg.items_number ?? 1),
  "mycroft.gui.list.remove": (m, msg) => {
    const ns = m.ns(msg.namespace);
    remove(ns.pages, msg.position, msg.items_number ?? 1);
    ns.focused_index = Math.min(ns.focused_index, Math.max(ns.pages.length - 1, 0));
  },
  "mycroft.events.triggered": (m, msg) => {
    if (msg.namespace === SYSTEM_NAMESPACE) return;
    if (msg.event_name === FOCUS_EVENT) m.ns(msg.namespace).focused_index = Number(msg.data.number);
    else m.ns(msg.namespace).events[msg.event_name] = msg.data ?? {};
  },
};
