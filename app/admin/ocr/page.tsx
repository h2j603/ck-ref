import { OcrBackfillClient } from "./OcrBackfillClient";

export const metadata = {
  title: "KIWI Juice — OCR 백필",
};

export default function OcrAdminPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-4">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / Admin
        </p>
        <h1 className="text-2xl font-medium tracking-tight">OCR 백필</h1>
        <p className="text-sm text-muted-foreground">
          기존 ref 이미지에서 텍스트 추출해 검색 인덱스를 채워요. 한 번에
          5개씩 돌리고, 자동 진행 켜면 끝까지 처리. 탭을 닫지 말고 켜둬요
          — Tesseract 모델은 첫 호출에만 다운로드합니다.
        </p>
      </header>
      <OcrBackfillClient />
    </div>
  );
}
