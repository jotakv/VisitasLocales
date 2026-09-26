import { expect, it } from "vitest";
import { readCachedSession } from "../apps/web/src/cached-session";
it("recovers local identity even with an expired offline session without a network request", () => {
  const session = {
    user: { id: "a" },
    access_token: "test-only",
    refresh_token: "test-only",
    expires_at: 1,
  };
  expect(
    readCachedSession("key", { getItem: () => JSON.stringify(session) }),
  ).toEqual(session);
});
it("invalid/missing session data never selects an account", () => {
  for (const value of [
    null,
    "invalid",
    "{}",
    JSON.stringify({ user: { id: "a" } }),
  ])
    expect(readCachedSession("key", { getItem: () => value })).toBeNull();
});
