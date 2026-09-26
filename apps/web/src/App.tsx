import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLiveQuery } from "dexie-react-hooks";
import { useAuth, RequireAuth } from "./auth";
import { configured, supabase } from "./supabase";
import { db, deviceId } from "./db";
import { synchronize } from "./sync";
import { FormEngine, formSchema } from "../../../packages/form-engine";
import baseSchema from "../../../schemas/common/change-use-base.json";
const schema = formSchema.parse(baseSchema);
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "No se pudo completar la operación.";
function Login() {
  const { session } = useAuth(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [signup, setSignup] = useState(false);
  if (session) return <Navigate to="/app" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const credentials = {
      email: String(form.get("email")),
      password: String(form.get("password")),
    };
    try {
      const result = signup
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setError(
          "Cuenta creada. Revisa tu correo para confirmar la dirección antes de entrar.",
        );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Link className="brand" to="/">
        LV<span>LocalVivienda</span>
      </Link>
      <div className="card">
        <p className="eyebrow">TU CUADERNO DE CAMPO</p>
        <h1>
          De local a<br />
          posibilidad.
        </h1>
        <p>Organiza tus inmuebles y empieza cada visita con todo a mano.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />
          </label>
          <button disabled={busy || !configured}>
            {busy ? "Conectando…" : signup ? "Crear cuenta" : "Entrar"}
          </button>
        </form>
        <button className="text-button" onClick={() => setSignup(!signup)}>
          {signup ? "Ya tengo una cuenta" : "Crear una cuenta"}
        </button>
        {!configured && (
          <p role="alert">Falta configurar la conexión con Supabase.</p>
        )}
        <p role="status">{error}</p>
      </div>
      <small>Visitas técnicas · Guardado local · Sincronización segura</small>
    </main>
  );
}
function Layout() {
  const { session } = useAuth(),
    [online, setOnline] = useState(navigator.onLine),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState("");
  const userId = session!.user.id;
  const pending = useLiveQuery(
    async () => {
      const p = await db.localProperties
        .where("user_id")
        .equals(userId)
        .toArray();
      const v = await db.localVisits.where("user_id").equals(userId).toArray();
      return [...p, ...v].filter((r) => r.sync_status !== "synced").length;
    },
    [userId],
    0,
  );
  useEffect(() => {
    let active = true;
    const sync = () => {
      setOnline(navigator.onLine);
      setSyncing(true);
      void synchronize(userId)
        .then(() => {
          if (active) setError("");
        })
        .catch((e) => {
          if (active) setError(message(e));
        })
        .finally(() => {
          if (active) setSyncing(false);
        });
    };
    sync();
    window.addEventListener("online", sync);
    const offline = () => setOnline(false);
    window.addEventListener("offline", offline);
    const timer = window.setInterval(sync, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", offline);
    };
  }, [userId]);
  async function logout() {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) setError(error.message);
  }
  return (
    <>
      <header>
        <Link className="brand" to="/app">
          LV<span>LocalVivienda</span>
        </Link>
        <button className="text-button" onClick={() => void logout()}>
          Salir
        </button>
      </header>
      <div className="statusbar">
        <span className={online ? "dot" : "dot offline"} />
        {online
          ? syncing
            ? "Sincronizando…"
            : "Con conexión"
          : "Sin conexión · guardado en este dispositivo"}
        <span>{pending ? `${pending} pendiente(s)` : "Sin pendientes"}</span>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error} Los datos locales se conservan.{" "}
          <button
            onClick={() =>
              void synchronize(userId).catch((e) => setError(message(e)))
            }
          >
            Reintentar
          </button>
        </p>
      )}
      <main key={userId}>
        <Outlet />
      </main>
      <nav>
        <Link to="/app">Inicio</Link>
        <Link to="/app/properties">Propiedades</Link>
        <Link to="/app/properties/new">+ Nueva</Link>
      </nav>
    </>
  );
}
function Dashboard() {
  const { session } = useAuth();
  const count = useLiveQuery(
    () => db.localProperties.where("user_id").equals(session!.user.id).count(),
    [session?.user.id],
    0,
  );
  return (
    <>
      <p className="eyebrow">ESPACIO DE TRABAJO</p>
      <h1>
        Cada visita,
        <br />
        un nuevo comienzo.
      </h1>
      <p className="lead">
        El primer paso para descubrir el potencial de un local.
      </p>
      <div className="hero">
        <span className="house">⌂</span>
        <div>
          <span className="count">{count}</span>
          <h2>Propiedades</h2>
          <p>Tus locales, en un solo lugar.</p>
        </div>
        <Link className="button light" to="/app/properties">
          Ver propiedades →
        </Link>
      </div>
      <Link className="button" to="/app/properties/new">
        + Nueva propiedad
      </Link>
      <p className="hint">
        Primero se guarda en este dispositivo. Después se sincroniza con tu
        cuenta.
      </p>
    </>
  );
}
function Properties() {
  const { session } = useAuth();
  const rows = useLiveQuery(
    () =>
      db.localProperties.where("user_id").equals(session!.user.id).toArray(),
    [session?.user.id],
  );
  return (
    <>
      <p className="eyebrow">TU CARTERA</p>
      <h1>Propiedades</h1>
      <Link className="button" to="new">
        + Nueva propiedad
      </Link>
      <div className="list">
        {rows?.length === 0 && (
          <div className="card">
            <h2>Todo empieza con un local</h2>
            <p>Añade su dirección y los datos que ya conozcas.</p>
          </div>
        )}
        {rows?.map((p) => (
          <Link className="card property" key={p.id} to={p.id}>
            <span className="eyebrow">
              {p.municipality} · {p.province}
            </span>
            <h2>{p.address}</h2>
            <p>
              {p.built_area ?? "—"} m² ·{" "}
              {p.asking_price?.toLocaleString("es-ES") ?? "—"} €
            </p>
            <small>
              {p.sync_status === "synced"
                ? "Sincronizado"
                : "Guardado local · pendiente de sincronizar"}
            </small>
          </Link>
        ))}
      </div>
    </>
  );
}
const numeric = z.preprocess(
  (v) => (v === "" || v === undefined ? null : Number(v)),
  z.number().finite().nonnegative().nullable(),
);
const propertyValidator = z.object({
  address: z.string().trim().min(1, "La dirección es obligatoria"),
  municipality: z.string().trim().min(1, "El municipio es obligatorio"),
  province: z.string().trim().min(1, "La provincia es obligatoria"),
  postal_code: z
    .string()
    .refine((v) => v === "" || /^\d{5}$/.test(v), "El CP debe tener 5 dígitos"),
  cadastral_reference: z.string().trim(),
  asking_price: numeric,
  built_area: numeric,
  usable_area: numeric,
});
const propertyFields = [
  ["address", "Dirección", "text"],
  ["municipality", "Municipio", "text"],
  ["province", "Provincia", "text"],
  ["postal_code", "Código postal", "text"],
  ["cadastral_reference", "Referencia catastral", "text"],
  ["asking_price", "Precio (€)", "number"],
  ["built_area", "Superficie construida (m²)", "number"],
  ["usable_area", "Superficie útil (m²)", "number"],
] as const;
function NewProperty() {
  const { session } = useAuth(),
    navigate = useNavigate(),
    [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Record<string, string>>();
  return (
    <>
      <Link className="back" to="/app/properties">
        ← Propiedades
      </Link>
      <h1>Nuevo inmueble</h1>
      <p>Empieza por lo esencial. Podrás seguir con la visita.</p>
      <form
        className="card"
        onSubmit={handleSubmit(async (values) => {
          const parsed = propertyValidator.safeParse(values);
          if (!parsed.success) {
            setError(parsed.error.issues.map((i) => i.message).join(". "));
            return;
          }
          try {
            const now = new Date().toISOString(),
              id = crypto.randomUUID();
            await db.localProperties.add({
              ...parsed.data,
              id,
              user_id: session!.user.id,
              created_at: now,
              updated_at: now,
              local_updated_at: now,
              sync_status: "pending_create",
            });
            void synchronize(session!.user.id).catch(() => {});
            navigate(`/app/properties/${id}`);
          } catch (e) {
            setError(message(e));
          }
        })}
      >
        {propertyFields.map(([id, label, type]) => (
          <label key={id}>
            {label}
            <input
              {...register(id)}
              type={type}
              required={["address", "municipality", "province"].includes(id)}
              min={type === "number" ? 0 : undefined}
              step={type === "number" ? "any" : undefined}
            />
          </label>
        ))}
        <p role="alert">{error}</p>
        <button disabled={isSubmitting}>Guardar inmueble</button>
      </form>
    </>
  );
}
function PropertyDetail() {
  const { propertyId } = useParams(),
    { session } = useAuth(),
    navigate = useNavigate(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const p = useLiveQuery(async () => {
    const row = await db.localProperties.get(propertyId!);
    return row?.user_id === session!.user.id ? row : null;
  }, [propertyId, session?.user.id]);
  const visits = useLiveQuery(
    () =>
      db.localVisits
        .where("property_id")
        .equals(propertyId!)
        .filter((v) => v.user_id === session!.user.id)
        .toArray(),
    [propertyId, session?.user.id],
    [],
  );
  if (p === undefined) return <p>Cargando inmueble…</p>;
  if (!p) return <p>Inmueble no disponible en esta cuenta o dispositivo.</p>;
  return (
    <>
      <Link className="back" to="/app/properties">
        ← Propiedades
      </Link>
      <p className="eyebrow">{p.municipality}</p>
      <h1>{p.address}</h1>
      <div className="card">
        <p>
          {p.province} · {p.postal_code}
        </p>
        <dl>
          <dt>Precio</dt>
          <dd>{p.asking_price ?? "—"} €</dd>
          <dt>Construidos / útiles</dt>
          <dd>
            {p.built_area ?? "—"} / {p.usable_area ?? "—"} m²
          </dd>
          <dt>Referencia catastral</dt>
          <dd>{p.cadastral_reference || "Sin referencia"}</dd>
        </dl>
        <small>
          {p.sync_status === "synced"
            ? "Sincronizado con Supabase"
            : "Guardado en este dispositivo"}
        </small>
      </div>
      <h2>Visitas</h2>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const now = new Date().toISOString(),
              id = crypto.randomUUID();
            await db.localVisits.add({
              id,
              property_id: p.id,
              user_id: session!.user.id,
              schema_id: schema.schema_id,
              schema_version: schema.schema_version,
              status: "draft",
              started_at: now,
              completed_at: null,
              device_id: deviceId(),
              created_at: now,
              updated_at: now,
              local_updated_at: now,
              sync_status: "pending_create",
            });
            void synchronize(session!.user.id).catch(() => {});
            navigate(`/app/visits/${id}`);
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        + Nueva visita
      </button>
      <p role="alert">{error}</p>
      <div className="list">
        {visits.map((v) => (
          <Link className="card" key={v.id} to={`/app/visits/${v.id}`}>
            <h3>
              Visita · {new Date(v.started_at).toLocaleDateString("es-ES")}
            </h3>
            <span className="badge">Borrador</span>
            <small>
              {" "}
              ·{" "}
              {v.sync_status === "synced"
                ? "Sincronizada"
                : "Guardada localmente"}
            </small>
          </Link>
        ))}
      </div>
    </>
  );
}
function VisitDetail() {
  const { visitId } = useParams(),
    { session } = useAuth();
  const data = useLiveQuery(async () => {
    const v = await db.localVisits.get(visitId!);
    if (!v || v.user_id !== session!.user.id) return null;
    const p = await db.localProperties.get(v.property_id);
    return { v, p: p?.user_id === session!.user.id ? p : null };
  }, [visitId, session?.user.id]);
  if (data === undefined) return <p>Cargando visita…</p>;
  if (!data) return <p>Visita no disponible en esta cuenta o dispositivo.</p>;
  const { v, p } = data;
  return (
    <>
      <Link className="back" to={`/app/properties/${v.property_id}`}>
        ← Inmueble
      </Link>
      <p className="eyebrow">VISITA TÉCNICA</p>
      <h1>{p?.address ?? "Visita"}</h1>
      <div className="card">
        <span className="badge">{v.status}</span>
        <p>{new Date(v.started_at).toLocaleString("es-ES")}</p>
        <small>
          {v.schema_id} · v{v.schema_version}
        </small>
        <p role="status">
          {v.sync_status === "synced"
            ? "Guardada en este dispositivo y sincronizada con Supabase"
            : "Guardada en este dispositivo · pendiente de sincronizar"}
        </p>
        {v.sync_error && <p role="alert">{v.sync_error}</p>}
      </div>
      <h2>Formulario de demostración</h2>
      <p className="notice">
        Estos campos se generan desde el esquema JSON. Sus respuestas todavía no
        se guardan; el autosave llegará en el incremento 2.
      </p>
      <FormEngine schema={schema} />
    </>
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/new" element={<NewProperty />} />
        <Route path="properties/:propertyId" element={<PropertyDetail />} />
        <Route path="visits/:visitId" element={<VisitDetail />} />
      </Route>
      <Route
        path="*"
        element={
          <main>
            <h1>Página no encontrada</h1>
            <Link to="/app">Volver al inicio</Link>
          </main>
        }
      />
    </Routes>
  );
}
