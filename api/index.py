"""Vercel serverless entrypoint: exposes the FastAPI app from backend/.

vercel.json rewrites /api/<x> to /api/index?__path=<x>; the wrapper below restores the
original path so FastAPI routes (/api/...) match.
"""
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app as fastapi_app  # noqa: E402


async def app(scope, receive, send):
    if scope["type"] == "http":
        params = dict(parse_qsl(scope.get("query_string", b"").decode()))
        original = params.pop("__path", None)
        if original is not None:
            scope = {**scope, "path": f"/api/{original}", "raw_path": f"/api/{original}".encode(),
                     "query_string": urlencode(params).encode()}
    await fastapi_app(scope, receive, send)
