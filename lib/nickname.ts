"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ck-ref:nickname";

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
    window.dispatchEvent(new Event("ck-ref:nickname-change"));
  } catch {
    /* noop */
  }
}

export function useNickname() {
  const [nickname, setNicknameState] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setNicknameState(readStored());
    setHydrated(true);
    const handler = () => setNicknameState(readStored());
    window.addEventListener("ck-ref:nickname-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("ck-ref:nickname-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const setNickname = useCallback((value: string) => {
    const trimmed = value.trim();
    writeStored(trimmed);
    setNicknameState(trimmed);
  }, []);

  return { nickname, setNickname, hydrated };
}

export function getStoredNickname(): string {
  return readStored();
}
