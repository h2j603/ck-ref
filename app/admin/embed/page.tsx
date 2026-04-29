import { EmbedAdminClient } from "./EmbedAdminClient";

export const metadata = {
  title: "KIWI Juice — Embeddings",
};

export default function EmbedAdminPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-4">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / Admin
        </p>
        <h1 className="text-2xl font-medium tracking-tight">시각 유사도 임베딩</h1>
        <p className="text-sm text-muted-foreground">
          기존 ref들에 CLIP 임베딩을 채워 넣어요. 한 번에 25개씩 처리하고,
          남은 게 있으면 버튼이 다시 활성화돼요.
        </p>
      </header>
      <EmbedAdminClient />
    </div>
  );
}
