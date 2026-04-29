"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Profile = {
  id: string;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: "ADMIN" | "HR_MANAGER" | "WRITER" | "VIEWER";
  canPost: boolean;
  canManageEmployees: boolean;
  linkedMsnv: string | null;
  linked: boolean;
  mustChangePassword?: boolean;
  themeKey?: string;
};

type AuthState = {
  token: string | null;
  profile: Profile | null;
  initialized: boolean;
};

const TOKEN_KEY = "internal_threads_token";
const PROFILE_KEY = "internal_threads_profile";
const TOKEN_COOKIE_KEY = "internal_threads_session";
const TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

let state: AuthState = {
  token: null,
  profile: null,
  initialized: false
};

const listeners = new Set<() => void>();

function normalizeProfile(profile: Profile | null): Profile | null {
  if (!profile) return null;

  return {
    ...profile,
    canPost: profile.canPost ?? (profile.role === "ADMIN" || profile.role === "WRITER"),
    canManageEmployees: profile.canManageEmployees ?? (profile.role === "ADMIN" || profile.role === "HR_MANAGER")
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(nextState: Partial<AuthState>) {
  state = { ...state, ...nextState };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function hydrateAuthState() {
  if (state.initialized || typeof window === "undefined") {
    return;
  }

  try {
    const currentToken = window.localStorage.getItem(TOKEN_KEY);
    const rawProfile = window.localStorage.getItem(PROFILE_KEY);
    state = {
      token: currentToken,
      profile: rawProfile ? normalizeProfile(JSON.parse(rawProfile) as Profile) : null,
      initialized: true
    };
  } catch {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PROFILE_KEY);
    state = {
      token: null,
      profile: null,
      initialized: true
    };
  }

  emit();
}

function persistProfile(profile: Profile | null) {
  if (typeof window === "undefined") return;
  if (profile) {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } else {
    window.localStorage.removeItem(PROFILE_KEY);
  }
}

function persistToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.document.cookie = `${TOKEN_COOKIE_KEY}=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_COOKIE_MAX_AGE}; samesite=lax`;
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
    window.document.cookie = `${TOKEN_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`;
  }
}

export function useAuthStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    hydrateAuthState();
  }, []);

  const setProfile = (nextProfile: Profile | null) => {
    const normalized = normalizeProfile(nextProfile);
    persistProfile(normalized);
    setState({ profile: normalized });
  };

  const saveAuth = (nextToken: string, nextProfile: Profile) => {
    const normalized = normalizeProfile(nextProfile);
    persistToken(nextToken);
    persistProfile(normalized);
    setState({
      token: nextToken,
      profile: normalized,
      initialized: true
    });
  };

  const clearAuth = () => {
    persistToken(null);
    persistProfile(null);
    setState({
      token: null,
      profile: null,
      initialized: true
    });
  };

  return {
    token: snapshot.token,
    profile: snapshot.profile,
    initialized: snapshot.initialized,
    setProfile,
    saveAuth,
    clearAuth
  };
}
