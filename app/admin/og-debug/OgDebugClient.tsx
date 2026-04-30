"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Report = {
  shortcode: string | null;
  iframely: {
    keyPresent: boolean;
    skipped?: boolean;
    httpStatus?: number;
    raw?: unknown;
    slides?: { url: string; is_video?: boolean }[];
    error?: string;
  };
  graphql: {
    csrfToken: boolean;
    httpStatus?: number;
    raw?: unknown;
    slides?: { url: string; is_video?: boolean }[];
    error?: string;
  };
  html: {
    httpStatus?: number;
    htmlLength?: number;
    foundUrls?: string[];
    error?: string;
  };
  microlink: {
    httpStatus?: number;
    image?: string | null;
    error?: string;
  };
  finalChain: {
    slideCount: number;
    slides: { url: string; is_video?: boolean }[];
  };
};

export function OgDebugClient() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function run() {
    setError(null);
    setReport(null);
    if (!url.trim()) {
      setError("URL을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/og-debug?url=${encodeURIComponent(url.trim())}`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Report;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.instagram.com/p/..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void run()}
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 className="size-3 animate-spin" /> 실행 중
            </>
          ) : (
            "진단"
          )}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {report ? <ReportView report={report} /> : null}
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Row label="Shortcode" value={report.shortcode ?? "—"} />

      <Section
        title="1. Iframely"
        ok={
          (report.iframely.slides?.length ?? 0) > 0
        }
      >
        <Row
          label="IFRAMELY_KEY"
          value={report.iframely.keyPresent ? "있음" : "없음 (env에 설정 필요)"}
        />
        {report.iframely.skipped ? (
          <p className="text-muted-foreground">
            키가 없어서 스킵됐어요.
          </p>
        ) : (
          <>
            <Row
              label="HTTP"
              value={report.iframely.httpStatus?.toString() ?? "—"}
            />
            <Row
              label="파싱된 슬라이드"
              value={`${report.iframely.slides?.length ?? 0}개`}
            />
            {report.iframely.slides?.map((s, i) => (
              <SlideLine key={i} slide={s} />
            ))}
            {report.iframely.error ? (
              <Row label="에러" value={report.iframely.error} />
            ) : null}
            {report.iframely.raw ? (
              <Pre label="원본 응답" value={report.iframely.raw} />
            ) : null}
          </>
        )}
      </Section>

      <Section
        title="2. GraphQL"
        ok={(report.graphql.slides?.length ?? 0) > 0}
      >
        <Row
          label="CSRF 토큰"
          value={report.graphql.csrfToken ? "받음" : "못 받음"}
        />
        <Row
          label="HTTP"
          value={report.graphql.httpStatus?.toString() ?? "—"}
        />
        <Row
          label="파싱된 슬라이드"
          value={`${report.graphql.slides?.length ?? 0}개`}
        />
        {report.graphql.slides?.map((s, i) => (
          <SlideLine key={i} slide={s} />
        ))}
        {report.graphql.error ? (
          <Row label="에러" value={report.graphql.error} />
        ) : null}
        {report.graphql.raw ? (
          <Pre label="원본 응답 (앞부분)" value={report.graphql.raw} />
        ) : null}
      </Section>

      <Section
        title="3. HTML scrape"
        ok={(report.html.foundUrls?.length ?? 0) > 0}
      >
        <Row
          label="HTTP"
          value={report.html.httpStatus?.toString() ?? "—"}
        />
        <Row
          label="HTML 길이"
          value={
            report.html.htmlLength != null
              ? `${report.html.htmlLength.toLocaleString()} 자`
              : "—"
          }
        />
        <Row
          label="display_url 매칭"
          value={`${report.html.foundUrls?.length ?? 0}개`}
        />
        {report.html.foundUrls?.slice(0, 10).map((u, i) => (
          <p
            key={i}
            className="break-all font-mono text-[11px] text-muted-foreground"
          >
            {i + 1}. {u}
          </p>
        ))}
        {report.html.error ? (
          <Row label="에러" value={report.html.error} />
        ) : null}
      </Section>

      <Section title="4. Microlink" ok={Boolean(report.microlink.image)}>
        <Row
          label="HTTP"
          value={report.microlink.httpStatus?.toString() ?? "—"}
        />
        <Row label="이미지" value={report.microlink.image ?? "—"} />
        {report.microlink.error ? (
          <Row label="에러" value={report.microlink.error} />
        ) : null}
      </Section>

      <Section
        title="실제 체인 결과 (업로드 폼이 받는 값)"
        ok={report.finalChain.slideCount > 0}
      >
        <Row
          label="슬라이드 수"
          value={`${report.finalChain.slideCount}개`}
        />
        {report.finalChain.slides.map((s, i) => (
          <SlideLine key={i} slide={s} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  ok,
  children,
}: {
  title: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-input p-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            ok
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {ok ? "OK" : "fail"}
        </span>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="grid grid-cols-[120px_1fr] gap-2 break-all">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-foreground">{value}</span>
    </p>
  );
}

function SlideLine({
  slide,
}: {
  slide: { url: string; is_video?: boolean };
}) {
  return (
    <p className="break-all font-mono text-[11px] text-muted-foreground">
      {slide.is_video ? "[video] " : "[image] "}
      {slide.url}
    </p>
  );
}

function Pre({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="flex flex-col gap-1">
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </summary>
      <pre className="mt-1 max-h-96 overflow-auto rounded-sm bg-muted p-2 font-mono text-[10px] leading-relaxed">
        {JSON.stringify(value, null, 2).slice(0, 8000)}
      </pre>
    </details>
  );
}
