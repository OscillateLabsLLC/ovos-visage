"""ovos-gui reorders its active stack without telling clients when it re-shows a namespace that has no pages.

Recorded live (tests/fixtures/ovosgui_silent_reorder.jsonl): OCP lost its last page, a template sample was shown,
then OCP showed new pages. ovos-gui moved OCP to the front (namespace.py _activate_namespace) but sent no
session.list.move because Namespace.activate returns early without pages. Its next `list.remove position 1` meant the
template namespace; a client that does not follow the silent move removes OCP instead and keeps a stale page up.
"""

from ovos_visage.state import ACTIVE_SKILLS, IDLE_NAMESPACE
from tests.conftest import load_fixture
from tests.test_state import replay

OCP = "ovos.common_play"
ACTIVE_INSERT = {"type": "mycroft.session.list.insert", "namespace": ACTIVE_SKILLS}


def pages(namespace, *names, position=0):
    return {
        "type": "mycroft.gui.list.insert",
        "namespace": namespace,
        "position": position,
        "data": [{"url": None, "page": n} for n in names],
    }


def test_recorded_sequence_ends_where_the_server_ended():
    state = replay(load_fixture("ovosgui_silent_reorder.jsonl"))
    # Server truth at the end of the recording (a fresh GUI connection's sync showed the same stack): the shared
    # template namespace is gone and OCP kept. image-http has entered the stack but its page arrives after the cut.
    assert state.active == ["visage-templates-image-http", OCP, IDLE_NAMESPACE]
    assert state.namespaces["visage-templates"].pages == []
    assert state.current() == (OCP, "PlayerLoader")


def test_silent_front_move_is_followed_then_positional_remove_hits_the_right_namespace():
    state = replay(
        [
            {**ACTIVE_INSERT, "position": 0, "data": [{"skill_id": OCP}]},
            pages(OCP, "busy"),
            {**ACTIVE_INSERT, "position": 1, "data": [{"skill_id": IDLE_NAMESPACE}]},
            pages(IDLE_NAMESPACE, "idle"),
            {**ACTIVE_INSERT, "position": 0, "data": [{"skill_id": "skill.t"}]},
            pages("skill.t", "SYSTEM_TextFrame"),
            {"type": "mycroft.gui.list.remove", "namespace": OCP, "position": 0, "items_number": 1},
            pages(OCP, "PlayerLoader"),
        ]
    )
    assert state.active == [OCP, "skill.t", IDLE_NAMESPACE]
    replay([{"type": "mycroft.session.list.remove", "namespace": ACTIVE_SKILLS, "position": 1, "items_number": 1}], state)
    assert state.active == [OCP, IDLE_NAMESPACE] and state.current() == (OCP, "PlayerLoader")


def test_sync_replay_and_new_namespaces_keep_their_positions():
    state = replay(
        [
            {**ACTIVE_INSERT, "position": 0, "data": [{"skill_id": OCP}]},
            pages(OCP, "busy"),
            {**ACTIVE_INSERT, "position": 1, "data": [{"skill_id": IDLE_NAMESPACE}]},
            pages(IDLE_NAMESPACE, "idle"),
        ]
    )
    assert state.active == [OCP, IDLE_NAMESPACE]
    replay([pages(OCP, "PlayerLoader", position=1)], state)
    assert state.active == [OCP, IDLE_NAMESPACE] and state.namespaces[OCP].pages == ["busy", "PlayerLoader"]
