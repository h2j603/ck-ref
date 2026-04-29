import { MetadataForm } from "@/components/upload/MetadataForm";

export const metadata = {
  title: "Upload — KIWI Juice",
};

export default function UploadPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / upload
        </p>
        <h1 className="text-2xl font-medium tracking-tight">새 레퍼런스 등록</h1>
        <p className="text-sm text-muted-foreground">
          여러 장을 한 번에 올릴 수 있어요. 메타데이터는 모든 항목에 동일하게 적용됩니다.
        </p>
      </header>
      <MetadataForm />
    </div>
  );
}
