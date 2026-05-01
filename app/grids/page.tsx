import { fetchGridGallery } from "@/lib/queries";

import { GridGalleryClient } from "./GridGalleryClient";

export const metadata = {
  title: "KIWI Juice — 그리드 갤러리",
};

export default async function GridGalleryPage() {
  const entries = await fetchGridGallery();
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-8 pt-2">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / Grids
        </p>
        <h1 className="text-2xl font-medium tracking-tight">그리드 갤러리</h1>
        <p className="text-sm text-muted-foreground">
          분석된 모든 그리드. 타입·칼럼 수로 좁혀 보고, 어떤 작업에 어떻게
          퍼져나갔는지도 한 카드에서 확인하세요.
        </p>
      </header>
      <GridGalleryClient entries={entries} />
    </div>
  );
}
