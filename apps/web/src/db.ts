import Dexie, { type EntityTable } from "dexie";
import type { LocalProperty, LocalVisit } from "../../../packages/domain";
export const db = new Dexie("localvivienda") as Dexie & {
  localProperties: EntityTable<LocalProperty, "id">;
  localVisits: EntityTable<LocalVisit, "id">;
};
db.version(1).stores({
  localProperties: "id,user_id,sync_status",
  localVisits: "id,user_id,property_id,sync_status",
});
export function deviceId() {
  let id = localStorage.getItem("localvivienda:device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("localvivienda:device", id);
  }
  return id;
}
