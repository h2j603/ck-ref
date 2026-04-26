import GateForm from "./GateForm";

export const metadata = {
  title: "CK Ref. — Gate",
};

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const safeFrom = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / 00
        </p>
        <h1 className="text-2xl font-medium tracking-tight">
          내부 아카이브 — 비밀번호로 들어오세요.
        </h1>
        <p className="text-sm text-muted-foreground">
          비밀번호와 닉네임을 입력하면 노트와 업로드에 닉네임이 붙습니다.
        </p>
      </div>
      <GateForm redirectTo={safeFrom} />
    </div>
  );
}
