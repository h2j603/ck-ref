"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "ck-ref:nickname";
const CHANGE_EVENT = "ck-ref:nickname-change";

function readStored(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStored(value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* noop */
  }
}

// useSyncExternalStore subscribes the component to localStorage and the
// custom change event in the React-canonical way, sidestepping the
// setState-in-effect dance the previous useState/useEffect version did.
function subscribe(notify: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

function getServerSnapshot(): string {
  return "";
}

export function useNickname() {
  // The hook returns "" on the server and on the very first client render
  // (matching the SSR snapshot), then re-renders with the real value once
  // hydration is done. `hydrated` flips on the second render, which is
  // when localStorage has been read.
  const nickname = useSyncExternalStore(subscribe, readStored, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const setNickname = useCallback((value: string) => {
    writeStored(value.trim());
  }, []);

  return { nickname, setNickname, hydrated };
}

export function getStoredNickname(): string {
  return readStored();
}
