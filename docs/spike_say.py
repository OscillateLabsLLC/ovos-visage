"""Inject an utterance onto the core bus. Usage: python say.py "what time is it" """
import json
import sys

from websocket import create_connection

ws = create_connection("ws://127.0.0.1:8181/core")
ws.send(json.dumps({"type": "recognizer_loop:utterance",
                    "data": {"utterances": [sys.argv[1]], "lang": "en-us"},
                    "context": {"source": "spike", "destination": ["skills"]}}))
ws.close()
print("sent:", sys.argv[1])
