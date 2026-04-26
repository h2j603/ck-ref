import { cookies } from "next/headers";

import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";

import GateClient from "./GateClient";

export const metadata = {
  title: "CK Ref. — Gate",
};

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const safeFrom =
    from && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  const store = await cookies();
  const authed = store.get(ARCHIVE_AUTH_COOKIE)?.value === "1";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-10">
      <div className="flex flex-col gap-2 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / 00
        </p>
        <h1 className="text-2xl font-medium tracking-tight">
          {authed ? "프로필을 선택해주세요." : "내부 아카이브 — 비밀번호로 들어오세요."}
        </h1>
        {authed ? null : (
          <p className="text-sm text-muted-foreground">
            한 번만 입력하면 이 기기에서는 다음부터 프로필 클릭으로 들어갈 수 있어요.
          </p>
        )}
      </div>
      <GateClient initialAuthed={authed} redirectTo={safeFrom} />
    </div>
  );
}
