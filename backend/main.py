import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from .orchestrator import Orchestrator

load_dotenv()

app = FastAPI(title="AetherMind: Smart Reasoning Engine")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SaveSessionRequest(BaseModel):
    id: str
    problem: str
    topology: str
    timestamp: str
    final_output: str
    steps: list

SESSIONS_FILE = os.path.join(os.path.dirname(__file__), "sessions.json")

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

@app.post("/api/sessions")
async def save_session(session: SaveSessionRequest):
    sessions = load_sessions()
    # Filter out duplicate ID if saving again
    sessions = [s for s in sessions if s.get("id") != session.id]
    sessions.insert(0, session.model_dump())
    # Limit history to 30 items
    save_sessions(sessions[:30])
    return {"status": "ok"}

@app.get("/api/sessions")
async def get_sessions():
    return load_sessions()

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    sessions = load_sessions()
    sessions = [s for s in sessions if s.get("id") != session_id]
    save_sessions(sessions)
    return {"status": "ok"}

@app.get("/api/reason")
async def run_reasoning(
    problem: str,
    topology: str = "cot",
    depth: int = 5,
    api_key: str = "",
    model: str = "gemini-2.5-flash"
):
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=400, 
            detail="Gemini API Key is missing. Please enter your API Key in the UI settings or configure it in the server environment variables."
        )
    
    # Initialize orchestrator
    orchestrator = Orchestrator(api_key=key, model_name=model)
    return StreamingResponse(
        orchestrator.stream_reason(problem, topology, depth),
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
