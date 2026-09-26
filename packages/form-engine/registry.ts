import legacy from "../../schemas/common/change-use-base.json";
import legacyZaragoza from "../../schemas/zaragoza/overlay.json";
import common from "../../schemas/common/change-use-base.v0.2.0.json";
import zaragoza from "../../schemas/zaragoza/overlay.v0.2.0.json";
import {
  assertSchema,
  formSchema,
  type FormSchema,
  type Field,
} from "./schema";

export interface Overlay {
  schema_id: string;
  schema_version: string;
  extends: { schema_id: string; schema_version: string };
  municipality: string;
  overrides: Record<string, Partial<Field>>;
  addFields: { section_id: string; field: unknown }[];
}
export function compose(base: FormSchema, overlay: Overlay): FormSchema {
  if (
    overlay.extends.schema_id !== base.schema_id ||
    overlay.extends.schema_version !== base.schema_version
  )
    throw new Error("El overlay no corresponde a esta versión de la base.");
  const result = structuredClone(base);
  result.schema_id = overlay.schema_id;
  result.schema_version = overlay.schema_version;
  result.municipality = overlay.municipality;
  for (const [id, override] of Object.entries(overlay.overrides)) {
    const field = result.sections
      .flatMap((s) => s.fields)
      .find((f) => f.id === id);
    if (!field) throw new Error(`Override desconocido: ${id}`);
    Object.assign(field, override, { id });
  }
  for (const addition of overlay.addFields) {
    const section = result.sections.find((s) => s.id === addition.section_id);
    if (!section)
      throw new Error(`Sección desconocida: ${addition.section_id}`);
    section.fields.push(addition.field as Field);
  }
  return assertSchema(formSchema.parse(result));
}
export const commonSchema = assertSchema(formSchema.parse(common));
export const zaragozaSchema = compose(commonSchema, zaragoza as Overlay);
export const historicalSchema = assertSchema(formSchema.parse(legacy));
const registry = new Map<string, FormSchema>([
  [`${historicalSchema.schema_id}@0.1.0`, historicalSchema],
  [
    `${legacyZaragoza.schema_id}@0.1.0`,
    {
      ...historicalSchema,
      schema_id: legacyZaragoza.schema_id,
      municipality: "Zaragoza",
    },
  ],
  [`${commonSchema.schema_id}@0.2.0`, commonSchema],
  [`${zaragozaSchema.schema_id}@0.2.0`, zaragozaSchema],
]);
export function getSchema(id: string, version: string) {
  const schema = registry.get(`${id}@${version}`);
  if (!schema)
    throw new Error(
      `Formulario ${id} v${version} no disponible. Conserva la visita y actualiza la aplicación.`,
    );
  return schema;
}
export function schemaForMunicipality(municipality: string) {
  return municipality.trim().toLocaleLowerCase("es") === "zaragoza"
    ? zaragozaSchema
    : commonSchema;
}
