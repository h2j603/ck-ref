"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { probeImage } from "@/lib/imageProbe";
import { useNickname } from "@/lib/nickname";
import { randomStoragePath } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET } from "@/lib/supabase/env";

// Inline file picker for "drop an image straight into this board". Each
// file becomes a minimal ref (no title / metadata — the team can fill
// those later from the ref detail) and gets linked into board_items at
// the next available position. The created refs do show up in the
// global index, which mirrors how the rest of the archive treats
// uploaded images — board uploads aren't a separate species.
export function BoardImageUploadButton({
  boardId,
  onUploaded,
}: {
  boardId: string;
  onUploaded: () => void;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // Reset so picking the same file twice in a row still fires onChange.
    e.target.value = "";
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      // Append to the end of the board.
      const { data: maxRow } = await supabase
        .from("board_items")
        .select("position")
        .eq("board_id", boardId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      let pos =
        ((maxRow as { position: number } | null)?.position ?? -1) + 1;

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setProgress(`업로드 중 ${i + 1}/${files.length}`);
        const probed = await probeImage(file);
        const path = randomStoragePath(file);
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, {
            cacheControl: "31536000",
            upsert: false,
            contentType: file.type || undefined,
          });
        if (upErr) throw upErr;

        const { data: refRow, error: insErr } = await supabase
          .from("refs")
          .insert({
            title: null,
            image_path: path,
            image_width: probed?.width ?? null,
            image_height: probed?.height ?? null,
            color_hex: probed?.colorHex ?? null,
            color_hue: probed?.colorHue ?? null,
            created_by: nickname || null,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        const refId = (refRow as { id: string }).id;

        const { error: linkErr } = await supabase.from("board_items").insert({
          board_id: boardId,
          ref_id: refId,
          position: pos,
          added_by: nickname || null,
        });
        if (linkErr) throw linkErr;
        pos += 1;
      }
      setProgress(null);
      onUploaded();
    } catch (err) {
      setError(extractMessage(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!hydrated || !nickname) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => void handleFiles(e)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="h-7 px-2 text-[11px]"
      >
        {busy ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            {progress ?? "업로드 중…"}
          </>
        ) : (
          <>
            <Upload className="size-3" /> 이미지 업로드
          </>
        )}
      </Button>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function extractMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; error?: unknown; details?: unknown };
    for (const v of [e.message, e.details, e.error]) {
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return "업로드 실패";
}
