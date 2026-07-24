import time
import json
from flask import Flask, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow all origins; you can restrict later

def event_stream(payload):
     # Immediately send a "thinking" status
    yield f'data: {json.dumps({"type":"status","data":{"label":"Assistant is Thinking…","stage":"planning"},"ts":time.strftime("%Y-%m-%dT%H:%M:%S+00:00")})}\n\n'

    # Wait 5 seconds before starting actual streaming
    time.sleep(5)

    yield f'data: {json.dumps({"type":"delta","data":{"text":"🧭 Planner plan (debug)\n"},"ts":time.strftime("%Y-%m-%dT%H:%M:%S+00:00")})}\n\n'
    time.sleep(0.5)
    yield f'data: {json.dumps({"type":"status","data":{"label":"Composing answer…","stage":"responding"},"ts":time.strftime("%Y-%m-%dT%H:%M:%S+00:00")})}\n\n'
    time.sleep(0.5)

    chunks = [
        "-", " The", " application", " **", "AV", "AM", "ember", "**",
        " exists", " (", "as", " per", " the", " `", "application", "`",
        " label", ").\n", "-", " 1", " error", "-level", " log", " line",
        " from", " the", " last", " 1", " hour", " was", " found", " for",
        " AV", "AM", "ember", ".\n\n", "**", "Log", " line", " (", "ver",
        "batim", "):", "**\n", "```", "\n"
    ]

    for chunk in chunks:
        yield f'data: {json.dumps({"type":"delta","data":{"text":chunk},"ts":time.strftime("%Y-%m-%dT%H:%M:%S+00:00")})}\n\n'
        time.sleep(0.2)

@app.route("/stream_logs", methods=["POST"])
def stream_logs():
    payload = request.json
    return Response(event_stream(payload), mimetype="text/event-stream")

if __name__ == "__main__":
    app.run(debug=True, port=5000)
