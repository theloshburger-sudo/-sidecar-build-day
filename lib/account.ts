"use client";

// Who's signed in and where their memory lives. One shared store for the whole app,
// so the guest → account import runs exactly once per sign-in.

import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { CloudMemory, LocalMemory, type MemoryStore } from "./memory";
import { supabase } from "./supabase";

export interface AccountState {
  /** False until we know whether someone is signed in. */
  ready: boolean;
  /** Accounts are configured on this deploy (Supabase env vars set). */
  configured: boolean;
  user: User | null;
  memory: MemoryStore | null;
  /** Set right after a sign-in brought guest memory into the account. */
  imported: boolean;
}

const SERVER: AccountState = { ready: false, configured: Boolean(supabase), user: null, memory: null, imported: false };
let state = SERVER;
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<AccountState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function apply(user: User | null) {
  const local = new LocalMemory(window.localStorage);
  if (!user || !supabase) return set({ ready: true, user: null, memory: local });
  if (state.user?.id === user.id && state.memory?.kind === "cloud") return;
  const cloud = new CloudMemory(supabase, user.id);
  let imported = false;
  try {
    imported = await cloud.importLocal(local);
  } catch (e) {
    console.warn("couldn't import this device's progress", e); // stays on the device; next sign-in retries
  }
  set({ ready: true, user, memory: cloud, imported });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!supabase) {
    set({ ready: true, memory: new LocalMemory(window.localStorage) });
    return;
  }
  supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
  supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase warns against awaiting other calls inside this callback.
    setTimeout(() => void apply(session?.user ?? null), 0);
  });
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

const redirectTo = () => window.location.origin + window.location.pathname;

export async function signInWithGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signInWithEmail(email: string) {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export function clearImported() {
  set({ imported: false });
}

/** fetch() with the signed-in student's token, for routes that act as them (Canvas). */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}
