import { db } from "./db";
import { supabase } from "./supabase";
import type {
  LocalProperty,
  LocalVisit,
  Property,
  Visit,
} from "../../../packages/domain";
const inFlight = new Map<string, Promise<void>>();
export function synchronize(userId: string): Promise<void> {
  const current = inFlight.get(userId);
  if (current) return current;
  const task = runSync(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, task);
  return task;
}
async function runSync(userId: string) {
  if (!navigator.onLine) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user.id !== userId) return;
  // Parent records first. Upsert makes retries after an ambiguous network failure safe.
  for (const local of await db.localProperties
    .where("user_id")
    .equals(userId)
    .toArray()) {
    if (local.sync_status !== "pending_create" && local.sync_status !== "error")
      continue;
    const { sync_status, local_updated_at, sync_error, ...row } = local;
    void sync_status;
    void local_updated_at;
    void sync_error;
    const { error } = await supabase
      .from("properties")
      .upsert(row, { onConflict: "id" });
    await db.localProperties.update(local.id, {
      sync_status: error ? "error" : "synced",
      sync_error: error?.message,
    });
  }
  for (const local of await db.localVisits
    .where("user_id")
    .equals(userId)
    .toArray()) {
    if (local.sync_status !== "pending_create" && local.sync_status !== "error")
      continue;
    const parent = await db.localProperties.get(local.property_id);
    if (parent?.sync_status !== "synced") continue;
    const { sync_status, local_updated_at, sync_error, ...row } = local;
    void sync_status;
    void local_updated_at;
    void sync_error;
    const { error } = await supabase
      .from("visits")
      .upsert(row, { onConflict: "id" });
    await db.localVisits.update(local.id, {
      sync_status: error ? "error" : "synced",
      sync_error: error?.message,
    });
  }
  const [properties, visits] = await Promise.all([
    supabase.from("properties").select("*").eq("user_id", userId),
    supabase.from("visits").select("*").eq("user_id", userId),
  ]);
  if (properties.error) throw properties.error;
  if (visits.error) throw visits.error;
  await db.transaction("rw", db.localProperties, db.localVisits, async () => {
    const remoteProperties = properties.data as Property[],
      remoteVisits = visits.data as Visit[];
    for (const p of remoteProperties) {
      const local = await db.localProperties.get(p.id);
      if (!local || local.sync_status === "synced")
        await db.localProperties.put({
          ...p,
          sync_status: "synced",
          local_updated_at: p.updated_at,
        } as LocalProperty);
    }
    for (const v of remoteVisits) {
      const local = await db.localVisits.get(v.id);
      if (!local || local.sync_status === "synced")
        await db.localVisits.put({
          ...v,
          sync_status: "synced",
          local_updated_at: v.updated_at,
        } as LocalVisit);
    }
    const propertyIds = new Set(remoteProperties.map((p) => p.id)),
      visitIds = new Set(remoteVisits.map((v) => v.id));
    for (const p of await db.localProperties
      .where("user_id")
      .equals(userId)
      .toArray())
      if (p.sync_status === "synced" && !propertyIds.has(p.id))
        await db.localProperties.delete(p.id);
    for (const v of await db.localVisits
      .where("user_id")
      .equals(userId)
      .toArray())
      if (v.sync_status === "synced" && !visitIds.has(v.id))
        await db.localVisits.delete(v.id);
  });
}
