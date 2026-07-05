"""MindEcho backend API tests: auth, text analysis, history, stats."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://emotion-detect-ai-4.preview.emergentagent.com"
API = f"{BASE_URL}/api"

STRESSFUL_TEXT = (
    "I feel completely overwhelmed and terrified about my final exams. I can't sleep, "
    "my heart races, I keep panicking and crying every night, and I'm sure I'm going to fail everything."
)
CALM_TEXT = (
    "It was a lovely, quiet Sunday. I had a warm cup of tea by the window, read a few pages of my book, "
    "and took a peaceful walk in the park. Everything feels balanced and gentle."
)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def fresh_user(session):
    email = f"qa+{int(time.time())}-{uuid.uuid4().hex[:6]}@mindecho.dev"
    payload = {"name": "QA Bot", "email": email, "password": "password123"}
    r = session.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and "user" in body
    assert body["user"]["email"] == email
    assert body["user"]["id"]
    assert "password" not in body["user"] and "password_hash" not in body["user"]
    return {"email": email, "password": "password123", "token": body["token"], "user": body["user"]}


@pytest.fixture(scope="module")
def auth_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}", "Content-Type": "application/json"}


# -------- health --------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# -------- auth --------
class TestAuth:
    def test_login_existing_seed_user(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "test@mindecho.dev", "password": "password123"}, timeout=20)
        # If seed user is missing, skip rather than fail (register instead)
        if r.status_code == 401:
            pytest.skip("Seed user not present; skipping login-with-seed test")
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_wrong_password(self, session, fresh_user):
        r = session.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": "wrongpass"}, timeout=20)
        assert r.status_code == 401

    def test_login_correct_password(self, session, fresh_user):
        r = session.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": fresh_user["password"]}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == fresh_user["email"]
        assert "token" in body

    def test_register_short_password_rejected(self, session):
        r = session.post(f"{API}/auth/register", json={"name": "x", "email": f"x{uuid.uuid4().hex[:6]}@t.com", "password": "123"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_register_duplicate_email(self, session, fresh_user):
        r = session.post(f"{API}/auth/register", json={"name": "dup", "email": fresh_user["email"], "password": "password123"}, timeout=15)
        assert r.status_code == 400

    def test_me_requires_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code in (401, 403)

    def test_me_with_token(self, session, auth_headers, fresh_user):
        r = session.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == fresh_user["email"]
        assert body["id"] == fresh_user["user"]["id"]
        assert '"_id"' not in r.text


# -------- text analysis --------
class TestTextAnalysis:
    stressful_id = None
    calm_id = None
    stressful_prob = None
    calm_prob = None

    def test_analyze_stressful_text(self, session, auth_headers):
        r = session.post(f"{API}/analyze/text", headers=auth_headers, json={"text": STRESSFUL_TEXT}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ["id", "modality", "stress_level", "probability", "label", "key_features", "highlighted_words", "explanation", "recommendation"]:
            assert k in body, f"missing key {k}"
        assert body["modality"] == "text"
        assert body["stress_level"] in {"Low", "Medium", "High"}
        assert 0.0 <= body["probability"] <= 1.0
        assert body["label"] in {"Stress", "No Stress"}
        assert isinstance(body["key_features"], list)
        assert isinstance(body["highlighted_words"], list)
        assert '"_id"' not in r.text
        TestTextAnalysis.stressful_id = body["id"]
        TestTextAnalysis.stressful_prob = body["probability"]

    def test_analyze_calm_text(self, session, auth_headers):
        r = session.post(f"{API}/analyze/text", headers=auth_headers, json={"text": CALM_TEXT}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["modality"] == "text"
        assert 0.0 <= body["probability"] <= 1.0
        TestTextAnalysis.calm_id = body["id"]
        TestTextAnalysis.calm_prob = body["probability"]

    def test_stressful_prob_greater_than_calm(self):
        assert TestTextAnalysis.stressful_prob is not None and TestTextAnalysis.calm_prob is not None
        assert TestTextAnalysis.stressful_prob > TestTextAnalysis.calm_prob, (
            f"stressful={TestTextAnalysis.stressful_prob} calm={TestTextAnalysis.calm_prob}"
        )

    def test_analyze_requires_auth(self, session):
        r = session.post(f"{API}/analyze/text", json={"text": "hello"}, timeout=15)
        assert r.status_code in (401, 403)


# -------- history --------
class TestHistory:
    def test_history_list_reverse_chrono(self, session, auth_headers):
        r = session.get(f"{API}/history", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 2
        assert '"_id"' not in r.text
        # reverse chrono
        created = [i["created_at"] for i in items]
        assert created == sorted(created, reverse=True), "history not in reverse chronological order"
        # last created (stressful was second call so calm is most recent)
        assert items[0]["id"] == TestTextAnalysis.calm_id

    def test_history_detail(self, session, auth_headers):
        aid = TestTextAnalysis.stressful_id
        r = session.get(f"{API}/history/{aid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == aid
        assert '"_id"' not in r.text

    def test_history_detail_404(self, session, auth_headers):
        r = session.get(f"{API}/history/does-not-exist-{uuid.uuid4().hex[:6]}", headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_delete_history(self, session, auth_headers):
        aid = TestTextAnalysis.calm_id
        r = session.delete(f"{API}/history/{aid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted") is True
        # verify gone
        r2 = session.get(f"{API}/history/{aid}", headers=auth_headers, timeout=15)
        assert r2.status_code == 404


# -------- stats --------
class TestStats:
    def test_stats_shape(self, session, auth_headers):
        r = session.get(f"{API}/stats", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ["total", "stressed_count", "stress_percentage", "by_level", "weekly"]:
            assert k in body
        assert set(body["by_level"].keys()) == {"Low", "Medium", "High"}
        assert isinstance(body["weekly"], list) and len(body["weekly"]) == 7
        for w in body["weekly"]:
            assert set(w.keys()) >= {"day_offset", "avg_probability", "count"}
        assert body["total"] >= 1  # still have stressful entry
        assert '"_id"' not in r.text
