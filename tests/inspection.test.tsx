// @vitest-environment jsdom
import "fake-indexeddb/auto";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { db } from "../apps/web/src/db";
import { App } from "../apps/web/src/App";
const { synchronize, scheduleSync } = vi.hoisted(() => ({
  synchronize: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));
vi.mock("../apps/web/src/auth", () => ({
  useAuth: () => ({
    session: { user: { id: "inspection-a" } },
    loading: false,
  }),
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../apps/web/src/sync", () => ({
  synchronize,
  scheduleSync,
  useSyncState: () => ({ syncing: false, error: "", lastSync: null }),
}));
vi.mock("../apps/web/src/supabase", () => ({
  configured: true,
  supabase: { auth: { signOut: vi.fn(async () => ({ error: null })) } },
}));
function open(path: string) {
  return render(
    <RouterProvider
      router={createMemoryRouter([{ path: "*", element: <App /> }], {
        initialEntries: [path],
      })}
    />,
  );
}
beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 0));
  await db.localVisitAnswers.clear();
  await db.localVisits.clear();
  await db.localProperties.clear();
  await db.visitCursors.clear();
  synchronize.mockClear();
  scheduleSync.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function createVisit() {
  open("/app/properties/new");
  fireEvent.change(screen.getByLabelText("Dirección"), {
    target: { value: "QA inspección" },
  });
  fireEvent.change(screen.getByLabelText("Municipio"), {
    target: { value: "Zaragoza" },
  });
  fireEvent.change(screen.getByLabelText("Provincia"), {
    target: { value: "Zaragoza" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar inmueble" }));
  await screen.findByRole("button", { name: "+ Nueva visita" });
  fireEvent.click(screen.getByRole("button", { name: "+ Nueva visita" }));
  await screen.findByText("Sección 1 de 28");
  return (await db.localVisits.toArray())[0];
}
it("creates a property and 0.2.0 draft, saves evidence, reopens at the same section and offers a non-blocking exit", async () => {
  const visit = await createVisit();
  expect(visit.schema_id).toBe("commercial-to-residential-zaragoza");
  expect(visit.schema_version).toBe("0.2.0");
  fireEvent.change(screen.getByLabelText("Dirección", { exact: true }), {
    target: { value: "Calle de prueba 5" },
  });
  fireEvent.change(screen.getByLabelText("Fuente: Dirección"), {
    target: { value: "documentary" },
  });
  fireEvent.click(screen.getByLabelText("Verificado: Dirección"));
  fireEvent.change(screen.getByLabelText("Notas: Dirección"), {
    target: { value: "Contrastada" },
  });
  await waitFor(async () =>
    expect((await db.localVisitAnswers.toArray())[0]).toMatchObject({
      value_json: "Calle de prueba 5",
      source_type: "documentary",
      verified: true,
      notes: "Contrastada",
    }),
  );
  expect(scheduleSync).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
  await screen.findByText("Sección 2 de 28");
  await waitFor(async () =>
    expect((await db.visitCursors.get(visit.id))?.section_id).toBe(
      "building_position",
    ),
  );
  cleanup();
  open(`/app/visits/${visit.id}`);
  await screen.findByText("Sección 2 de 28");
  fireEvent.click(screen.getByRole("button", { name: "← Anterior" }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Dirección", { exact: true }) as HTMLInputElement)
        .value,
    ).toBe("Calle de prueba 5"),
  );
  expect(
    (screen.getByLabelText("Verificado: Dirección") as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Críticos pendientes/ }));
  expect(
    screen.getByRole("dialog", { name: "Comprobaciones críticas pendientes" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Altura bajo vigas" }));
  await screen.findByText("Sección 5 de 28");
  fireEvent.change(
    screen.getByLabelText("Altura bajo vigas", { exact: true }),
    { target: { value: "2.6" } },
  );
  await waitFor(async () => expect(await db.localVisitAnswers.count()).toBe(2));
  fireEvent.click(
    screen.getByRole("link", { name: "Propiedades", exact: true }),
  );
  await screen.findByRole("dialog", { name: "Salir de la visita" });
  fireEvent.click(screen.getByRole("button", { name: "Seguir revisando" }));
  expect(
    screen.queryByRole("dialog", { name: "Salir de la visita" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "← Inmueble" }));
  fireEvent.click(screen.getByRole("button", { name: "Salir igualmente" }));
  await screen.findByRole("button", { name: "+ Nueva visita" });
});
it("navigates all 28 sections, renders index and descriptive status without finalization", async () => {
  await createVisit();
  for (let n = 2; n <= 28; n++) {
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    await screen.findByText(`Sección ${n} de 28`);
  }
  expect(
    screen.getByText(
      /La viabilidad urbanística y técnica se analizará en una fase posterior/,
    ),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Finalizar|Analizar|Exportar/ }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Secciones", exact: true }),
  );
  const dialog = screen.getByRole("dialog", { name: "Índice de secciones" });
  expect(dialog.querySelectorAll(".section-link")).toHaveLength(28);
});
it("opens the old 0.1.0 schema without silently changing version", async () => {
  const visit = await createVisit();
  cleanup();
  await db.localVisits.update(visit.id, {
    schema_id: "commercial-to-residential",
    schema_version: "0.1.0",
  });
  open(`/app/visits/${visit.id}`);
  await screen.findByText("Sección 1 de 2");
  expect((await db.localVisits.get(visit.id))?.schema_version).toBe("0.1.0");
});
