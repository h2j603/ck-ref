"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// Copy-link / Web Share affordance for board detail. On platforms that
// expose the system share sheet (most mobile, some desktop) we hand off
// the URL there; everywhere else we just write to the clipboard and
// flash a tick. Either way the user gets back a URL they can paste.
export function BoardShareButton() {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // User cancelled the sheet or share isn't actually allowed in
        // this context — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("이 URL을 복사해주세요", url);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void share()}
      className="h-7 px-2 text-[11px]"
    >
      {copied ? (
        <>
          <Check className="size-3" /> 복사됨
        </>
      ) : (
        <>
          <Share2 className="size-3" /> 공유
        </>
      )}
    </Button>
  );
}
