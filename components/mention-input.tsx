"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Textarea } from "@/components/ui/textarea";
import { PROFILE_KEYS } from "@/lib/profiles";
import type { Profile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

// Discord-style mention input. The textarea text is rendered transparent
// and a mirror <div> behind it draws the same content character-for-
// character — except `@<key>` patterns become visible pill chips. The
// caret stays on the textarea, so editing behaves exactly like normal
// text input but the user *sees* pills inline.
//
// Typing `@` opens a floating dropdown of matching profiles. Arrow keys
// + Enter / Tab pick one, click works on touch.

type Props = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (next: string) => void;
  profiles: Profile[];
};

// The mirror has to render at exactly the same width as the underlying
// textarea text or the textarea's caret will visibly drift past characters
// the user typed after the mention. So the pill keeps the textarea's
// font / size / kerning and only signals "this is a mention" with a
// background tint. No padding, no border, no font change.
const PILL_CLASS = "rounded-sm bg-foreground/15 text-foreground";

export const MentionInput = forwardRef<HTMLTextAreaElement, Props>(
  function MentionInput({ value, onChange, profiles, className, ...rest }, ref) {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [matchStart, setMatchStart] = useState(-1);
    const [highlight, setHighlight] = useState(0);

    // Use the canonical roster as a fallback so the dropdown still works
    // before profiles have hydrated from the server.
    const effectiveProfiles = useMemo<Profile[]>(() => {
      if (profiles.length > 0) return profiles;
      return PROFILE_KEYS.map((key) => ({
        key,
        display_name: key,
        avatar_path: null,
        color: "#a8a29e",
        has_password: false,
      }));
    }, [profiles]);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return effectiveProfiles;
      return effectiveProfiles.filter(
        (p) =>
          p.key.toLowerCase().includes(q) ||
          p.display_name.toLowerCase().includes(q),
      );
    }, [effectiveProfiles, query]);

    function detectMention(text: string, cursor: number) {
      let i = cursor - 1;
      while (i >= 0) {
        const c = text[i];
        if (c === "@") {
          // Must be at start of string or after whitespace — mid-word `@`
          // shouldn't trigger (e.g. an email address).
          if (i === 0 || /\s/.test(text[i - 1])) {
            return { start: i, query: text.slice(i + 1, cursor) };
          }
          return null;
        }
        if (/\s/.test(c)) return null;
        i -= 1;
      }
      return null;
    }

    const sync = useCallback(() => {
      const ta = innerRef.current;
      const m = mirrorRef.current;
      if (!ta || !m) return;
      m.scrollTop = ta.scrollTop;
      m.scrollLeft = ta.scrollLeft;
    }, []);

    useLayoutEffect(() => {
      sync();
    }, [value, sync]);

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const v = e.target.value;
      onChange(v);
      const cursor = e.target.selectionStart ?? v.length;
      const m = detectMention(v, cursor);
      if (m) {
        setMatchStart(m.start);
        setQuery(m.query);
        setHighlight(0);
        setOpen(true);
      } else {
        setOpen(false);
      }
    }

    function handleSelectionChange() {
      const ta = innerRef.current;
      if (!ta) return;
      const cursor = ta.selectionStart ?? value.length;
      const m = detectMention(value, cursor);
      if (m) {
        setMatchStart(m.start);
        setQuery(m.query);
        setOpen(true);
      } else {
        setOpen(false);
      }
    }

    function pick(profile: Profile) {
      const ta = innerRef.current;
      if (!ta || matchStart < 0) return;
      const cursor = ta.selectionStart ?? value.length;
      const before = value.slice(0, matchStart);
      const after = value.slice(cursor);
      // Trailing space so the next char doesn't merge with the mention.
      const insertion = `@${profile.key} `;
      const next = `${before}${insertion}${after}`;
      onChange(next);
      setOpen(false);
      const newCursor = before.length + insertion.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      });
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      rest.onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (!open || filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        const target = filtered[highlight];
        if (target) {
          e.preventDefault();
          pick(target);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }

    // Tokenize the value into plain-text segments and mention chips for
    // the mirror. Only profile keys we know about turn into pills — other
    // `@xyz` strings stay as text.
    const segments = useMemo(() => {
      const keys = effectiveProfiles.map((p) => p.key);
      if (keys.length === 0) return [{ type: "text" as const, text: value }];
      const re = new RegExp(
        `(^|\\s)@(${keys.map((k) => k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})(?=\\s|$|[^\\p{L}\\p{N}_])`,
        "gu",
      );
      const parts: ({ type: "text"; text: string } | { type: "pill"; key: string })[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(value)) !== null) {
        const matchStart = m.index + m[1].length;
        if (matchStart > last) {
          parts.push({ type: "text", text: value.slice(last, matchStart) });
        }
        parts.push({ type: "pill", key: m[2] });
        last = re.lastIndex;
      }
      if (last < value.length) {
        parts.push({ type: "text", text: value.slice(last) });
      }
      return parts;
    }, [value, effectiveProfiles]);

    // Close the dropdown when the user clicks elsewhere.
    useEffect(() => {
      if (!open) return;
      function onDocClick(e: MouseEvent) {
        const ta = innerRef.current;
        if (!ta) return;
        if (e.target instanceof Node && ta.contains(e.target)) return;
        setOpen(false);
      }
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    return (
      <div className="relative">
        <div
          ref={mirrorRef}
          aria-hidden
          className={cn(
            // Match the Textarea's intrinsic styles so character positions
            // align: same font, padding, line-height, border, etc.
            "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm",
            className,
          )}
        >
          {segments.map((s, i) =>
            s.type === "pill" ? (
              <span key={i} className={PILL_CLASS}>
                @{s.key}
              </span>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
          {/* trailing zero-width char so the mirror never collapses height */}
          {"​"}
        </div>
        <Textarea
          {...rest}
          ref={innerRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={sync}
          onSelect={handleSelectionChange}
          className={cn("relative bg-transparent text-transparent caret-foreground", className)}
        />
        {open && filtered.length > 0 ? (
          <ul
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-background shadow-lg"
            role="listbox"
          >
            {filtered.map((p, i) => (
              <li key={p.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    // Prevent the textarea from blurring before we get to pick.
                    e.preventDefault();
                    pick(p);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    i === highlight && "bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="font-mono text-[11px] uppercase tracking-wider">
                    @{p.display_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
);
