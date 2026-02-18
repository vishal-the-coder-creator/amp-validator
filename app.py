import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, request, send_from_directory

APP_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = APP_DIR / "public"

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")


FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_html(url: str) -> str:
    r = requests.get(url, headers=FETCH_HEADERS, timeout=20, allow_redirects=True)
    if r.status_code < 200 or r.status_code >= 400:
        raise ValueError(f"HTTP {r.status_code}: {r.reason}")

    content_type = (r.headers.get("content-type") or "").lower()
    if "text/html" not in content_type and "application/xhtml" not in content_type:
        raise ValueError(f"URL did not return HTML (Content-Type: {content_type}).")

    return r.text


def run_amp_validator(html: str, html_format: str = "AMP") -> dict:
    """
    Runs the Node helper (amp_validate.js) and returns parsed JSON output.
    """
    node_script = APP_DIR / "amp_validate.js"
    if not node_script.exists():
        raise RuntimeError("Missing amp_validate.js. Please keep it in the project root.")

    proc = subprocess.run(
        ["node", str(node_script), html_format],
        input=html,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=30,
    )

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()

    if proc.returncode == 0 and out:
        return json.loads(out)

    # Prefer JSON error from stderr if present
    if err:
        try:
            j = json.loads(err)
            raise RuntimeError(j.get("error") or err)
        except json.JSONDecodeError:
            raise RuntimeError(err)

    raise RuntimeError(f"Validator failed (exit {proc.returncode}).")


def split_errors(errors: list[dict]) -> tuple[list[dict], list[dict]]:
    warnings = [e for e in errors if e.get("severity") == "WARNING"]
    fatal = [e for e in errors if e.get("severity") != "WARNING"]
    return fatal, warnings


@app.get("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/api/test")
def api_test():
    # Minimal valid AMP document for a PASS result.
    test_html = """<!doctype html>
<html amp lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
    <link rel="canonical" href="https://example.com/">
    <title>AMP Validator Test</title>
    <script async src="https://cdn.ampproject.org/v0.js"></script>
    <style amp-boilerplate>
      body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}
      @-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}
      @-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}
      @-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}
      @-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}
      @keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}
    </style>
    <noscript>
      <style amp-boilerplate>
        body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}
      </style>
    </noscript>
  </head>
  <body>
    <h1>Hello AMP</h1>
  </body>
</html>"""
    result = run_amp_validator(test_html, "AMP")
    return jsonify(
        {
            "success": True,
            "message": "Validator is working (python backend + local validator file)",
            "testResult": result.get("status"),
            "errors": len(result.get("errors") or []),
        }
    )


@app.post("/api/validate")
def api_validate():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"success": False, "error": "Please provide a valid URL."}), 400

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return jsonify({"success": False, "error": "URL must use http or https."}), 400

    fetch_url = url
    try:
        html = fetch_html(fetch_url)
    except Exception as e:
        # HTTP -> HTTPS fallback
        if parsed.scheme == "http":
            https_url = "https://" + parsed.netloc + (parsed.path or "") + (("?" + parsed.query) if parsed.query else "")
            try:
                html = fetch_html(https_url)
                fetch_url = https_url
            except Exception as e2:
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": f"Failed to fetch URL. HTTP error: {str(e)}. HTTPS error: {str(e2)}",
                            "url": url,
                        }
                    ),
                    422,
                )
        else:
            return jsonify({"success": False, "error": str(e), "url": url}), 422

    try:
        v = run_amp_validator(html, "AMP")
    except Exception as e:
        return jsonify({"success": False, "error": f"Validation failed: {str(e)}", "url": fetch_url}), 500

    errors = v.get("errors") or []
    fatal, warnings = split_errors(errors)
    status = v.get("status") or "UNKNOWN"
    valid = status == "PASS"

    return jsonify(
        {
            "success": True,
            "url": fetch_url,
            "valid": valid,
            "status": status,
            "errors": fatal,
            "warnings": warnings,
            "fixSuggestions": [
                {
                    "message": e.get("message"),
                    "location": (f"Line {e.get('line')}, column {e.get('col')}" if e.get("line") else None),
                    "specUrl": e.get("specUrl"),
                    "howToFix": "Open the specification link below for the official fix."
                    if e.get("specUrl")
                    else "Review the error message and adjust your AMP HTML accordingly.",
                }
                for e in fatal
            ],
        }
    )


if __name__ == "__main__":
    # Run: py app.py
    # Disable the reloader to avoid confusing parent/child processes on Windows.
    app.run(host="127.0.0.1", port=3000, debug=True, use_reloader=False)

