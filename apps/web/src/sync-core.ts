import type { LocalDatabase } from "./db";
import type {
  LocalProperty,
  LocalVisit,
  LocalVisitAnswer,
  Property,
  Visit,
  VisitAnswer,
  SyncMeta,
} from "../../../packages/domain";
export interface RemoteStore {
  userId(): Promise<string | undefined>;
  properties(): Promise<Property[]>;
  visits(): Promise<Visit[]>;
  answers(): Promise<VisitAnswer[]>;
  putProperty(row: Property): Promise<Property>;
  putVisit(row: Visit): Promise<Visit>;
  putAnswer(row: VisitAnswer): Promise<VisitAnswer>;
  deleteAnswer(id: string): Promise<void>;
}
const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "No se pudo sincronizar. Reintenta cuando tengas conexión.";
function payload<T extends Property | Visit | VisitAnswer>(
  row: T & SyncMeta,
): T {
  const {
    sync_status,
    local_updated_at,
    sync_error,
    local_revision,
    pending_operation,
    ...result
  } = row;
  void sync_status;
  void local_updated_at;
  void sync_error;
  void local_revision;
  void pending_operation;
  return result as unknown as T;
}
const unchanged = (a: SyncMeta, b: SyncMeta) =>
  a.local_updated_at === b.local_updated_at &&
  a.local_revision === b.local_revision &&
  a.pending_operation === b.pending_operation;
export async function syncOnce(
  database: LocalDatabase,
  remote: RemoteStore,
  userId: string,
  online: () => boolean = () => navigator.onLine,
) {
  if (!online() || (await remote.userId()) !== userId) return false;
  const failures: string[] = [];
  // Dependencies: properties -> visits -> answers. Each acknowledgement checks the local revision.
  for (const row of await database.localProperties
    .where("user_id")
    .equals(userId)
    .toArray()) {
    if (row.sync_status === "synced") continue;
    try {
      const saved = await remote.putProperty(payload(row));
      await database.transaction("rw", database.localProperties, async () => {
        const current = await database.localProperties.get(row.id);
        if (current && unchanged(row, current))
          await database.localProperties.put({
            ...saved,
            sync_status: "synced",
            local_updated_at: saved.updated_at,
            local_revision: row.local_revision,
          });
      });
    } catch (e) {
      failures.push(errorText(e));
      await database.transaction("rw", database.localProperties, async () => {
        const current = await database.localProperties.get(row.id);
        if (current && unchanged(row, current))
          await database.localProperties.update(row.id, {
            sync_status: "error",
            sync_error: errorText(e),
          });
      });
    }
  }
  for (const row of await database.localVisits
    .where("user_id")
    .equals(userId)
    .toArray()) {
    if (row.sync_status === "synced") continue;
    const parent = await database.localProperties.get(row.property_id);
    if (parent?.sync_status !== "synced") continue;
    try {
      const saved = await remote.putVisit(payload(row));
      await database.transaction("rw", database.localVisits, async () => {
        const current = await database.localVisits.get(row.id);
        if (current && unchanged(row, current))
          await database.localVisits.put({
            ...saved,
            sync_status: "synced",
            local_updated_at: saved.updated_at,
            local_revision: row.local_revision,
          });
      });
    } catch (e) {
      failures.push(errorText(e));
      await database.transaction("rw", database.localVisits, async () => {
        const current = await database.localVisits.get(row.id);
        if (current && unchanged(row, current))
          await database.localVisits.update(row.id, {
            sync_status: "error",
            sync_error: errorText(e),
          });
      });
    }
  }
  for (const row of await database.localVisitAnswers
    .where("user_id")
    .equals(userId)
    .toArray()) {
    if (row.sync_status === "synced") continue;
    const parent = await database.localVisits.get(row.visit_id);
    if (parent?.sync_status !== "synced") continue;
    try {
      if (
        row.pending_operation === "delete" ||
        row.sync_status === "pending_delete"
      ) {
        await remote.deleteAnswer(row.id);
        await database.transaction(
          "rw",
          database.localVisitAnswers,
          async () => {
            const current = await database.localVisitAnswers.get(row.id);
            if (current && unchanged(row, current))
              await database.localVisitAnswers.delete(row.id);
          },
        );
      } else {
        const saved = await remote.putAnswer(payload(row));
        await database.transaction(
          "rw",
          database.localVisitAnswers,
          async () => {
            const current = await database.localVisitAnswers.get(row.id);
            if (current && unchanged(row, current)) {
              if (saved.id !== row.id)
                await database.localVisitAnswers.delete(row.id);
              await database.localVisitAnswers.put({
                ...saved,
                sync_status: "synced",
                local_updated_at: saved.updated_at,
                local_revision: row.local_revision,
              });
            }
          },
        );
      }
    } catch (e) {
      failures.push(errorText(e));
      await database.transaction("rw", database.localVisitAnswers, async () => {
        const current = await database.localVisitAnswers.get(row.id);
        if (current && unchanged(row, current))
          await database.localVisitAnswers.update(row.id, {
            sync_status: "error",
            sync_error: errorText(e),
          });
      });
    }
  }
  // Fetch a complete, paginated snapshot. Any failure aborts reconciliation/pruning.
  const [properties, visits, answers] = await Promise.all([
    remote.properties(),
    remote.visits(),
    remote.answers(),
  ]);
  await database.transaction(
    "rw",
    database.localProperties,
    database.localVisits,
    database.localVisitAnswers,
    database.visitCursors,
    async () => {
      for (const p of properties) {
        const current = await database.localProperties.get(p.id);
        if (!current || current.sync_status === "synced")
          await database.localProperties.put({
            ...p,
            sync_status: "synced",
            local_updated_at: p.updated_at,
          } as LocalProperty);
      }
      for (const v of visits) {
        const current = await database.localVisits.get(v.id);
        if (!current || current.sync_status === "synced")
          await database.localVisits.put({
            ...v,
            sync_status: "synced",
            local_updated_at: v.updated_at,
          } as LocalVisit);
      }
      for (const a of answers) {
        const current = await database.localVisitAnswers
          .where("[visit_id+question_id]")
          .equals([a.visit_id, a.question_id])
          .first();
        if (
          !current ||
          (current.sync_status === "synced" &&
            Date.parse(a.updated_at) >= Date.parse(current.updated_at))
        ) {
          if (current && current.id !== a.id)
            await database.localVisitAnswers.delete(current.id);
          await database.localVisitAnswers.put({
            ...a,
            sync_status: "synced",
            local_updated_at: a.updated_at,
          } as LocalVisitAnswer);
        }
      }
      const pids = new Set(properties.map((p) => p.id)),
        vids = new Set(visits.map((v) => v.id)),
        aids = new Set(answers.map((a) => a.id));
      for (const p of await database.localProperties
        .where("user_id")
        .equals(userId)
        .toArray())
        if (p.sync_status === "synced" && !pids.has(p.id))
          await database.localProperties.delete(p.id);
      for (const v of await database.localVisits
        .where("user_id")
        .equals(userId)
        .toArray())
        if (v.sync_status === "synced" && !vids.has(v.id)) {
          const pending = await database.localVisitAnswers
            .where("visit_id")
            .equals(v.id)
            .filter((a) => a.sync_status !== "synced")
            .count();
          // Retain an orphan with local edits for recovery; do not silently discard inspection data.
          if (!pending) {
            await database.localVisits.delete(v.id);
            await database.visitCursors.delete(v.id);
          }
        }
      for (const a of await database.localVisitAnswers
        .where("user_id")
        .equals(userId)
        .toArray())
        if (a.sync_status === "synced" && !aids.has(a.id))
          await database.localVisitAnswers.delete(a.id);
    },
  );
  if (failures.length) throw new Error([...new Set(failures)].join(" · "));
  const pending = await Promise.all([
    database.localProperties
      .where("user_id")
      .equals(userId)
      .filter((row) => row.sync_status !== "synced")
      .count(),
    database.localVisits
      .where("user_id")
      .equals(userId)
      .filter((row) => row.sync_status !== "synced")
      .count(),
    database.localVisitAnswers
      .where("user_id")
      .equals(userId)
      .filter((row) => row.sync_status !== "synced")
      .count(),
  ]);
  return online() && pending.every((count) => count === 0);
}
