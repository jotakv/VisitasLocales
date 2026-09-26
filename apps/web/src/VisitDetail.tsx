import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./auth";
import { db } from "./db";
import { saveAnswer } from "./answers";
import { scheduleSync, synchronize, useSyncState } from "./sync";
import {
  FormEngine,
  defaultSource,
  displayValue,
  emptyAnswer,
  progress,
  type Answers,
  type Field,
  type FormSchema,
} from "../../../packages/form-engine";
import { getSchema } from "../../../packages/form-engine/registry";
import type {
  AnswerContent,
  LocalProperty,
  LocalVisit,
} from "../../../packages/domain";

export function VisitDetail() {
  const { visitId } = useParams(),
    { session } = useAuth(),
    userId = session!.user.id;
  const data = useLiveQuery(async () => {
    const visit = await db.localVisits.get(visitId!);
    if (!visit || visit.user_id !== userId) return null;
    const property = await db.localProperties.get(visit.property_id);
    return {
      visit,
      property: property?.user_id === userId ? property : undefined,
    };
  }, [visitId, userId]);
  useEffect(() => {
    void synchronize(userId).catch(() => {});
  }, [visitId, userId]);
  if (data === undefined) return <p>Cargando datos del dispositivo…</p>;
  if (!data)
    return (
      <p>
        Visita no disponible en esta cuenta o dispositivo. Si todavía no la has
        abierto aquí, conecta a Internet y pulsa Sincronizar.
      </p>
    );
  let schema: FormSchema;
  try {
    schema = getSchema(data.visit.schema_id, data.visit.schema_version);
  } catch (e) {
    return (
      <p role="alert">
        {e instanceof Error ? e.message : "Formulario no disponible"}
      </p>
    );
  }
  return (
    <Inspection
      key={data.visit.id}
      visit={data.visit}
      property={data.property}
      schema={schema}
      userId={userId}
    />
  );
}
type Draft = {
  answer: AnswerContent;
  sequence: number;
  savedAt?: string;
  field: Field;
  sectionId: string;
  failed?: boolean;
};
function Inspection({
  visit,
  property,
  schema,
  userId,
}: {
  visit: LocalVisit;
  property?: LocalProperty;
  schema: FormSchema;
  userId: string;
}) {
  const navigate = useNavigate(),
    sync = useSyncState(userId);
  const stored = useLiveQuery(
    () =>
      db.localVisitAnswers
        .where("visit_id")
        .equals(visit.id)
        .filter((a) => a.user_id === userId && a.pending_operation !== "delete")
        .toArray(),
    [visit.id, userId],
  );
  const cursor = useLiveQuery(() => db.visitCursors.get(visit.id), [visit.id]);
  const [chosenSection, setChosenSection] = useState<string>(),
    [panel, setPanel] = useState<"sections" | "critical" | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(0),
    [localError, setLocalError] = useState("");
  const sequence = useRef(0),
    lastAnswers = useRef<Answers>({});
  const records = Object.fromEntries(
    (stored ?? []).map((a) => [a.question_id, a]),
  );
  const answers: Answers = { ...records };
  for (const [id, draft] of Object.entries(drafts)) {
    if (
      !draft.savedAt ||
      !records[id] ||
      Date.parse(records[id].local_updated_at) < Date.parse(draft.savedAt)
    )
      answers[id] = draft.answer;
  }
  lastAnswers.current = answers;
  const sectionId =
    chosenSection ??
    (cursor?.user_id === userId ? cursor.section_id : undefined) ??
    schema.sections[0].id;
  const sectionIndex = Math.max(
      0,
      schema.sections.findIndex((s) => s.id === sectionId),
    ),
    section = schema.sections[sectionIndex];
  const state = progress(schema, answers),
    failed = Object.values(drafts).filter((d) => d.failed);
  const mustWarn =
    state.criticalPending.length > 0 || saving > 0 || failed.length > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && mustWarn,
  );
  const savedCopy = saving
    ? "Guardando en dispositivo…"
    : failed.length
      ? "Error de guardado local · no cierres todavía"
      : "Guardado en dispositivo · puedes cerrar";

  async function persist(draft: Draft) {
    setSaving((n) => n + 1);
    try {
      const saved = await saveAnswer({
        userId,
        visitId: visit.id,
        questionId: draft.field.id,
        sectionId: draft.sectionId,
        defaultSource: defaultSource(draft.field),
        patch: draft.answer,
      });
      setDrafts((all) =>
        all[draft.field.id]?.sequence === draft.sequence
          ? {
              ...all,
              [draft.field.id]: {
                ...draft,
                savedAt: saved.local_updated_at,
                failed: false,
              },
            }
          : all,
      );
      setLocalError("");
      scheduleSync(userId);
    } catch (e) {
      setLocalError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar en este dispositivo.",
      );
      setDrafts((all) =>
        all[draft.field.id]?.sequence === draft.sequence
          ? { ...all, [draft.field.id]: { ...draft, failed: true } }
          : all,
      );
    } finally {
      setSaving((n) => n - 1);
    }
  }
  function change(
    field: Field,
    sectionId: string,
    patch: Partial<AnswerContent>,
  ) {
    const answer = {
      ...(lastAnswers.current[field.id] ?? emptyAnswer(field)),
      ...patch,
    };
    lastAnswers.current[field.id] = answer;
    const draft = { answer, sequence: ++sequence.current, field, sectionId };
    setDrafts((all) => ({ ...all, [field.id]: draft }));
    void persist(draft);
  }
  async function goSection(id: string) {
    setChosenSection(id);
    setPanel(null);
    try {
      await db.visitCursors.put({
        visit_id: visit.id,
        user_id: userId,
        section_id: id,
      });
    } catch {
      setLocalError(
        "No se pudo guardar la última sección en este dispositivo.",
      );
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (saving || failed.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saving, failed.length]);
  const closePanel = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setPanel(null);
  };
  if (stored === undefined) return <p>Cargando respuestas del dispositivo…</p>;
  return (
    <article className="inspection">
      <button
        type="button"
        className="text-button back"
        onClick={() => navigate(`/app/properties/${visit.property_id}`)}
      >
        ← Inmueble
      </button>
      <h1>{property?.address ?? "Visita"}</h1>
      <div className="inspection-summary">
        <span className="badge">
          {visit.status === "draft" ? "Borrador" : visit.status}
        </span>{" "}
        <small>
          Formulario v{schema.schema_version}
          {schema.municipality && ` · ${schema.municipality}`}
        </small>
        <p role="status" className={failed.length ? "save-error" : "saved"}>
          {savedCopy}
        </p>
        {localError && <p role="alert">{localError}</p>}
        {!!failed.length && (
          <button
            onClick={() => {
              failed.forEach((d) => void persist(d));
            }}
          >
            Reintentar guardado local
          </button>
        )}
        <div className="progress-label">
          <strong>Progreso: {state.percent} %</strong>
          <span>{state.answered} datos recogidos</span>
        </div>
        <progress
          value={state.percent}
          max={100}
          aria-label="Progreso de la visita"
        />
        <p className="counts">
          Obligatorios: {state.requiredDone} / {state.requiredTotal} · Críticos:{" "}
          {state.criticalDone} / {state.criticalTotal}
        </p>
        <div className="inspection-actions">
          <button onClick={() => setPanel("sections")}>Secciones</button>
          <button className="light" onClick={() => setPanel("critical")}>
            Críticos pendientes ({state.criticalPending.length})
          </button>
        </div>
      </div>
      <div className="section-title" tabIndex={-1}>
        <p>
          Sección {sectionIndex + 1} de {schema.sections.length}
        </p>
        <h2>{section.title}</h2>
        {section.description && <p>{section.description}</p>}
      </div>
      {section.kind === "summary" && (
        <dl className="inspection-recap">
          {section.summaryFields?.map((item) => {
            const field = schema.sections
              .flatMap((s) => s.fields)
              .find((f) => f.id === item.field);
            return (
              <div key={item.field}>
                <dt>{item.label}</dt>
                <dd>{displayValue(field, answers[item.field]?.value_json)}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {section.kind === "status" && (
        <div className="card">
          <p>
            Datos recogidos: {state.answered} / {state.total}
          </p>
          <p>Campos críticos completos: {state.criticalDone}</p>
          <p>Campos críticos pendientes: {state.criticalPending.length}</p>
          <p>Campos obligatorios pendientes: {state.requiredPending.length}</p>
          <p>
            Críticos con respuesta aún no verificada:{" "}
            {state.criticalUnverified.length}
          </p>
          <p>
            Última sincronización:{" "}
            {sync.lastSync
              ? new Date(sync.lastSync).toLocaleString("es-ES")
              : "Todavía sin sincronizar"}
          </p>
          <p>
            Completar datos no confirma la viabilidad ni finaliza esta visita.
          </p>
        </div>
      )}
      <FormEngine
        schema={schema}
        sectionId={section.id}
        answers={answers}
        onChange={change}
      />
      <div className="section-nav">
        <button
          disabled={sectionIndex === 0}
          onClick={() => void goSection(schema.sections[sectionIndex - 1].id)}
        >
          ← Anterior
        </button>
        <span>
          {sectionIndex + 1} / {schema.sections.length}
        </span>
        <button
          disabled={sectionIndex === schema.sections.length - 1}
          onClick={() => void goSection(schema.sections[sectionIndex + 1].id)}
        >
          Siguiente →
        </button>
      </div>
      {panel && (
        <div className="modal-backdrop" onClick={closePanel}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              panel === "sections"
                ? "Índice de secciones"
                : "Comprobaciones críticas pendientes"
            }
            className="inspection-modal"
          >
            <button
              className="text-button modal-close"
              onClick={() => setPanel(null)}
              autoFocus
            >
              Cerrar
            </button>
            <h2>
              {panel === "sections"
                ? "Secciones"
                : "Comprobaciones críticas pendientes"}
            </h2>
            {panel === "sections" ? (
              schema.sections.map((s) => {
                const p = progress({ ...schema, sections: [s] }, answers);
                return (
                  <button
                    className="section-link"
                    key={s.id}
                    onClick={() => void goSection(s.id)}
                  >
                    <strong>{s.title}</strong>
                    <small>
                      {p.answered === p.total ? "Completa" : "Incompleta"} ·{" "}
                      {p.answered}/{p.total} datos · {p.criticalPending.length}{" "}
                      críticos pendientes
                    </small>
                  </button>
                );
              })
            ) : state.criticalPending.length ? (
              state.criticalPending.map((field) => (
                <button
                  className="section-link"
                  key={field.id}
                  onClick={() => {
                    const s = schema.sections.find((s) =>
                      s.fields.some((f) => f.id === field.id),
                    )!;
                    void goSection(s.id).then(() =>
                      requestAnimationFrame(() =>
                        document
                          .getElementById(`question-${field.id}`)
                          ?.scrollIntoView({ block: "start" }),
                      ),
                    );
                  }}
                >
                  {field.label}
                </button>
              ))
            ) : (
              <p>
                No quedan campos críticos sin respuesta. Revisa también la
                evidencia y los datos no verificados.
              </p>
            )}
          </div>
        </div>
      )}
      {blocker.state === "blocked" && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Salir de la visita"
            className="inspection-modal"
          >
            <h2>
              Quedan {state.criticalPending.length} comprobaciones críticas
              pendientes.
            </h2>
            <p>
              {saving
                ? "Espera a que termine el guardado local."
                : failed.length
                  ? "Hay datos que no se han podido guardar. Salir puede perder esos cambios."
                  : "Las respuestas guardadas se conservarán para continuar después."}
            </p>
            <button onClick={() => blocker.reset?.()} autoFocus>
              Seguir revisando
            </button>
            <button
              className="text-button"
              disabled={saving > 0}
              onClick={() => {
                blocker.proceed?.();
              }}
            >
              Salir igualmente
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
