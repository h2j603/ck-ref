import { cookies } from "next/headers";
import Link from "next/link";

import { BoardCard } from "@/components/board/BoardCard";
import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { fetchBoards } from "@/lib/queries";

export const metadata = {
  title: "Boards — KIWI Juice",
};

export default async function BoardIndexPage() {
  const store = await cookies();
  const me = store.get(ARCHIVE_AUTH_COOKIE)?.value ?? null;
  const all = await fetchBoards().catch(() => []);
  // Private boards belong to a single curator — hide them from anyone
  // else's listing. created_by stores the same profile key the auth
  // cookie carries, so a direct equality check is enough.
  const boards = all.filter((b) => !b.is_private || b.created_by === me);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <header className="flex items-baseline justify-between pt-2">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Boards — {boards.length}
        </h1>
        <Link
          href="/board/new"
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          + new
        </Link>
      </header>

      {boards.length === 0 ? (
        <p className="py-32 text-center font-mono text-xs text-muted-foreground">
          아직 보드가 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((b) => (
            <li key={b.id}>
              <BoardCard board={b} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
