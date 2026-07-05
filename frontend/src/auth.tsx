// API client + auth context for MindEcho.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const API = `${BASE}/api`;
const TOKEN_KEY = "mindecho.token";
const USER_KEY = "mindecho.user";

export type User = { id: string; name: string; email: string; created_at: string };
export type Analysis = {
  id: string;
  user_id: string;
  modality: "voice" | "text" | "multimodal";
  stress_level: "Low" | "Medium" | "High";
  probability: number;
  label: "Stress" | "No Stress";
  transcript: string | null;
  original_text: string | null;
  key_features: string[];
  highlighted_words: string[];
  explanation: string;
  recommendation: string;
  voice_probability: number | null;
  text_probability: number | null;
  created_at: string;
};

export type Stats = {
  total: number;
  stressed_count: number;
  stress_percentage: number;
  by_level: { Low: number; Medium: number; High: number };
  weekly: { day_offset: number; avg_probability: number; count: number }[];
};

let currentToken: string | null = null;

async function apiFetch(path: string, opts: RequestInit = {}, isForm = false): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (!isForm) headers["Content-Type"] = "application/json";
  if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  register: (name: string, email: string, password: string) =>
    apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (): Promise<User> => apiFetch("/auth/me"),
  analyzeText: (text: string): Promise<Analysis> =>
    apiFetch("/analyze/text", { method: "POST", body: JSON.stringify({ text }) }),
  analyzeVoice: async (uri: string): Promise<Analysis> => {
    const form = new FormData();
    // React Native FormData file object
    const name = uri.split("/").pop() || "audio.m4a";
    const ext = (name.split(".").pop() || "m4a").toLowerCase();
    const mime = ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : "audio/m4a";
    // @ts-ignore RN FormData accepts this shape
    form.append("file", { uri, name, type: mime });
    return apiFetch("/analyze/voice", { method: "POST", body: form as any }, true);
  },
  analyzeMultimodal: async (uri: string, text: string): Promise<Analysis> => {
    const form = new FormData();
    const name = uri.split("/").pop() || "audio.m4a";
    const ext = (name.split(".").pop() || "m4a").toLowerCase();
    const mime = ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : "audio/m4a";
    // @ts-ignore
    form.append("file", { uri, name, type: mime });
    form.append("text", text);
    return apiFetch("/analyze/multimodal", { method: "POST", body: form as any }, true);
  },
  history: (): Promise<Analysis[]> => apiFetch("/history"),
  historyDetail: (id: string): Promise<Analysis> => apiFetch(`/history/${id}`),
  deleteHistory: (id: string) => apiFetch(`/history/${id}`, { method: "DELETE" }),
  stats: (): Promise<Stats> => apiFetch("/stats"),
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await storage.secureGet<string>(TOKEN_KEY, "");
      const u = await storage.getItem<string>(USER_KEY, "");
      if (t) {
        currentToken = t as string;
        if (u) {
          try { setUser(JSON.parse(u as string)); } catch { /* noop */ }
        }
        // refresh in background
        try {
          const fresh = await api.me();
          setUser(fresh);
          await storage.setItem(USER_KEY, JSON.stringify(fresh));
        } catch {
          currentToken = null;
          await storage.secureRemove(TOKEN_KEY);
          await storage.removeItem(USER_KEY);
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const finalize = useCallback(async (token: string, u: User) => {
    currentToken = token;
    await storage.secureSet(TOKEN_KEY, token);
    await storage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    await finalize(token, user);
  }, [finalize]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { token, user } = await api.register(name, email, password);
    await finalize(token, user);
  }, [finalize]);

  const signOut = useCallback(async () => {
    currentToken = null;
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, signIn, signUp, signOut }), [user, loading, signIn, signUp, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = (): AuthCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
};
