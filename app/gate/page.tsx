import { fetchProfileRefCounts, fetchProfiles } from "@/lib/queries";

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
  const [profiles, counts] = await Promise.all([
    fetchProfiles(),
    fetchProfileRefCounts(),
  ]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-10">
      <div className="flex flex-col gap-2 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / 00
        </p>
        <h1 className="text-2xl font-medium tracking-tight">
          프로필을 선택해주세요.
        </h1>
        <p className="text-sm text-muted-foreground">
          처음이라면 입력한 비밀번호가 그 프로필의 비밀번호로 저장돼요.
        </p>
      </div>
      <GateClient redirectTo={safeFrom} profiles={profiles} counts={counts} />
    </div>
  );
}
