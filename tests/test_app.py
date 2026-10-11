from ovos_visage import __version__
from ovos_visage.app import build_parser, default_gui_id


def test_version():
    assert __version__ == "0.1.0"


def test_cli_defaults():
    args = build_parser().parse_args([])
    assert args.http_port == 8766 and args.host == "127.0.0.1" and args.bus == "ws://127.0.0.1:8181/core"


def test_gui_ids_are_unique():
    assert default_gui_id() != default_gui_id()
