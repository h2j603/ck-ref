"use client";

import { MessageSquareText } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NicknamePill } from "@/components/nickname-pill";
import { cn } from "@/lib/utils";

// Small chat-bubble icon overlaid on a ref card. Tap to open a dialog
// with the full reason text. Used on both project-level and per-update
// ref attachments. `compact` makes the icon a touch smaller for the
// per-update grids.
export function ReasonBadge({
  reason,
  addedBy,
  compact = false,
}: {
  reason: string;
  addedBy?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground",
          compact ? "size-5 p-1" : "size-6 p-1",
        )}
        aria-label="추가 이유 보기"
      >
        <MessageSquareText className={compact ? "size-3" : "size-3.5"} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>추가 이유</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {addedBy ? (
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <NicknamePill nickname={addedBy} />
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {reason}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
