import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate } from "react-router-dom";
import { supabase, authStorageKey } from "./supabase";
import { readCachedSession } from "./cached-session";
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() =>
      readCachedSession(authStorageKey, localStorage),
    ),
    [loading, setLoading] = useState(
      () =>
        !readCachedSession(authStorageKey, localStorage) && navigator.onLine,
    );
  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, value) => {
      if (active && (navigator.onLine || value || _event === "SIGNED_OUT")) {
        setSession(value);
        setLoading(false);
      }
    });
    const refresh = () => {
      if (!navigator.onLine) return;
      void supabase.auth.startAutoRefresh();
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (active) {
            setSession(data.session);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    };
    refresh();
    const pause = () => {
      void supabase.auth.stopAutoRefresh();
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", pause);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", pause);
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  return loading ? (
    <p role="status">Abriendo tu espacio…</p>
  ) : session ? (
    children
  ) : (
    <Navigate to="/login" replace />
  );
}
