# MindEcho — Multimodal AI Stress Detection

## Overview
Mobile journaling app that predicts a user's stress level from voice recordings and/or text notes,
fuses both modalities, and produces an explainable, downloadable report. Built as a substitute for
the MCA research project "Multimodal AI-Based Stress Detection Using Voice and Text Analysis".

## Stack (mapped to the requested Flask/React/SQLite stack)
- Frontend: Expo React Native (SDK 54, expo-router) — replaces React web
- Backend: FastAPI + MongoDB (motor) — replaces Flask + SQLite (JSON-only responses, prefix `/api`)
- Auth: JWT (email + bcrypt password)
- Voice model: OpenAI Whisper-1 (speech-to-text) via Emergent proxy
- Text/multimodal model: Anthropic Claude Sonnet 4.6 via Emergent proxy — structured JSON output
- Multimodal fusion: weighted late fusion (voice 40% + text 60%)
- Explainability: LLM returns `key_features` (audio + language cues) + `highlighted_words` (LIME-style token highlighting rendered in the transcript)
- Reports: on-device HTML → PDF via `expo-print`, shared via `expo-sharing`

## Screens
- `/auth/login`, `/auth/register` (JWT auth)
- `/(tabs)/dashboard` — hero card with latest prediction, quick actions, weekly bar chart, level distribution
- `/(tabs)/voice` — mic record button with pulse animation, Whisper transcription, XAI results
- `/(tabs)/text` — free-form journal input with suggested prompts
- `/(tabs)/history` — chronological timeline with modality filter chips
- `/result/[id]` — full analysis: level, fusion breakdown, "Why this prediction?" (Level 2 XAI), highlighted transcript (Level 3 XAI), gentle recommendation, PDF export
- `/profile` — user info & sign out

## Backend API (`/api` prefix)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `POST /analyze/text` — analyzes plain text
- `POST /analyze/voice` — multipart file → Whisper → Claude
- `POST /analyze/multimodal` — multipart file + text → fused prediction
- `GET /history`, `GET /history/{id}`, `DELETE /history/{id}`
- `GET /stats` — totals, stress %, level distribution, weekly averages

## Key Design Choices
- Personality 8 Hand-Drawn / Journal LIGHT theme (sage/olive + warm off-white)
- No blues/purples, generous spacing, serif display for calming, non-clinical feel
- 3-tier Explainability: level badge → plain-language features → per-word highlighting

## Integrations Used
- `emergentintegrations.llm.chat.LlmChat` (Anthropic Claude Sonnet 4.6)
- `emergentintegrations.llm.openai.speech_to_text.OpenAISpeechToText` (Whisper-1)
- Emergent Universal LLM Key (`EMERGENT_LLM_KEY`)

## Future Enhancements
- Server-side classical audio feature extraction (MFCC/pitch/energy) via a lightweight FastAPI worker
- Dedicated CNN+LSTM voice model + BERT text model deployed to a GPU inference endpoint
- SHAP/LIME per-feature contribution charts once the classical models are added
- Community-shared anonymized trends, therapist export mode
