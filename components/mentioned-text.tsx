"use client";

import ReactMarkdown, { type Components } from "react-markdown";

import { NicknamePill } from "@/components/nickname-pill";
import { PROFILE_KEYS } from "@/lib/profiles";

// We render mentions by pre-processing the text into markdown link syntax
// with a synthetic `#mention:<key>` href, then overriding ReactMarkdown's
// link component to recognize that prefix and render a NicknamePill. This
// keeps existing markdown (bold, lists, etc.) intact.

const MENTION_PATTERN = new RegExp(`@(?:${PROFILE_KEYS.join("|")})`, "g");
const MENTION_HREF_PREFIX = "#mention:";

function preprocess(text: string): string {
  return text.replace(MENTION_PATTERN, (m) => {
    const key = m.slice(1);
    return `[${m}](${MENTION_HREF_PREFIX}${encodeURIComponent(key)})`;
  });
}

const components: Components = {
  a({ href, children }) {
    if (href?.startsWith(MENTION_HREF_PREFIX)) {
      const key = decodeURIComponent(href.slice(MENTION_HREF_PREFIX.length));
      return (
        <NicknamePill
          nickname={key}
          className="mx-0.5 align-baseline"
        />
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-2 hover:underline"
      >
        {children}
      </a>
    );
  },
};

export function MarkdownWithMentions({ text }: { text: string }) {
  if (!text) return null;
  return <ReactMarkdown components={components}>{preprocess(text)}</ReactMarkdown>;
}
