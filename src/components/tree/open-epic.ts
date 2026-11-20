"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "test-tracker:open-epic";
const listeners = new Set<() => void>();
/** Used when sessionStorage is unavailable (e.g. blocked), so epics still open for the page's lifetime. */
let fallback: string | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return fallback;
  }
}

/** Opens the epic with this key and closes any other; null closes all. Kept for the browser tab's session. */
export function setOpenEpic(key: string | null) {
  fallback = key;
  try {
    if (key === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Storage blocked: the in-memory fallback carries the state.
  }
  for (const listener of listeners) listener();
}

/** Key of the one open epic, or null. The server render has every epic closed. */
export function useOpenEpic(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
