"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Profile = {
  id: string;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: "ADMIN" | "WRITER" | "VIEWER";
  linkedMsnv: string | null;
  linked: boolean;
};

type AuthState = {
  token: string | null;
  profile: Profile | null;
  initialized: boolean;
};

const TOKEN_KEY = "internal_threads_token";
const PROFILE_KEY = "internal_threads_profile";

let state: AuthState = {
  token: null,
  profile: null,
  initialized: false
};

const listeners = new Set<() => void>();

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
      profile: rawProfile ? (JSON.parse(rawProfile) as Profile) : null,
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
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function useAuthStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    hydrateAuthState();
  }, []);

  const setProfile = (nextProfile: Profile | null) => {
    persistProfile(nextProfile);
    setState({ profile: nextProfile });
  };

  const saveAuth = (nextToken: string, nextProfile: Profile) => {
    persistToken(nextToken);
    persistProfile(nextProfile);
    setState({
      token: nextToken,
      profile: nextProfile,
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

