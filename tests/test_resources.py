from ovos_visage.resources import PathRewriter, resolve_under


def test_rewrites_cache_paths_recursively(tmp_path):
    rewriter = PathRewriter(tmp_path)
    icon = tmp_path / "ovos-skill-weather.openvoiceos" / "qt5" / "images" / "sun.svg"
    message = {
        "data": {"weatherCondition": str(icon), "forecast": {"all": [{"img": f"file://{icon}"}]}},
        "position": 0,
    }
    rewritten = rewriter.rewrite(message)
    assert rewritten["data"]["weatherCondition"] == "/res/ovos-skill-weather.openvoiceos/qt5/images/sun.svg"
    assert rewritten["data"]["forecast"]["all"][0]["img"] == rewritten["data"]["weatherCondition"]
    assert rewritten["position"] == 0


def test_leaves_urls_text_and_outside_paths_alone(tmp_path, caplog):
    rewriter = PathRewriter(tmp_path)
    for value in ("https://example.com/a.png", "data:image/png;base64,AAAA", "22:15", "/res/x.svg", "/etc/passwd"):
        assert rewriter.rewrite(value) == value
    assert rewriter.rewrite("/etc/somewhere/cover.png") == "/etc/somewhere/cover.png"
    assert "outside the ovos-gui cache" in caplog.text


def test_resolve_under_refuses_traversal_and_missing(tmp_path):
    (tmp_path / "ns").mkdir()
    (tmp_path / "ns" / "a.svg").write_text("<svg/>")
    assert resolve_under(tmp_path, "ns/a.svg") == (tmp_path / "ns" / "a.svg").resolve()
    assert resolve_under(tmp_path, "../etc/passwd") is None
    assert resolve_under(tmp_path, "ns/missing.svg") is None
    assert resolve_under(tmp_path, "ns") is None
