import type { Session } from "@supabase/supabase-js";
// Local rendering only. Supabase still validates the token and RLS for every network operation.
// Never use this cached identity to authorize server-side access.
export function readCachedSession(
  storageKey: string,
  storage: Pick<Storage, "getItem">,
): Session | null {
  try {
    const value = JSON.parse(storage.getItem(storageKey) ?? "null");
    return value &&
      typeof value.user?.id === "string" &&
      typeof value.access_token === "string" &&
      typeof value.refresh_token === "string"
      ? (value as Session)
      : null;
  } catch {
    return null;
  }
}
