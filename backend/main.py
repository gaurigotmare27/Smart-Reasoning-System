import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

try:
    from .orchestrator import Orchestrator
except ImportError:
    from orchestrator import Orchestrator

load_dotenv()

class SaveSessionRequest(BaseModel):
    id: str
    problem: str
    topology: str
    timestamp: str
    final_output: str
    steps: list

class ReasonRequest(BaseModel):
    problem: str
    topology: str = "cot"
    depth: int = 5
    api_key: str = ""
    model: str = "gemini-2.5-flash"
    temperature: float = 0.4
    prompt_decon: str = ""
    prompt_logic: str = ""
    prompt_critique: str = ""
    prompt_synth: str = ""

SESSIONS_FILE = os.path.join(os.path.dirname(__file__), "sessions.json")
_sessions_cache = []
_sessions_lock = asyncio.Lock()

def load_sessions():
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_sessions(sessions):
    try:
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(sessions, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving sessions: {str(e)}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _sessions_cache
    # Load sessions into cache on startup
    _sessions_cache = await asyncio.to_thread(load_sessions)
    yield

app = FastAPI(title="AetherMind: Smart Reasoning Engine", lifespan=lifespan)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/sessions")
async def save_session(session: SaveSessionRequest):
    global _sessions_cache
    async with _sessions_lock:
        # Filter out duplicate ID if saving again
        _sessions_cache = [s for s in _sessions_cache if s.get("id") != session.id]
        _sessions_cache.insert(0, session.model_dump())
        # Limit history to 30 items
        _sessions_cache = _sessions_cache[:30]
        # Write to disk asynchronously in a background thread
        await asyncio.to_thread(save_sessions, _sessions_cache)
    return {"status": "ok"}

@app.get("/api/sessions")
async def get_sessions():
    return _sessions_cache

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    global _sessions_cache
    async with _sessions_lock:
        _sessions_cache = [s for s in _sessions_cache if s.get("id") != session_id]
        await asyncio.to_thread(save_sessions, _sessions_cache)
    return {"status": "ok"}

@app.post("/api/reason")
async def run_reasoning(request: ReasonRequest):
    key = request.api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=400, 
            detail="Gemini API Key is missing. Please enter your API Key in the UI settings or configure it in the server environment variables."
        )
    
    # Initialize orchestrator
    orchestrator = Orchestrator(
        api_key=key, 
        model_name=request.model,
        temperature=request.temperature,
        prompt_decon=request.prompt_decon,
        prompt_logic=request.prompt_logic,
        prompt_critique=request.prompt_critique,
        prompt_synth=request.prompt_synth
    )
    return StreamingResponse(
        orchestrator.stream_reason(request.problem, request.topology, request.depth),
        media_type="text/event-stream"
    )

# Static file routing
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/style.css")
async def serve_style():
    return FileResponse(os.path.join(FRONTEND_DIR, "style.css"))

@app.get("/app.js")
async def serve_js():
    return FileResponse(os.path.join(FRONTEND_DIR, "app.js"))

