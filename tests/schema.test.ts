import { describe, expect, it } from "vitest";
import {
  commonSchema,
  getSchema,
  historicalSchema,
  schemaForMunicipality,
  zaragozaSchema,
  compose,
} from "../packages/form-engine/registry";
import {
  answered,
  assertSchema,
  emptyAnswer,
  formSchema,
  progress,
  visible,
  defaultSource,
} from "../packages/form-engine/schema";
import base from "../schemas/common/change-use-base.v0.2.0.json";
import type { Answers, Field } from "../packages/form-engine/schema";

describe("versioned inspection schemas", () => {
  it("parses JSON, validates IDs/options/section references and preserves exactly 28 sections", () => {
    expect(assertSchema(formSchema.parse(base)).sections).toHaveLength(28);
    expect(zaragozaSchema.sections).toHaveLength(28);
    expect(commonSchema.sections.flatMap((s) => s.fields)).toHaveLength(185);
    expect(zaragozaSchema.sections.flatMap((s) => s.fields)).toHaveLength(186);
  });
  it("retains the six historical fields and never silently upgrades an unknown version", () => {
    expect(getSchema("commercial-to-residential", "0.1.0")).toBe(
      historicalSchema,
    );
    expect(historicalSchema.sections.flatMap((s) => s.fields)).toHaveLength(6);
    expect(() => getSchema("commercial-to-residential", "9.0.0")).toThrow();
    expect(defaultSource(historicalSchema.sections[1].fields[1])).toBe(
      "observed",
    );
  });
  it("selects Zaragoza only for that municipality and adds one municipal field", () => {
    expect(schemaForMunicipality(" Zaragoza ")).toBe(zaragozaSchema);
    expect(schemaForMunicipality("Oliva")).toBe(commonSchema);
    expect(zaragozaSchema.sections[18].fields.at(-1)?.id).toBe(
      "zgz_commercial_axis_check",
    );
    expect(commonSchema.sections[18].fields).toHaveLength(6);
  });
  it("rejects duplicate IDs and broken overlay bases", () => {
    const bad = structuredClone(commonSchema);
    bad.sections[1].fields.push(bad.sections[0].fields[0]);
    expect(() => assertSchema(bad)).toThrow(/Duplicate/);
    expect(() =>
      compose(commonSchema, {
        schema_id: "bad",
        schema_version: "0.2.0",
        extends: { schema_id: "other", schema_version: "0.2.0" },
        municipality: "Zaragoza",
        overrides: {},
        addFields: [],
      }),
    ).toThrow();
  });
});
describe("completion is descriptive, conditional and weighted", () => {
  const field = (id: string) =>
    commonSchema.sections.flatMap((s) => s.fields).find((f) => f.id === id)!;
  const answer = (id: string, value: Answers[string]["value_json"]) => ({
    ...emptyAnswer(field(id)),
    value_json: value,
  });
  it("keeps untouched boolean pending but accepts false, number zero and explicit empty checklist", () => {
    expect(answered(field("patio_exists"))).toBe(false);
    expect(answered(field("patio_exists"), answer("patio_exists", false))).toBe(
      true,
    );
    expect(answered(field("pavement_level"), answer("pavement_level", 0))).toBe(
      true,
    );
    expect(
      answered(field("observed_flags"), answer("observed_flags", [])),
    ).toBe(true);
  });
  it("excludes hidden patio details from required/critical totals, preserves underlying answers", () => {
    const a = {
      patio_exists: answer("patio_exists", false),
      patio_width: answer("patio_width", 3),
    };
    expect(visible(field("patio_width"), a)).toBe(false);
    const before = progress(commonSchema, a);
    const after = progress(commonSchema, {
      ...a,
      patio_exists: answer("patio_exists", true),
    });
    expect(after.criticalTotal - before.criticalTotal).toBe(7);
    expect(a.patio_width.value_json).toBe(3);
  });
  it("critical data changes weighted progress more than optional data; verified is independent", () => {
    const required = progress(commonSchema, {
      floor_type: answer("floor_type", "Planta baja"),
    });
    const optional = progress(commonSchema, { door: answer("door", "A") });
    expect(required.percent).toBeGreaterThan(optional.percent);
    expect(required.criticalUnverified.map((f) => f.id)).toContain(
      "floor_type",
    );
    expect(required.criticalDone).toBe(1);
  });
  it("validates numeric bounds and incomplete repeatable rows", () => {
    expect(answered(field("facade_width"), answer("facade_width", -1))).toBe(
      false,
    );
    expect(
      answered(
        field("facade_openings"),
        answer("facade_openings", [{ opening_name: "H1" }]),
      ),
    ).toBe(false);
    expect(
      answered(
        field("facade_openings"),
        answer("facade_openings", [
          {
            opening_name: "H1",
            opening_type: "Ventana",
            opening_width: 1,
            opening_height: 2,
            opening_to: "calle",
          },
        ]),
      ),
    ).toBe(true);
    expect(
      answered(
        field("observed_flags"),
        answer("observed_flags", [{ code: "flag_1", severity: "invalid" }]),
      ),
    ).toBe(false);
  });
  it("supports equals, notEquals and includes visibility", () => {
    const f = field("patio_width");
    expect(
      visible(
        {
          ...f,
          visibleWhen: { field: "x", operator: "notEquals", value: false },
        },
        { x: { ...emptyAnswer(f), value_json: true } },
      ),
    ).toBe(true);
    expect(
      visible(
        {
          ...f,
          visibleWhen: { field: "x", operator: "includes", value: "yes" },
        },
        { x: { ...emptyAnswer(f), value_json: ["yes"] } },
      ),
    ).toBe(true);
  });
  it("all nine requested input types occur in the common schema", () => {
    const types = new Set(
      commonSchema.sections.flatMap((s) => s.fields).map((f) => f.type),
    );
    for (const type of [
      "text",
      "textarea",
      "number",
      "boolean",
      "select",
      "multiselect",
      "measurement",
      "checklist",
      "repeatable",
    ] as Field["type"][])
      expect(types.has(type)).toBe(true);
  });
});
