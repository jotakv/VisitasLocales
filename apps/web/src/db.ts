import Dexie, { type EntityTable } from "dexie";
import type {
  LocalProperty,
  LocalVisit,
  LocalVisitAnswer,
  VisitCursor,
} from "../../../packages/domain";
export function createDatabase(name = "localvivienda") {
  const database = new Dexie(name) as Dexie & {
    localProperties: EntityTable<LocalProperty, "id">;
    localVisits: EntityTable<LocalVisit, "id">;
    localVisitAnswers: EntityTable<LocalVisitAnswer, "id">;
    visitCursors: EntityTable<VisitCursor, "visit_id">;
  };
  database.version(1).stores({
    localProperties: "id,user_id,sync_status",
    localVisits: "id,user_id,property_id,sync_status",
  });
  // Additive upgrade: v1 stores and all existing records are preserved.
  database.version(2).stores({
    localProperties: "id,user_id,sync_status",
    localVisits: "id,user_id,property_id,sync_status",
    localVisitAnswers:
      "id,user_id,visit_id,&[visit_id+question_id],[user_id+sync_status]",
    visitCursors: "visit_id,user_id",
  });
  return database;
}
export type LocalDatabase = ReturnType<typeof createDatabase>;
export const db = createDatabase();
export function deviceId() {
  let id = localStorage.getItem("localvivienda:device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("localvivienda:device", id);
  }
  return id;
}
