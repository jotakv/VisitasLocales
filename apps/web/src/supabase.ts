import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const authStorageKey = `sb-${new URL(url || "https://unconfigured.supabase.co").hostname.split(".")[0]}-auth-token`;
export const supabase = createClient(
  url || "https://unconfigured.supabase.co",
  key || "unconfigured",
  { auth: { storageKey: authStorageKey, autoRefreshToken: navigator.onLine } },
);
