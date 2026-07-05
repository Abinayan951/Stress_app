"""MindEcho backend: multimodal AI stress detection using Voice (Whisper) + Text (Claude)."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import uuid
import bcrypt
import jwt as pyjwt
import logging
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="MindEcho API")
api = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mindecho")


# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TextAnalyzeIn(BaseModel):
    text: str = Field(min_length=1)


class FusionIn(BaseModel):
    voice_prediction_id: Optional[str] = None
    text_prediction_id: Optional[str] = None
    text: Optional[str] = None  # if provided along with voice, do combined in-place


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    created_at: str


class AnalysisOut(BaseModel):
    id: str
    user_id: str
    modality: Literal["voice", "text", "multimodal"]
    stress_level: Literal["Low", "Medium", "High"]
    probability: float
    label: Literal["Stress", "No Stress"]
    transcript: Optional[str] = None
    original_text: Optional[str] = None
    key_features: List[str]
    highlighted_words: List[str]
    explanation: str
    recommendation: str
    voice_probability: Optional[float] = None
    text_probability: Optional[float] = None
    created_at: str


# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(cred: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = pyjwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload["sub"]
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def _iso(dt: Optional[datetime] = None) -> str:
    return (dt or datetime.now(timezone.utc)).isoformat()


def _fusion_from_prob(p: float) -> tuple[str, str]:
    if p < 0.34:
        return "Low", "No Stress"
    if p < 0.67:
        return "Medium", "Stress"
    return "High", "Stress"


# ---------- LLM analysis ----------
STRESS_SYSTEM_PROMPT = (
    "You are a clinical psychology assistant specialized in stress detection from human language. "
    "Analyze the given input and return STRICT JSON only (no markdown fences, no commentary) with keys: "
    "probability (float 0-1, higher = more stress), "
    "key_features (array of 3-5 short strings describing signals you detected), "
    "highlighted_words (array of up to 10 exact words/phrases from the input that indicate stress), "
    "explanation (1-2 short sentences in plain language explaining the prediction), "
    "recommendation (1 short caring sentence with an actionable tip). "
    "Be honest: neutral or positive text should return low probability (< 0.3)."
)


async def analyze_with_claude(text: str, modality: str, extra_context: str = "") -> dict:
    session_id = f"stress-{uuid.uuid4()}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=STRESS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-6")

    prompt = (
        f"Modality: {modality}\n"
        f"{extra_context}\n"
        f"Input:\n{text}\n\n"
        "Respond with the JSON object only."
    )
    resp = await chat.send_message(UserMessage(text=prompt))
    raw = resp if isinstance(resp, str) else str(resp)
    # Strip possible code fences
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
    # Find JSON
    try:
        start = raw.index("{")
        end = raw.rindex("}") + 1
        raw = raw[start:end]
        data = json.loads(raw)
    except Exception as e:
        log.error("LLM JSON parse fail: %s | raw=%s", e, raw[:400])
        data = {
            "probability": 0.5,
            "key_features": ["Unable to fully analyze"],
            "highlighted_words": [],
            "explanation": "The analyzer returned an unexpected format; a neutral baseline was used.",
            "recommendation": "Try again with a clearer message.",
        }
    # Sanitize
    p = float(data.get("probability", 0.5))
    p = max(0.0, min(1.0, p))
    return {
        "probability": p,
        "key_features": list(data.get("key_features", []))[:5],
        "highlighted_words": list(data.get("highlighted_words", []))[:10],
        "explanation": str(data.get("explanation", ""))[:400],
        "recommendation": str(data.get("recommendation", ""))[:300],
    }


async def transcribe_audio(path: str) -> str:
    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    resp = await stt.transcribe(file=path, model="whisper-1", response_format="json")
    # litellm returns object with .text
    if hasattr(resp, "text"):
        return resp.text
    if isinstance(resp, dict):
        return resp.get("text", "")
    return str(resp)


# ---------- Routes ----------
@api.get("/")
async def root():
    return {"service": "MindEcho", "status": "ok"}


@api.post("/auth/register")
async def register(data: RegisterIn):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    user_doc = {
        "id": uid,
        "name": data.name.strip(),
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "created_at": _iso(),
    }
    await db.users.insert_one(user_doc)
    token = make_token(uid)
    return {
        "token": token,
        "user": {"id": uid, "name": user_doc["name"], "email": user_doc["email"], "created_at": user_doc["created_at"]},
    }


@api.post("/auth/login")
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
        },
    }


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(current_user)):
    return UserOut(id=user["id"], name=user["name"], email=user["email"], created_at=user["created_at"])


@api.post("/analyze/text")
async def analyze_text(data: TextAnalyzeIn, user=Depends(current_user)):
    result = await analyze_with_claude(data.text, "text")
    level, label = _fusion_from_prob(result["probability"])
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "modality": "text",
        "stress_level": level,
        "probability": result["probability"],
        "label": label,
        "original_text": data.text,
        "transcript": None,
        "key_features": result["key_features"],
        "highlighted_words": result["highlighted_words"],
        "explanation": result["explanation"],
        "recommendation": result["recommendation"],
        "voice_probability": None,
        "text_probability": result["probability"],
        "created_at": _iso(),
    }
    await db.analyses.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.post("/analyze/voice")
async def analyze_voice(file: UploadFile = File(...), user=Depends(current_user)):
    # Save to a temp file preserving extension
    suffix = Path(file.filename or "audio.m4a").suffix.lower() or ".m4a"
    allowed = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"}
    if suffix not in allowed:
        suffix = ".m4a"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        content = await file.read()
        tmp.write(content)
        tmp.flush()
        tmp.close()
        try:
            transcript = await transcribe_audio(tmp.name)
        except Exception as e:
            log.exception("Whisper failed")
            raise HTTPException(502, f"Transcription failed: {e}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    if not transcript or not transcript.strip():
        raise HTTPException(400, "No speech detected in audio")

    result = await analyze_with_claude(
        transcript,
        "voice",
        extra_context="This text was transcribed from a voice recording; also consider tone words and hesitations if present.",
    )
    level, label = _fusion_from_prob(result["probability"])
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "modality": "voice",
        "stress_level": level,
        "probability": result["probability"],
        "label": label,
        "original_text": None,
        "transcript": transcript,
        "key_features": result["key_features"],
        "highlighted_words": result["highlighted_words"],
        "explanation": result["explanation"],
        "recommendation": result["recommendation"],
        "voice_probability": result["probability"],
        "text_probability": None,
        "created_at": _iso(),
    }
    await db.analyses.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.post("/analyze/multimodal")
async def analyze_multimodal(
    text: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(current_user),
):
    """Combined: transcribe voice, analyze both, fuse with weighted average."""
    suffix = Path(file.filename or "audio.m4a").suffix.lower() or ".m4a"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(await file.read())
        tmp.flush()
        tmp.close()
        transcript = await transcribe_audio(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    voice_res = await analyze_with_claude(transcript or "", "voice")
    text_res = await analyze_with_claude(text, "text")
    # Weighted late fusion: text weight 0.6 (more explicit), voice 0.4
    fused_p = 0.4 * voice_res["probability"] + 0.6 * text_res["probability"]
    level, label = _fusion_from_prob(fused_p)

    # Merge features
    merged_features = (
        [f"[Voice] {f}" for f in voice_res["key_features"][:3]]
        + [f"[Text] {f}" for f in text_res["key_features"][:3]]
    )
    merged_words = list(dict.fromkeys(voice_res["highlighted_words"] + text_res["highlighted_words"]))[:10]

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "modality": "multimodal",
        "stress_level": level,
        "probability": fused_p,
        "label": label,
        "original_text": text,
        "transcript": transcript,
        "key_features": merged_features,
        "highlighted_words": merged_words,
        "explanation": (
            f"Multimodal fusion (voice 40%, text 60%). Voice: {voice_res['explanation']} "
            f"Text: {text_res['explanation']}"
        )[:500],
        "recommendation": text_res["recommendation"] or voice_res["recommendation"],
        "voice_probability": voice_res["probability"],
        "text_probability": text_res["probability"],
        "created_at": _iso(),
    }
    await db.analyses.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/history")
async def history(user=Depends(current_user), limit: int = 50):
    cur = db.analyses.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cur.to_list(length=limit)


@api.get("/history/{analysis_id}")
async def history_detail(analysis_id: str, user=Depends(current_user)):
    doc = await db.analyses.find_one({"id": analysis_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@api.delete("/history/{analysis_id}")
async def delete_history(analysis_id: str, user=Depends(current_user)):
    res = await db.analyses.delete_one({"id": analysis_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"deleted": True}


@api.get("/stats")
async def stats(user=Depends(current_user)):
    cur = db.analyses.find({"user_id": user["id"]}, {"_id": 0, "probability": 1, "stress_level": 1, "created_at": 1, "modality": 1})
    items = await cur.to_list(length=1000)
    total = len(items)
    stressed = sum(1 for i in items if i["stress_level"] != "Low")
    by_level = {"Low": 0, "Medium": 0, "High": 0}
    for i in items:
        by_level[i["stress_level"]] = by_level.get(i["stress_level"], 0) + 1
    # Last 7 days average probability per day
    now = datetime.now(timezone.utc).date()
    daily = {}
    for i in items:
        try:
            d = datetime.fromisoformat(i["created_at"].replace("Z", "+00:00")).date()
        except Exception:
            continue
        delta = (now - d).days
        if 0 <= delta < 7:
            daily.setdefault(delta, []).append(i["probability"])
    weekly = []
    for delta in range(6, -1, -1):
        vals = daily.get(delta, [])
        weekly.append({
            "day_offset": -delta,
            "avg_probability": round(sum(vals) / len(vals), 3) if vals else 0.0,
            "count": len(vals),
        })
    return {
        "total": total,
        "stressed_count": stressed,
        "stress_percentage": round((stressed / total) * 100, 1) if total else 0.0,
        "by_level": by_level,
        "weekly": weekly,
    }


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
