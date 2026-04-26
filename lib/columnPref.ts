"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "ck-ref:columns";
const EVENT = "ck-ref:columns-change";

export const COLUMN_OPTIONS = [1, 2, 3, 4, 5] as const;
export type ColumnCount = (typeof COLUMN_OPTIONS)[number];

const DEFAULT: ColumnCount = 5;

function read(): ColumnCount {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    return COLUMN_OPTIONS.includes(n as ColumnCount) ? (n as ColumnCount) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(value: ColumnCount) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* noop */
  }
}

export function useColumnPref() {
  const columns = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const setColumns = useCallback((value: ColumnCount) => {
    write(value);
  }, []);
  return { columns, setColumns };
}
