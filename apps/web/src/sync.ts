import { useSyncExternalStore } from "react";
import { db } from "./db";
import { supabase } from "./supabase";
import { syncOnce, type RemoteStore } from "./sync-core";
import type { Property, Visit, VisitAnswer } from "../../../packages/domain";
const inFlight = new Map<string, Promise<void>>(),
  rerun = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>(),
  firstChange = new Map<string, number>();
type SyncState = { syncing: boolean; error: string; lastSync: string | null };
const states = new Map<string, SyncState>(),
  listeners = new Set<() => void>();
const fallback: SyncState = { syncing: false, error: "", lastSync: null };
const emit = (id: string, patch: Partial<SyncState>) => {
  states.set(id, { ...(states.get(id) ?? fallback), ...patch });
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function useSyncState(userId: string) {
  return useSyncExternalStore(subscribe, () => states.get(userId) ?? fallback);
}
async function listAll<T>(table: string, userId: string): Promise<T[]> {
  const all: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id")
      .range(start, start + 499);
    if (error) throw error;
    all.push(...(data as T[]));
    if (data.length < 500) return all;
  }
}
function remoteFor(userId: string): RemoteStore {
  const put = async <T extends Property | Visit | VisitAnswer>(
    table: string,
    row: T,
    onConflict = "id",
  ) => {
    const { data, error } = await supabase
      .from(table)
      .upsert(row, { onConflict })
      .select()
      .single();
    if (error) throw error;
    return data as T;
  };
  return {
    userId: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session?.user.id;
    },
    properties: () => listAll<Property>("properties", userId),
    visits: () => listAll<Visit>("visits", userId),
    answers: () => listAll<VisitAnswer>("visit_answers", userId),
    putProperty: (row) => put("properties", row),
    putVisit: (row) => put("visits", row),
    putAnswer: (row) => put("visit_answers", row, "visit_id,question_id"),
    deleteAnswer: async (id) => {
      const { error } = await supabase
        .from("visit_answers")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
    },
  };
}
export function synchronize(userId: string): Promise<void> {
  if (!navigator.onLine) return Promise.resolve();
  const current = inFlight.get(userId);
  if (current) {
    rerun.add(userId);
    return current;
  }
  clearTimeout(timers.get(userId));
  timers.delete(userId);
  firstChange.delete(userId);
  emit(userId, {
    syncing: true,
    error: "",
    lastSync:
      states.get(userId)?.lastSync ??
      localStorage.getItem(`lv:lastSync:${userId}`),
  });
  const task = (async () => {
    let completed: boolean;
    do {
      rerun.delete(userId);
      completed = await syncOnce(db, remoteFor(userId), userId);
    } while (rerun.has(userId) && navigator.onLine);
    if (!completed || !navigator.onLine) return;
    const lastSync = new Date().toISOString();
    localStorage.setItem(`lv:lastSync:${userId}`, lastSync);
    emit(userId, { lastSync, error: "" });
  })()
    .catch((e) => {
      emit(userId, { error: e instanceof Error ? e.message : String(e) });
      throw e;
    })
    .finally(() => {
      inFlight.delete(userId);
      emit(userId, { syncing: false });
    });
  inFlight.set(userId, task);
  return task;
}
export function scheduleSync(userId: string) {
  const first = firstChange.get(userId) ?? Date.now();
  firstChange.set(userId, first);
  clearTimeout(timers.get(userId));
  timers.set(
    userId,
    setTimeout(
      () => {
        void synchronize(userId).catch(() => {});
      },
      Math.min(700, Math.max(0, 4000 - (Date.now() - first))),
    ),
  );
}
