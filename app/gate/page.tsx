import { cookies } from "next/headers";

import { DISCORD_TRUST_COOKIE } from "@/lib/discordTrust";
import { fetchProfileRefCounts, fetchProfiles } from "@/lib/queries";

import GateClient from "./GateClient";

export const metadata = {
  title: "KIWI Juice — Gate",
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
  const viaDiscord = store.get(DISCORD_TRUST_COOKIE)?.value === "1";
  const [profiles, counts] = await Promise.all([
    fetchProfiles(),
    fetchProfileRefCounts(),
  ]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-10">
      <div className="flex flex-col gap-2 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / 00
        </p>
        <h1 className="text-2xl font-medium tracking-tight">
          프로필을 선택해주세요.
        </h1>
        <p className="text-sm text-muted-foreground">
          {viaDiscord
            ? "디스코드에서 들어왔어요. 누구신지만 골라주세요."
            : "처음이라면 입력한 비밀번호가 그 프로필의 비밀번호로 저장돼요."}
        </p>
      </div>
      <GateClient
        redirectTo={safeFrom}
        profiles={profiles}
        counts={counts}
        viaDiscord={viaDiscord}
      />
    </div>
  );
}
