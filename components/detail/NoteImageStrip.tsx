"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { publicImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

// Tiny thumbnail strip used inside notes. Tap a thumbnail to open the
// lightbox; arrow keys / on-screen chevrons / swipe-tap navigate. Only
// renders when the note actually has images.
export function NoteImageStrip({
  paths,
  className,
}: {
  paths: string[];
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
      else if (e.key === "ArrowLeft" && openIndex !== null) {
        setOpenIndex((i) => (i === null ? null : (i - 1 + paths.length) % paths.length));
      } else if (e.key === "ArrowRight" && openIndex !== null) {
        setOpenIndex((i) => (i === null ? null : (i + 1) % paths.length));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openIndex, paths.length]);

  if (paths.length === 0) return null;
  return (
    <>
      <ul className={cn("flex flex-wrap gap-1.5", className)}>
        {paths.map((p, i) => (
          <li key={`${p}-${i}`}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpenIndex(i);
              }}
              className="relative block size-16 overflow-hidden rounded-sm bg-muted transition-opacity hover:opacity-90"
              aria-label="이미지 보기"
            >
              <Image
                src={publicImageUrl(p)}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {openIndex !== null ? (
        <Lightbox
          paths={paths}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onPrev={() =>
            setOpenIndex((i) => (i === null ? null : (i - 1 + paths.length) % paths.length))
          }
          onNext={() =>
            setOpenIndex((i) => (i === null ? null : (i + 1) % paths.length))
          }
        />
      ) : null}
    </>
  );
}

function Lightbox({
  paths,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  paths: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
      >
        <X className="size-5" />
      </button>
      {paths.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="previous"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:left-4"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="next"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:right-4"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={publicImageUrl(paths[index])}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full object-contain"
      />
      {paths.length > 1 ? (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white">
          {index + 1} / {paths.length}
        </p>
      ) : null}
    </div>
  );
}
