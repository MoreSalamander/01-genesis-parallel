"""Genesis OS — Signal Intelligence — standalone service entry point.

Run:  uvicorn app.main:app --reload   (or: python -m app.main)
Boots in MOCK mode with no credentials; LIVE integrations (Parallel Search API,
Gemini via google-genai) activate automatically from the environment.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.api.routes import router
from app.workflows.run_mission import get_runtime

app = FastAPI(
    title="Genesis OS — Signal Intelligence",
    description="External Intelligence for Convergence Studios (Parallel track).",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.on_event("startup")
def announce() -> None:
    print(get_runtime().settings.banner())


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    runtime = get_runtime()
    return f"""<!doctype html><html><head><title>Genesis OS — Signal Intelligence</title>
<style>body{{font-family:ui-monospace,monospace;background:#0b0e14;color:#d7dce5;margin:3rem}}
a{{color:#7aa2f7}} code{{color:#9ece6a}}</style></head><body>
<h1>GENESIS OS — SIGNAL INTELLIGENCE</h1>
<p>External Intelligence · Convergence Studios · Parallel track</p>
<p><code>{runtime.settings.banner()}</code></p>
<ul>
<li><a href="/docs">API docs</a></li>
<li><code>POST /api/missions</code> — start an intelligence mission</li>
<li><code>GET /api/missions/&lt;id&gt;</code> — evidence, claims, findings, recommendation</li>
<li><code>POST /api/missions/&lt;id&gt;/decision</code> — Studio Head authorization</li>
</ul>
<p>Studio Head console: <code>frontend/</code> (Next.js) — run <code>npm run dev</code> there.</p>
</body></html>"""


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
