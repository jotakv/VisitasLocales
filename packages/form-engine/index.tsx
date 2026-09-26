import { z } from "zod";
export const fieldSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "number", "boolean", "measurement"]),
  label: z.string(),
  required: z.boolean(),
  critical: z.boolean(),
  unit: z.string().nullable(),
  sourceType: z.enum(["observed", "measured", "declared", "documented"]),
});
export const formSchema = z.object({
  schema_id: z.string(),
  schema_version: z.string(),
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      fields: z.array(fieldSchema),
    }),
  ),
});
export type FormSchema = z.infer<typeof formSchema>;
export function FormEngine({ schema }: { schema: FormSchema }) {
  return (
    <>
      {schema.sections.map((section) => (
        <fieldset key={section.id}>
          <legend>{section.title}</legend>
          {section.fields.map((field) => (
            <label key={field.id}>
              {field.label}
              {field.critical && <span className="critical"> · Crítico</span>}
              {field.unit && ` (${field.unit})`}
              <input
                name={field.id}
                type={
                  field.type === "boolean"
                    ? "checkbox"
                    : field.type === "text"
                      ? "text"
                      : "number"
                }
                step={
                  field.type === "text" || field.type === "boolean"
                    ? undefined
                    : "any"
                }
                required={field.required}
                aria-label={field.label}
              />
              <small>Fuente: {field.sourceType}</small>
            </label>
          ))}
        </fieldset>
      ))}
    </>
  );
}
