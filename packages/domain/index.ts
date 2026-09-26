export type SyncStatus =
  "synced" | "pending_create" | "pending_update" | "pending_delete" | "error";
export interface SyncMeta {
  sync_status: SyncStatus;
  local_updated_at: string;
  sync_error?: string;
  local_revision?: number;
  pending_operation?: "upsert" | "delete";
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
export const sourceTypes = [
  "observed",
  "seller_claim",
  "architect_check",
  "municipal_check",
  "documentary",
  "unknown",
] as const;
export type SourceType = (typeof sourceTypes)[number];
export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };
export interface AnswerContent {
  value_json: Json;
  source_type: SourceType;
  verified: boolean;
  notes: string;
}
export interface VisitAnswer extends AnswerContent {
  id: string;
  visit_id: string;
  user_id: string;
  question_id: string;
  section_id: string | null;
  created_at: string;
  updated_at: string;
}
export type LocalVisitAnswer = VisitAnswer & SyncMeta;
export interface VisitCursor {
  visit_id: string;
  user_id: string;
  section_id: string;
}
