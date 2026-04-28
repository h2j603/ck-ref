"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { projectColor } from "@/lib/projectColor";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/lib/types";

const NO_PROJECT = "__none__";

type ProjectLite = { id: string; title: string; status: string };

function toIsoLocal(d: Date): string {
  // YYYY-MM-DDTHH:mm in the local zone, suitable for <input type="datetime-local">.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(day: Date): string {
  const d = new Date(day);
  d.setHours(10, 0, 0, 0);
  return toIsoLocal(d);
}

export function EventDialog({
  open,
  onOpenChange,
  day,
  projects,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: Date;
  projects: ProjectLite[];
  existing: CalendarEvent | null;
  onSaved: (ev: CalendarEvent) => void;
}) {
  const supabase = createClient();
  const { nickname } = useNickname();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [projectId, setProjectId] = useState<string>(
    existing?.project_id ?? NO_PROJECT,
  );
  const [allDay, setAllDay] = useState(existing?.all_day ?? false);
  const [announce, setAnnounce] = useState(existing?.announce ?? false);
  const [startsAt, setStartsAt] = useState(
    existing
      ? toIsoLocal(new Date(existing.starts_at))
      : defaultStart(day),
  );
  const [endsAt, setEndsAt] = useState(
    existing?.ends_at ? toIsoLocal(new Date(existing.ends_at)) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    if (!startsAt) {
      setError("시작 시각을 입력해주세요.");
      return;
    }
    setBusy(true);
    const startsAtIso = new Date(startsAt).toISOString();
    const payload = {
      title: title.trim(),
      body: body.trim() || null,
      project_id: projectId === NO_PROJECT ? null : projectId,
      all_day: allDay,
      announce,
      starts_at: startsAtIso,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    };
    let res;
    if (existing) {
      // If the user pushed the time forward, the previous reminders are
      // stale — reset both flags so the cron can fire again for the new
      // window. Leaving these set would silently drop the morning / 1h
      // pings on a rescheduled meeting.
      const startsAtChanged = existing.starts_at !== startsAtIso;
      const updatePayload = startsAtChanged
        ? { ...payload, notified_morning: false, notified_hour: false }
        : payload;
      res = await supabase
        .from("events")
        .update(updatePayload)
        .eq("id", existing.id)
        .select("*")
        .single();
    } else {
      res = await supabase
        .from("events")
        .insert({ ...payload, created_by: nickname || null })
        .select("*")
        .single();
    }
    setBusy(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    onSaved(res.data as CalendarEvent);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "일정 수정" : "새 일정"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ev-title">제목</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>프로젝트</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>— 없음</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: projectColor(p.id) }}
                      />
                      {p.title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <span>종일</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={announce}
              onChange={(e) => setAnnounce(e.target.checked)}
              className="mt-1"
            />
            <span className="flex flex-col gap-0.5">
              <span>인덱스에 공지로 띄우기</span>
              <span className="text-[11px] text-muted-foreground">
                회의·중요 이벤트만 체크. 길게 가는 작업 계획은 꺼두세요.
              </span>
            </span>
          </label>
          {!allDay ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-start">시작</Label>
                <Input
                  id="ev-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-end">끝 (선택)</Label>
                <Input
                  id="ev-end"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-start-date">날짜</Label>
              <Input
                id="ev-start-date"
                type="date"
                value={startsAt.slice(0, 10)}
                onChange={(e) => setStartsAt(`${e.target.value}T00:00`)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ev-body">메모 (선택)</Label>
            <Textarea
              id="ev-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            취소
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? "저장 중…" : existing ? "수정" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
