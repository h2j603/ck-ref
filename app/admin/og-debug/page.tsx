import { OgDebugClient } from "./OgDebugClient";

export const metadata = {
  title: "KIWI Juice — OG 디버그",
};

export default function OgDebugPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-4">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / Admin
        </p>
        <h1 className="text-2xl font-medium tracking-tight">
          인스타그램 추출 진단
        </h1>
        <p className="text-sm text-muted-foreground">
          URL 하나를 넣으면 추출 체인의 4단계 (Iframely → GraphQL → HTML
          scrape → Microlink) 응답을 그대로 보여줘요. 어디서 막히는지 직접
          눈으로 확인할 수 있게.
        </p>
      </header>
      <OgDebugClient />
    </div>
  );
}
