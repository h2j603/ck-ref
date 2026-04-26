import Link from "next/link";

import { fetchDesigners } from "@/lib/queries";

export const metadata = {
  title: "Designers — CK Ref.",
};

export default async function DesignerIndexPage() {
  const designers = await fetchDesigners().catch(() => []);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <header className="flex items-baseline justify-between pt-2">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Designers — {designers.length}
        </h1>
        <Link
          href="/designer/new"
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          + new
        </Link>
      </header>

      {designers.length === 0 ? (
        <p className="py-32 text-center font-mono text-xs text-muted-foreground">
          아직 디자이너가 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {designers.map((d) => (
            <li key={d.id}>
              <Link
                href={`/designer/${d.slug}`}
                className="block border-b border-border/40 py-3 transition-colors hover:border-foreground"
              >
                <p className="text-sm font-medium leading-tight">{d.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {d.origin ?? "—"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
