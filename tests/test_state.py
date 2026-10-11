from ovos_visage.state import ACTIVE_SKILLS, IDLE_NAMESPACE, GuiState
from tests.conftest import load_fixture

DATETIME = "ovos-skill-date-time.openvoiceos"
TIMER_EVENT = "ovos.timer.widget.manager.update"


def replay(messages, state=None):
    state = state or GuiState()
    for message in messages:
        assert state.apply(message), message
    return state


def is_page_insert(message, namespace):
    return message["type"] == "mycroft.gui.list.insert" and message["namespace"] == namespace


def is_active_remove(message):
    return message["type"] == "mycroft.session.list.remove" and message["namespace"] == ACTIVE_SKILLS


def test_boot_sync_shows_homescreen_idle():
    state = replay(load_fixture("boot_sync_idle.jsonl"))
    assert state.active == [IDLE_NAMESPACE]
    assert state.current() == (IDLE_NAMESPACE, "idle")
    data = state.namespaces[IDLE_NAMESPACE].data
    assert data["time_string"].count(":") == 1 and data["weather_api_enabled"] is True and "weather_code" in data


def test_live_session_time_page_then_back_to_idle_and_timer_widget():
    messages = load_fixture("session_timer_time_stop.jsonl")
    shown_at = next(i for i, m in enumerate(messages) if is_page_insert(m, DATETIME))
    removed_at = next(i for i, m in enumerate(messages) if is_active_remove(m))
    state = replay(messages[: shown_at + 1])
    assert state.current() == (DATETIME, "time")
    assert state.namespaces[IDLE_NAMESPACE].events[TIMER_EVENT]["count"] == 1
    replay(messages[shown_at + 1 : removed_at + 1], state)
    assert state.current() == (IDLE_NAMESPACE, "idle")
    assert state.namespaces[DATETIME].pages == [] and state.namespaces[DATETIME].data == {}
    replay(messages[removed_at + 1 :], state)
    assert state.namespaces[IDLE_NAMESPACE].events[TIMER_EVENT]["count"] == 0


def test_reactivated_namespace_does_not_duplicate_pages():
    messages = load_fixture("session_timer_time_stop.jsonl")
    start = next(
        i for i, m in enumerate(messages) if m["type"] == "mycroft.session.list.insert" and m["data"][0]["skill_id"] == DATETIME
    )
    removed_at = next(i for i, m in enumerate(messages) if is_active_remove(m))
    state = replay(messages[: removed_at + 1])
    replay(messages[start : removed_at - 3], state)
    assert state.namespaces[DATETIME].pages == ["time"]
    assert state.current() == (DATETIME, "time")


def test_blank_when_nothing_has_pages():
    assert GuiState().current() is None


def test_session_list_deltas_on_a_session_key():
    ns = "skill.x"
    state = replay(
        [
            {"type": "mycroft.session.list.insert", "namespace": ns, "property": "items", "position": 0, "values": [1, 2, 3]},
            {"type": "mycroft.session.list.update", "namespace": ns, "property": "items", "position": 1, "values": [20]},
            {"type": "mycroft.session.list.move", "namespace": ns, "property": "items", "from": 0, "to": 2, "items_number": 1},
            {"type": "mycroft.session.list.remove", "namespace": ns, "property": "items", "position": 0, "items_number": 1},
        ]
    )
    assert state.namespaces[ns].data["items"] == [3, 1]


def test_page_list_move_remove_and_focus():
    ns = "skill.y"
    pages = [{"url": None, "page": name} for name in ("a", "b", "c")]
    state = replay(
        [
            {"type": "mycroft.session.list.insert", "namespace": ACTIVE_SKILLS, "position": 0, "data": [{"skill_id": ns}]},
            {"type": "mycroft.gui.list.insert", "namespace": ns, "position": 0, "data": pages},
            {"type": "mycroft.events.triggered", "namespace": ns, "event_name": "page_gained_focus", "data": {"number": 2}},
            {"type": "mycroft.gui.list.move", "namespace": ns, "from": 0, "to": 2, "items_number": 1},
        ]
    )
    assert state.namespaces[ns].pages == ["b", "c", "a"] and state.current() == (ns, "a")
    replay([{"type": "mycroft.gui.list.remove", "namespace": ns, "position": 2, "items_number": 1}], state)
    assert state.current() == (ns, "c")


def test_active_skill_move_and_session_delete():
    insert = {"type": "mycroft.session.list.insert", "namespace": ACTIVE_SKILLS, "position": 0}
    state = replay(
        [
            {**insert, "data": [{"skill_id": "a"}]},
            {**insert, "data": [{"skill_id": "b"}]},
            {"type": "mycroft.session.list.move", "namespace": ACTIVE_SKILLS, "from": 1, "to": 0, "items_number": 1},
            {"type": "mycroft.session.set", "namespace": "a", "data": {"k": {"nested": [1]}}},
            {"type": "mycroft.session.delete", "namespace": "a", "property": "missing"},
        ]
    )
    assert state.active == ["a", "b"] and state.namespaces["a"].data == {"k": {"nested": [1]}}


def test_unknown_and_malformed_messages_are_logged_not_applied(caplog):
    state = GuiState()
    assert not state.apply({"type": "mycroft.gui.bogus", "namespace": "x"})
    assert not state.apply({"type": "mycroft.session.set", "namespace": "x"})
    assert "unknown GUI message" in caplog.text and "malformed GUI message" in caplog.text


def test_snapshot_and_reset():
    state = replay(load_fixture("boot_sync_idle.jsonl"))
    snapshot = state.snapshot()
    assert snapshot["active"] == [IDLE_NAMESPACE] and snapshot["namespaces"][IDLE_NAMESPACE]["pages"] == ["idle"]
    state.reset()
    assert state.snapshot()["namespaces"] == {} and state.current() is None
