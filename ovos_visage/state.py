"""Client mirror of ovos-gui state (SPEC 6): namespaces, pages, session data and the active-skill stack."""

import logging
from dataclasses import asdict, dataclass, field

LOG = logging.getLogger(__name__)
ACTIVE_SKILLS = "mycroft.system.active_skills"
SYSTEM_NAMESPACE = "system"
IDLE_NAMESPACE = "ovos-skill-homescreen.openvoiceos"
FOCUS_EVENT = "page_gained_focus"


@dataclass
class Namespace:
    skill_id: str
    pages: list[str] = field(default_factory=list)
    data: dict = field(default_factory=dict)
    focused_index: int = 0
    events: dict = field(default_factory=dict)

    def clear_pages(self) -> None:
        self.pages = []
        self.focused_index = 0


def _insert(items: list, position: int, values: list) -> None:
    items[position:position] = values


def _remove(items: list, position: int, count: int) -> list:
    removed = items[position : position + count]
    del items[position : position + count]
    return removed


def _move(items: list, source: int, target: int, count: int) -> None:
    _insert(items, target, _remove(items, source, count))


class GuiState:
    """Applies GUI protocol messages. Unknown messages are logged at warning with their payload."""

    def __init__(self, idle_namespace: str = IDLE_NAMESPACE) -> None:
        self.idle_namespace = idle_namespace
        self.namespaces: dict[str, Namespace] = {}
        self.active: list[str] = []
        self._last_active_insert: str | None = None
        self._handlers = {
            "mycroft.session.set": self._session_set,
            "mycroft.session.delete": self._session_delete,
            "mycroft.session.list.insert": self._list_insert,
            "mycroft.session.list.update": self._list_update,
            "mycroft.session.list.move": self._list_move,
            "mycroft.session.list.remove": self._list_remove,
            "mycroft.gui.list.insert": self._pages_insert,
            "mycroft.gui.list.move": self._pages_move,
            "mycroft.gui.list.remove": self._pages_remove,
            "mycroft.events.triggered": self._event,
        }

    def reset(self) -> None:
        self._last_active_insert = None
        self.namespaces.clear()
        self.active.clear()

    def namespace(self, skill_id: str) -> Namespace:
        if skill_id not in self.namespaces:
            self.namespaces[skill_id] = Namespace(skill_id)
        return self.namespaces[skill_id]

    def apply(self, message: dict) -> bool:
        handler = self._handlers.get(message.get("type"))
        if handler is None:
            LOG.warning("unknown GUI message %r", message)
            return False
        try:
            handler(message)
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            LOG.warning("malformed GUI message %r", message, exc_info=True)
            return False
        return True

    def current(self) -> tuple[str, str] | None:
        """The (namespace, page) the screen shows: the first active namespace with pages, else the idle namespace's.

        A skill enters ``active`` before its page arrives, so stopping at active[0] would flash idle in between.
        """
        for skill_id in (*self.active, self.idle_namespace):
            ns = self.namespaces.get(skill_id)
            if ns and ns.pages:
                return skill_id, ns.pages[min(ns.focused_index, len(ns.pages) - 1)]
        return None

    def snapshot(self) -> dict:
        return {
            "active": list(self.active),
            "idle_namespace": self.idle_namespace,
            "namespaces": {skill_id: asdict(ns) for skill_id, ns in self.namespaces.items()},
        }

    def _session_set(self, message: dict) -> None:
        self.namespace(message["namespace"]).data.update(message["data"])

    def _session_delete(self, message: dict) -> None:
        self.namespace(message["namespace"]).data.pop(message["property"], None)

    def _list_insert(self, message: dict) -> None:
        if message["namespace"] == ACTIVE_SKILLS:
            skill_ids = [item["skill_id"] for item in message["data"]]
            _insert(self.active, message["position"], skill_ids)
            self._last_active_insert = skill_ids[-1] if skill_ids else None
            return
        data = self.namespace(message["namespace"]).data
        _insert(data.setdefault(message["property"], []), message["position"], message["values"])

    def _list_update(self, message: dict) -> None:
        items = self.namespace(message["namespace"]).data[message["property"]]
        position, values = message["position"], message["values"]
        items[position : position + len(values)] = values

    def _list_move(self, message: dict) -> None:
        if message["namespace"] == ACTIVE_SKILLS:
            items = self.active
        else:
            items = self.namespace(message["namespace"]).data[message["property"]]
        _move(items, message["from"], message["to"], message.get("items_number", 1))

    def _list_remove(self, message: dict) -> None:
        if message["namespace"] != ACTIVE_SKILLS:
            items = self.namespace(message["namespace"]).data[message["property"]]
            _remove(items, message["position"], message.get("items_number", 1))
            return
        for skill_id in _remove(self.active, message["position"], message.get("items_number", 1)):
            # ovos-gui drops a removed namespace's pages without sending gui.list.remove
            self.namespace(skill_id).clear_pages()

    def _pages_insert(self, message: dict) -> None:
        skill_id = message["namespace"]
        ns = self.namespace(skill_id)
        if not ns.pages and skill_id in self.active[1:] and skill_id != self._last_active_insert:
            # ovos-gui moves an active namespace to the front before loading its pages, but only tells clients when
            # it already had pages (Namespace.activate bails out otherwise), so later positional ops would miss.
            self.active.insert(0, self.active.pop(self.active.index(skill_id)))
        _insert(ns.pages, message["position"], [item["page"] for item in message["data"]])

    def _pages_move(self, message: dict) -> None:
        pages = self.namespace(message["namespace"]).pages
        _move(pages, message["from"], message["to"], message.get("items_number", 1))

    def _pages_remove(self, message: dict) -> None:
        ns = self.namespace(message["namespace"])
        _remove(ns.pages, message["position"], message.get("items_number", 1))
        ns.focused_index = min(ns.focused_index, max(len(ns.pages) - 1, 0))

    def _event(self, message: dict) -> None:
        skill_id, name, data = message["namespace"], message["event_name"], message.get("data") or {}
        if skill_id == SYSTEM_NAMESPACE:
            return
        if name == FOCUS_EVENT:
            self.namespace(skill_id).focused_index = int(data["number"])
        else:
            self.namespace(skill_id).events[name] = data
