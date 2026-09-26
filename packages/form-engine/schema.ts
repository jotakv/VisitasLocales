import { z } from "zod";
import { sourceTypes, type Json, type AnswerContent } from "../domain";

export const sourceLabels = {
  observed: "Observado durante la visita",
  seller_claim: "Declarado por vendedor / comercial",
  architect_check: "Comprobar con arquitecto / técnico",
  municipal_check: "Confirmar con Urbanismo / Ayuntamiento",
  documentary: "Comprobación documental",
  unknown: "Procedencia no determinada",
} as const;
export const fieldTypes = [
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "multiselect",
  "measurement",
  "checklist",
  "repeatable",
  "photo",
  "document",
] as const;
const option = z.union([
  z.string(),
  z.object({
    value: z.string(),
    label: z.string(),
    requiresTape: z.boolean().optional(),
  }),
]);
const baseField = z.object({
  id: z.string().min(1),
  type: z.enum(fieldTypes),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  critical: z.boolean().default(false),
  unit: z.string().nullable().optional(),
  defaultSourceType: z.enum(sourceTypes).optional(),
  sourceType: z
    .enum(["observed", "measured", "declared", "documented"])
    .optional(),
  options: z.array(option).optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  group: z.string().optional(),
  inputMode: z.enum(["text", "tel", "decimal", "numeric"]).optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
    })
    .optional(),
  visibleWhen: z
    .object({
      field: z.string(),
      operator: z.enum(["equals", "notEquals", "includes"]),
      value: z.unknown(),
    })
    .optional(),
  itemDetails: z.literal("severity_notes").optional(),
  autoFillFrom: z.string().optional(),
});
export const fieldSchema = baseField.extend({
  fields: z.array(baseField).optional(),
  initialItems: z.array(z.record(z.string(), z.unknown())).optional(),
});
export const formSchema = z.object({
  schema_id: z.string(),
  schema_version: z.string(),
  municipality: z.string().optional(),
  description: z.string().optional(),
  sections: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      kind: z.enum(["questions", "summary", "status"]).default("questions"),
      summaryFields: z
        .array(z.object({ label: z.string(), field: z.string() }))
        .optional(),
      fields: z.array(fieldSchema),
    }),
  ),
});
export type Field = z.infer<typeof fieldSchema>;
export type FormSchema = z.infer<typeof formSchema>;
export type Answers = Record<string, AnswerContent>;
export const optionValue = (o: z.infer<typeof option>) =>
  typeof o === "string" ? o : o.value;
export const optionLabel = (o: z.infer<typeof option>) =>
  typeof o === "string" ? o : o.label;
export function defaultSource(field: Field) {
  const legacy = {
    observed: "observed",
    measured: "observed",
    declared: "seller_claim",
    documented: "documentary",
  } as const;
  return (
    field.defaultSourceType ??
    (field.sourceType ? legacy[field.sourceType] : "unknown")
  );
}
export function emptyAnswer(field: Field): AnswerContent {
  return {
    value_json: null,
    source_type: defaultSource(field),
    verified: false,
    notes: "",
  };
}
export function visible(field: Field, answers: Answers) {
  const c = field.visibleWhen;
  if (!c) return true;
  const value = answers[c.field]?.value_json;
  if (c.operator === "equals") return value === c.value;
  if (c.operator === "notEquals") return value !== c.value;
  return Array.isArray(value) && value.includes(c.value as Json);
}
export function validationError(
  field: Field,
  value: Json | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (["number", "measurement"].includes(field.type)) {
    if (typeof value !== "number" || !Number.isFinite(value))
      return "Introduce un número válido.";
    if (field.validation?.min !== undefined && value < field.validation.min)
      return `Mínimo: ${field.validation.min}.`;
    if (field.validation?.max !== undefined && value > field.validation.max)
      return `Máximo: ${field.validation.max}.`;
  }
  if (typeof value === "string") {
    if (
      field.validation?.maxLength &&
      value.length > field.validation.maxLength
    )
      return "Texto demasiado largo.";
    if (
      field.validation?.pattern &&
      !new RegExp(field.validation.pattern).test(value)
    )
      return "Revisa el formato.";
  }
  return null;
}
export function answered(field: Field, answer?: AnswerContent): boolean {
  const value = answer?.value_json;
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  )
    return false;
  if (validationError(field, value)) return false;
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "repeatable")
    return (
      Array.isArray(value) &&
      value.every(
        (row) =>
          row !== null &&
          typeof row === "object" &&
          !Array.isArray(row) &&
          (field.fields ?? []).every(
            (child) =>
              !child.required ||
              answered(child, {
                ...emptyAnswer(child),
                value_json: row[child.id] ?? null,
              }),
          ),
      )
    );
  if (field.itemDetails === "severity_notes")
    return (
      Array.isArray(value) &&
      value.every(
        (row) =>
          row !== null &&
          typeof row === "object" &&
          !Array.isArray(row) &&
          ["low", "medium", "high", "potential_blocker"].includes(
            String(row.severity),
          ),
      )
    );
  return true; // Explicit [] records 'none/not applicable'; an untouched checklist is null.
}
export function progress(schema: FormSchema, answers: Answers) {
  const fields = schema.sections
    .flatMap((s) => s.fields)
    .filter(
      (f) => visible(f, answers) && !["photo", "document"].includes(f.type),
    );
  const required = fields.filter((f) => f.required),
    critical = fields.filter((f) => f.critical);
  const done = (f: Field) => answered(f, answers[f.id]);
  const weight = (f: Field) => (f.critical ? 3 : f.required ? 2 : 1);
  const denominator = fields.reduce((n, f) => n + weight(f), 0);
  return {
    percent: denominator
      ? Math.round(
          (fields.filter(done).reduce((n, f) => n + weight(f), 0) /
            denominator) *
            100,
        )
      : 100,
    answered: fields.filter(done).length,
    total: fields.length,
    requiredDone: required.filter(done).length,
    requiredTotal: required.length,
    criticalDone: critical.filter(done).length,
    criticalTotal: critical.length,
    criticalPending: critical.filter((f) => !done(f)),
    requiredPending: required.filter((f) => !done(f)),
    criticalUnverified: critical.filter(
      (f) => done(f) && !answers[f.id]?.verified,
    ),
  };
}
export function assertSchema(schema: FormSchema) {
  const sections = new Set<string>(),
    ids = new Set<string>();
  for (const section of schema.sections) {
    if (sections.has(section.id))
      throw new Error(`Duplicate section: ${section.id}`);
    sections.add(section.id);
    for (const field of section.fields)
      for (const item of [field, ...(field.fields ?? [])]) {
        if (ids.has(item.id)) throw new Error(`Duplicate field: ${item.id}`);
        ids.add(item.id);
        if (
          ["select", "multiselect", "checklist"].includes(item.type) &&
          !item.options?.length
        )
          throw new Error(`Missing options: ${item.id}`);
        if (item.validation?.pattern) new RegExp(item.validation.pattern);
      }
  }
  for (const section of schema.sections) {
    for (const item of section.summaryFields ?? [])
      if (!ids.has(item.field))
        throw new Error(`Unknown summary field: ${item.field}`);
    for (const f of section.fields) {
      if (f.visibleWhen && !ids.has(f.visibleWhen.field))
        throw new Error(`Unknown condition: ${f.id}`);
      if (f.autoFillFrom && !ids.has(f.autoFillFrom))
        throw new Error(`Unknown autofill: ${f.id}`);
    }
  }
  return schema;
}
