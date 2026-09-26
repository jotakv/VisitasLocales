// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  FieldControl,
  FormEngine,
  emptyAnswer,
  type Field,
} from "../packages/form-engine";
import { commonSchema } from "../packages/form-engine/registry";
afterEach(cleanup);
const field = (id: string) =>
  commonSchema.sections.flatMap((s) => s.fields).find((f) => f.id === id)!;
function Controlled({ f }: { f: Field }) {
  const [value, setValue] = useState(emptyAnswer(f).value_json);
  return (
    <>
      <FieldControl field={f} value={value} onValue={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}
const val = () => JSON.parse(screen.getByTestId("value").textContent!);
describe("schema-generated controls", () => {
  it.each([
    ["address", "text", "Calle QA"],
    ["main_risk", "textarea", "Pendiente de comprobar"],
    ["asking_price", "number", 42000],
    ["central_height", "measurement", 2.8],
  ] as const)("%s persists %s input", (id, _type, value) => {
    render(<Controlled f={field(id)} />);
    fireEvent.change(screen.getByLabelText(field(id).label), {
      target: { value: String(value) },
    });
    expect(val()).toBe(value);
  });
  it("boolean distinguishes untouched, false and true", () => {
    render(<Controlled f={field("patio_exists")} />);
    expect(val()).toBeNull();
    fireEvent.change(screen.getByLabelText("¿Existen patios?"), {
      target: { value: "false" },
    });
    expect(val()).toBe(false);
    fireEvent.change(screen.getByLabelText("¿Existen patios?"), {
      target: { value: "true" },
    });
    expect(val()).toBe(true);
  });
  it("select retains its selected option", () => {
    render(<Controlled f={field("floor_type")} />);
    fireEvent.change(screen.getByLabelText("Planta / tipología"), {
      target: { value: "Planta baja" },
    });
    expect(val()).toBe("Planta baja");
  });
  it.each(["facade_sides", "structure_signs"])(
    "%s supports multiple selections and explicit none",
    (id) => {
      const f = field(id);
      render(<Controlled f={f} />);
      fireEvent.click(screen.getAllByRole("checkbox")[0]);
      fireEvent.click(screen.getAllByRole("checkbox")[1]);
      expect(val()).toHaveLength(2);
      fireEvent.click(screen.getByText("Ninguna / no aplica"));
      expect(val()).toEqual([]);
    },
  );
  it("repeatable supports adding, editing and removing rows", () => {
    render(<Controlled f={field("facade_openings")} />);
    fireEvent.click(screen.getByText("Añadir elemento · Huecos de fachada"));
    fireEvent.change(screen.getByLabelText("Identificador del hueco"), {
      target: { value: "H1" },
    });
    fireEvent.change(screen.getByLabelText("Anchura"), {
      target: { value: "1.5" },
    });
    expect(val()[0]).toMatchObject({ opening_name: "H1", opening_width: 1.5 });
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar Huecos de fachada 1" }),
    );
    expect(val()).toEqual([]);
  });
  it("selected flags support severity and notes", () => {
    render(<Controlled f={field("observed_flags")} />);
    fireEvent.click(
      screen.getByLabelText("Altura potencialmente insuficiente"),
    );
    fireEvent.change(
      screen.getByLabelText("Gravedad: Altura potencialmente insuficiente"),
      { target: { value: "potential_blocker" } },
    );
    fireEvent.change(
      screen.getByLabelText("Notas: Altura potencialmente insuficiente"),
      { target: { value: "Medir bajo viga" } },
    );
    expect(val()).toEqual([
      {
        code: "flag_2",
        severity: "potential_blocker",
        notes: "Medir bajo viga",
      },
    ]);
  });
  it("visibility changes from answers and provenance/verified/notes are independent patches", () => {
    const change = vi.fn();
    const answer = { ...emptyAnswer(field("patio_exists")), value_json: false };
    const { rerender } = render(
      <FormEngine
        schema={commonSchema}
        sectionId="patios"
        answers={{ patio_exists: answer }}
        onChange={change}
      />,
    );
    expect(screen.queryByLabelText("Ancho del patio")).toBeNull();
    rerender(
      <FormEngine
        schema={commonSchema}
        sectionId="patios"
        answers={{ patio_exists: { ...answer, value_json: true } }}
        onChange={change}
      />,
    );
    expect(screen.getByLabelText("Ancho del patio")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Fuente: Ancho del patio"), {
      target: { value: "seller_claim" },
    });
    expect(change.mock.calls.at(-1)?.[2]).toEqual({
      source_type: "seller_claim",
    });
    fireEvent.click(screen.getByLabelText("Verificado: Ancho del patio"));
    expect(change.mock.calls.at(-1)?.[2]).toEqual({ verified: true });
    fireEvent.change(screen.getByLabelText("Notas: Ancho del patio"), {
      target: { value: "Medición" },
    });
    expect(change.mock.calls.at(-1)?.[2]).toEqual({ notes: "Medición" });
  });
});
