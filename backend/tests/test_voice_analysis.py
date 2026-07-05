"""Voice/multimodal analysis tests for MindEcho.

Focus: verify the fix in transcribe_audio() (open file handle passed to
litellm.atranscription) no longer produces 500/Cloudflare errors.
"""
import io
import os
import time
import uuid
import wave
import struct
import math
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://emotion-detect-ai-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- audio helpers ----------
def make_silent_wav(seconds: float = 1.5, sample_rate: int = 16000) -> bytes:
    """Return a mono 16-bit PCM WAV of pure silence (no speech)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        n = int(seconds * sample_rate)
        w.writeframes(b"\x00\x00" * n)
    return buf.getvalue()


def make_tone_wav(seconds: float = 1.5, freq: int = 440, sample_rate: int = 16000) -> bytes:
    """Return a mono 16-bit PCM WAV containing a pure sine tone (no speech)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        n = int(seconds * sample_rate)
        for i in range(n):
            val = int(0.4 * 32767 * math.sin(2 * math.pi * freq * i / sample_rate))
            w.writeframesraw(struct.pack("<h", val))
    return buf.getvalue()


def make_speech_mp3(text: str = "I am feeling really stressed and overwhelmed today.") -> bytes:
    """Generate a small MP3 with real spoken text via gTTS."""
    from gtts import gTTS
    tts = gTTS(text=text, lang="en")
    buf = io.BytesIO()
    tts.write_to_fp(buf)
    return buf.getvalue()


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def auth(session):
    email = f"qa-voice+{int(time.time())}-{uuid.uuid4().hex[:6]}@mindecho.dev"
    r = session.post(f"{API}/auth/register", json={"name": "QA Voice", "email": email, "password": "password123"}, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    return {"email": email, "token": body["token"], "user": body["user"]}


@pytest.fixture(scope="module")
def headers(auth):
    return {"Authorization": f"Bearer {auth['token']}"}


@pytest.fixture(scope="module")
def speech_mp3_bytes():
    try:
        data = make_speech_mp3("I am feeling really stressed and overwhelmed today, my heart is racing.")
    except Exception as e:
        pytest.skip(f"Could not synthesize TTS audio (no network for gTTS): {e}")
    assert len(data) > 500, "TTS output suspiciously small"
    return data


# ---------- tests ----------
class TestVoiceAnalyze:
    """POST /api/analyze/voice"""

    voice_id = None

    def test_voice_with_real_speech_returns_200(self, session, headers, speech_mp3_bytes):
        files = {"file": ("speech.mp3", speech_mp3_bytes, "audio/mpeg")}
        r = session.post(f"{API}/analyze/voice", headers=headers, files=files, timeout=90)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:500]}"
        body = r.json()
        # schema
        for k in ["id", "modality", "stress_level", "probability", "label",
                  "transcript", "key_features", "highlighted_words",
                  "explanation", "recommendation"]:
            assert k in body, f"missing key: {k}"
        assert body["modality"] == "voice"
        assert body["stress_level"] in {"Low", "Medium", "High"}
        assert 0.0 <= body["probability"] <= 1.0
        assert body["label"] in {"Stress", "No Stress"}
        assert isinstance(body["transcript"], str) and body["transcript"].strip(), "transcript must be non-empty string"
        assert isinstance(body["key_features"], list)
        assert isinstance(body["highlighted_words"], list)
        assert '"_id"' not in r.text
        TestVoiceAnalyze.voice_id = body["id"]

    def test_voice_unsupported_extension_not_500(self, session, headers):
        """Server should normalise unsupported extension and either transcribe or fail cleanly (never 500)."""
        junk = b"this is not audio at all, plain text bytes"
        files = {"file": ("notes.txt", junk, "text/plain")}
        r = session.post(f"{API}/analyze/voice", headers=headers, files=files, timeout=60)
        assert r.status_code != 500, f"got 500: {r.text[:500]}"
        # acceptable: 400 (no speech) or 502 (transcription failed) or 4xx generally
        assert r.status_code in (400, 415, 422, 502), f"unexpected status {r.status_code}: {r.text[:300]}"

    def test_voice_silence_returns_400_not_500(self, session, headers):
        """Silent WAV must NOT crash the server (not a 500 / Cloudflare 520)."""
        wav = make_silent_wav(seconds=1.5)
        files = {"file": ("silence.wav", wav, "audio/wav")}
        r = session.post(f"{API}/analyze/voice", headers=headers, files=files, timeout=60)
        # main assertion: no 500
        assert r.status_code != 500, f"server crashed on silence: {r.text[:500]}"
        # Whisper often returns empty/whitespace/hallucinated ' you' on silence.
        # If empty transcript -> 400 'No speech detected'. If it hallucinates -> 200.
        assert r.status_code in (200, 400), f"unexpected status {r.status_code}: {r.text[:300]}"
        if r.status_code == 400:
            assert "No speech detected" in r.text, r.text[:200]


class TestMultimodal:
    """POST /api/analyze/multimodal"""

    def test_multimodal_returns_200_with_both_probs(self, session, headers, speech_mp3_bytes):
        data = {"text": "I feel anxious and can't focus. My chest is tight and I feel dread."}
        files = {"file": ("speech.mp3", speech_mp3_bytes, "audio/mpeg")}
        r = session.post(f"{API}/analyze/multimodal", headers=headers, data=data, files=files, timeout=120)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:500]}"
        body = r.json()
        assert body["modality"] == "multimodal"
        assert body["voice_probability"] is not None
        assert body["text_probability"] is not None
        assert 0.0 <= body["voice_probability"] <= 1.0
        assert 0.0 <= body["text_probability"] <= 1.0
        assert 0.0 <= body["probability"] <= 1.0
        assert isinstance(body["transcript"], str) and body["transcript"].strip()
        assert body["original_text"] == data["text"]
        assert '"_id"' not in r.text


class TestVoiceInHistory:
    """GET /api/history must include the voice entry."""

    def test_history_contains_voice_entry(self, session, headers):
        assert TestVoiceAnalyze.voice_id, "voice test must have created an entry first"
        r = session.get(f"{API}/history", headers=headers, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        match = next((i for i in items if i["id"] == TestVoiceAnalyze.voice_id), None)
        assert match is not None, "voice entry not found in history"
        assert match["modality"] == "voice"
        assert isinstance(match.get("transcript"), str) and match["transcript"].strip()
        assert '"_id"' not in r.text
