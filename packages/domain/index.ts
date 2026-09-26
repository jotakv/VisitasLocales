export type SyncStatus =
  "synced" | "pending_create" | "pending_update" | "pending_delete" | "error";
export interface SyncMeta {
  sync_status: SyncStatus;
  local_updated_at: string;
  sync_error?: string;
}
export interface Property {
  id: string;
  user_id: string;
  address: string;
  municipality: string;
  province: string;
  postal_code: string;
  cadastral_reference: string;
  asking_price: number | null;
  built_area: number | null;
  usable_area: number | null;
  created_at: string;
  updated_at: string;
}
export interface Visit {
  id: string;
  property_id: string;
  user_id: string;
  schema_id: string;
  schema_version: string;
  status: "draft" | "syncing" | "completed" | "exported" | "analysed";
  started_at: string;
  completed_at: string | null;
  device_id: string;
  created_at: string;
  updated_at: string;
}
export type LocalProperty = Property & SyncMeta;
export type LocalVisit = Visit & SyncMeta;
