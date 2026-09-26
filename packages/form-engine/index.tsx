import type { AnswerContent, Json } from "../domain";
import { sourceTypes } from "../domain";
import {
  emptyAnswer,
  optionLabel,
  optionValue,
  sourceLabels,
  validationError,
  visible,
  type Answers,
  type Field,
  type FormSchema,
} from "./schema";
export * from "./schema";

type ControlProps = {
  field: Field;
  value: Json;
  onValue: (value: Json) => void;
  prefix?: string;
};
const rowsOf = (value: Json): Record<string, Json>[] =>
  Array.isArray(value)
    ? value.filter(
        (r): r is Record<string, Json> =>
          r !== null && typeof r === "object" && !Array.isArray(r),
      )
    : [];
const severities = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "potential_blocker", label: "Posible impedimento" },
];
export function FieldControl({
  field,
  value,
  onValue,
  prefix = "",
}: ControlProps) {
  const id = `${prefix}${field.id}`;
  const common = {
    id,
    name: id,
    "aria-label": field.label,
    "aria-required": field.required,
    "aria-describedby": `${id}-help`,
  };
  if (field.type === "photo" || field.type === "document")
    return <p>Adjuntos disponibles en un próximo incremento.</p>;
  if (field.type === "textarea")
    return (
      <textarea
        {...common}
        rows={3}
        placeholder={field.placeholder}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onValue(e.target.value)}
      />
    );
  if (field.type === "boolean")
    return (
      <select
        {...common}
        value={value === true ? "true" : value === false ? "false" : ""}
        onChange={(e) =>
          onValue(e.target.value === "" ? null : e.target.value === "true")
        }
      >
        <option value="">Sin comprobar</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  if (field.type === "select")
    return (
      <select
        {...common}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onValue(e.target.value || null)}
      >
        <option value="">Seleccionar…</option>
        {field.options?.map((o) => (
          <option key={optionValue(o)} value={optionValue(o)}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    );
  if (field.type === "checklist" || field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="checklist" role="group" aria-label={field.label}>
        {field.options?.map((o) => {
          const code = optionValue(o),
            detail = rowsOf(value).find((r) => r.code === code);
          const checked = field.itemDetails
            ? !!detail
            : selected.includes(code);
          return (
            <div key={code}>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const rest = field.itemDetails
                      ? rowsOf(value).filter((r) => r.code !== code)
                      : selected.filter((v) => v !== code);
                    onValue(
                      e.target.checked
                        ? [
                            ...rest,
                            field.itemDetails
                              ? { code, severity: "medium", notes: "" }
                              : code,
                          ]
                        : rest,
                    );
                  }}
                />{" "}
                <span>
                  {optionLabel(o)}
                  {typeof o !== "string" && o.requiresTape && (
                    <small> · Requiere cinta métrica</small>
                  )}
                </span>
              </label>
              {detail && (
                <div className="flag-detail">
                  <label>
                    Gravedad: {optionLabel(o)}
                    <select
                      aria-label={`Gravedad: ${optionLabel(o)}`}
                      value={String(detail.severity)}
                      onChange={(e) =>
                        onValue(
                          rowsOf(value).map((r) =>
                            r.code === code
                              ? { ...r, severity: e.target.value }
                              : r,
                          ),
                        )
                      }
                    >
                      {severities.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Notas: {optionLabel(o)}
                    <textarea
                      aria-label={`Notas: ${optionLabel(o)}`}
                      value={String(detail.notes ?? "")}
                      onChange={(e) =>
                        onValue(
                          rowsOf(value).map((r) =>
                            r.code === code
                              ? { ...r, notes: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="text-button"
          onClick={() => onValue([])}
        >
          Ninguna / no aplica
        </button>
        {Array.isArray(value) && value.length === 0 && (
          <small>Registrado: ninguna opción / no aplica.</small>
        )}
      </div>
    );
  }
  if (field.type === "repeatable") {
    const rows =
      value === null
        ? ((field.initialItems ?? []) as Record<string, Json>[])
        : rowsOf(value);
    return (
      <div className="repeatable" role="group" aria-label={field.label}>
        {rows.map((row, index) => (
          <fieldset key={String(row.item_id ?? `initial-${index}`)}>
            <legend>
              {field.label} · {index + 1}
            </legend>
            {field.fields?.map((child) => (
              <div className="subfield" key={child.id}>
                <label htmlFor={`${id}-${index}-${child.id}`}>
                  {child.label}
                  {child.required && " *"}
                  {child.unit && ` (${child.unit})`}
                </label>
                <FieldControl
                  field={child}
                  prefix={`${id}-${index}-`}
                  value={row[child.id] ?? null}
                  onValue={(next) =>
                    onValue(
                      rows.map((r, i) =>
                        i === index ? { ...r, [child.id]: next } : r,
                      ),
                    )
                  }
                />
                {validationError(child, row[child.id]) && (
                  <small role="alert">
                    {validationError(child, row[child.id])}
                  </small>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              aria-label={`Quitar ${field.label} ${index + 1}`}
              onClick={() => onValue(rows.filter((_, i) => i !== index))}
            >
              Quitar elemento {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() => onValue([...rows, { item_id: crypto.randomUUID() }])}
        >
          Añadir elemento · {field.label}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => onValue([])}
        >
          No hay elementos / no aplica
        </button>
        {Array.isArray(value) && !value.length && (
          <small>Registrado: sin elementos.</small>
        )}
      </div>
    );
  }
  const numeric = field.type === "number" || field.type === "measurement";
  return (
    <input
      {...common}
      type={numeric ? "number" : field.inputMode === "tel" ? "tel" : "text"}
      inputMode={numeric ? "decimal" : field.inputMode}
      step={numeric ? "any" : undefined}
      min={field.validation?.min}
      max={field.validation?.max}
      placeholder={field.placeholder}
      value={
        typeof value === "string" || typeof value === "number" ? value : ""
      }
      onChange={(e) =>
        onValue(
          numeric
            ? e.target.value === ""
              ? null
              : Number(e.target.value)
            : e.target.value,
        )
      }
    />
  );
}
export function displayValue(
  field: Field | undefined,
  value: Json | undefined,
): string {
  if (value === undefined || value === null || value === "") return "Pendiente";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "Ninguno / no aplica";
    return value
      .map((item) => {
        if (typeof item === "string") {
          const o = field?.options?.find((o) => optionValue(o) === item);
          return o ? optionLabel(o) : item;
        }
        if (item && typeof item === "object" && !Array.isArray(item))
          return Object.entries(item)
            .filter(([k]) => k !== "item_id")
            .map(([key, v]) => {
              const child = field?.fields?.find((f) => f.id === key);
              return `${child?.label ?? key}: ${displayValue(child, v)}`;
            })
            .join("; ");
        return String(item);
      })
      .join(" · ");
  }
  return `${value}${field?.unit ? ` ${field.unit}` : ""}`;
}
export function FormEngine({
  schema,
  sectionId,
  answers = {},
  onChange = () => {},
}: {
  schema: FormSchema;
  sectionId?: string;
  answers?: Answers;
  onChange?: (
    field: Field,
    sectionId: string,
    patch: Partial<AnswerContent>,
  ) => void;
}) {
  return (
    <>
      {schema.sections
        .filter((s) => !sectionId || s.id === sectionId)
        .map((section) => (
          <div key={section.id}>
            {section.fields
              .filter((f) => visible(f, answers))
              .map((field) => {
                const answer = answers[field.id] ?? emptyAnswer(field),
                  error = validationError(field, answer.value_json);
                const suggestion = field.autoFillFrom
                  ? answers[field.autoFillFrom]?.value_json
                  : undefined;
                return (
                  <div
                    className="question"
                    key={field.id}
                    id={`question-${field.id}`}
                    data-question-id={field.id}
                  >
                    <label htmlFor={field.id}>
                      {field.label}
                      {field.required && <span title="Obligatorio"> *</span>}
                      {field.unit && ` (${field.unit})`}
                      {field.critical && (
                        <span className="critical"> · Crítico</span>
                      )}
                    </label>
                    {field.description && <p>{field.description}</p>}
                    <FieldControl
                      field={field}
                      value={answer.value_json}
                      onValue={(value) =>
                        onChange(field, section.id, { value_json: value })
                      }
                    />
                    {field.helpText && (
                      <small id={`${field.id}-help`}>{field.helpText}</small>
                    )}
                    {error && (
                      <small role="alert">
                        {error} El borrador se conserva.
                      </small>
                    )}
                    {suggestion !== undefined &&
                      suggestion !== null &&
                      answer.value_json === null && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onChange(field, section.id, {
                              value_json: suggestion,
                            })
                          }
                        >
                          Usar dato ya recogido:{" "}
                          {displayValue(field, suggestion)}
                        </button>
                      )}
                    <details className="answer-details">
                      <summary>
                        Detalles · {sourceLabels[answer.source_type]} ·{" "}
                        {answer.verified ? "Verificado" : "No verificado"}
                        {answer.notes && " · Con nota"}
                      </summary>
                      <label>
                        Fuente
                        <select
                          aria-label={`Fuente: ${field.label}`}
                          value={answer.source_type}
                          onChange={(e) =>
                            onChange(field, section.id, {
                              source_type: e.target
                                .value as AnswerContent["source_type"],
                            })
                          }
                        >
                          {sourceTypes.map((type) => (
                            <option key={type} value={type}>
                              {sourceLabels[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="check-option">
                        <input
                          type="checkbox"
                          aria-label={`Verificado: ${field.label}`}
                          checked={answer.verified}
                          onChange={(e) =>
                            onChange(field, section.id, {
                              verified: e.target.checked,
                            })
                          }
                        />{" "}
                        Verificado con evidencia
                      </label>
                      <small>
                        La fuente indica de dónde procede el dato. Verificado
                        indica si tienes evidencia que lo respalda.
                      </small>
                      <label>
                        Notas
                        <textarea
                          aria-label={`Notas: ${field.label}`}
                          placeholder="Añadir nota…"
                          value={answer.notes}
                          onChange={(e) =>
                            onChange(field, section.id, {
                              notes: e.target.value,
                            })
                          }
                          rows={2}
                        />
                      </label>
                    </details>
                  </div>
                );
              })}
          </div>
        ))}
    </>
  );
}
