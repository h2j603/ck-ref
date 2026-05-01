"use server";

import { fetchRefs, type RefFilter } from "@/lib/queries";

// Server action — paginated fetch for the index masonry. Cursor is
// the `created_at` of the last ref shown. Filter object has to mirror
// what the page initially used so subsequent pages stay scoped to the
// same view (genre / tags / search etc.).
export async function loadMoreRefs(
  filter: RefFilter,
  before: string,
  limit: number,
) {
  return fetchRefs({ ...filter, before }, limit);
}
