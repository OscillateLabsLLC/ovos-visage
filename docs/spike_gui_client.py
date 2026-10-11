"""Throwaway GUI-protocol client: announce a non-Qt framework and log everything.

Usage: python gui_spike_client.py [framework] [seconds]
"""
import json
import sys
import time
import threading

from websocket import WebSocketApp, create_connection

FRAMEWORK = sys.argv[1] if len(sys.argv) > 1 else "html"
DURATION = int(sys.argv[2]) if len(sys.argv) > 2 else 60
GUI_ID = "spike-client"
CORE_BUS = "ws://127.0.0.1:8181/core"

port_holder = {}


def on_core_message(ws, raw):
    msg = json.loads(raw)
    if msg.get("type") == "mycroft.gui.port":
        print(f"[core] mycroft.gui.port -> {msg['data']}", flush=True)
        port_holder.update(msg["data"])


def announce(ws):
    payload = {"type": "mycroft.gui.connected",
               "data": {"gui_id": GUI_ID, "framework": FRAMEWORK}}
    ws.send(json.dumps(payload))
    print(f"[core] sent mycroft.gui.connected framework={FRAMEWORK}", flush=True)


core = WebSocketApp(CORE_BUS, on_message=on_core_message, on_open=announce)
threading.Thread(target=core.run_forever, daemon=True).start()

deadline = time.time() + 10
while "port" not in port_holder and time.time() < deadline:
    time.sleep(0.1)
if "port" not in port_holder:
    sys.exit("no mycroft.gui.port reply within 10s")

gui = create_connection(f"ws://127.0.0.1:{port_holder['port']}/gui")
print(f"[gui] connected on {port_holder['port']}", flush=True)
gui.send(json.dumps({"type": "mycroft.gui.connected", "gui_id": GUI_ID, "framework": FRAMEWORK}))
print(f"[gui] sent mycroft.gui.connected on the GUI socket framework={FRAMEWORK}", flush=True)
gui.settimeout(1)
end = time.time() + DURATION
while time.time() < end:
    try:
        raw = gui.recv()
    except Exception:
        continue
    msg = json.loads(raw)
    kind = msg.get("type")
    if kind == "mycroft.gui.list.insert":
        print(f"[gui] {kind} ns={msg.get('namespace')} pos={msg.get('position')} "
              f"data={msg.get('data')}", flush=True)
    elif kind == "mycroft.session.set":
        keys = list((msg.get("data") or {}).keys())
        print(f"[gui] {kind} ns={msg.get('namespace')} keys={keys}", flush=True)
    else:
        print(f"[gui] {json.dumps(msg)[:300]}", flush=True)
