// End-to-end runner for an explicitly configured QA environment.
// Credentials are environment variables; do not commit .env.qa.local.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "QA_EMAIL_A",
  "QA_PASSWORD_A",
  "QA_EMAIL_B",
  "QA_PASSWORD_B",
];
for (const key of required)
  assert.ok(process.env[key], `Missing environment variable: ${key}`);
const client = () =>
  createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const a = client(),
  b = client();
const authA = await a.auth.signInWithPassword({
  email: process.env.QA_EMAIL_A,
  password: process.env.QA_PASSWORD_A,
});
const authB = await b.auth.signInWithPassword({
  email: process.env.QA_EMAIL_B,
  password: process.env.QA_PASSWORD_B,
});
assert.ifError(authA.error);
assert.ifError(authB.error);
const profile = await mkdtemp(join(tmpdir(), "localvivienda-e2e-"));
await mkdir("test-results", { recursive: true });
const launch = () =>
  chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 390, height: 844 },
  });
let context = await launch(),
  page = await context.newPage(),
  propertyId;
const errors = [];
const listen = () => page.on("pageerror", (e) => errors.push(e.message));
listen();
const remoteAnswers = async (visitId) => {
  const result = await a.from("visit_answers").select().eq("visit_id", visitId);
  assert.ifError(result.error);
  return result.data;
};
async function poll(assertion) {
  const deadline = Date.now() + 45000;
  for (;;) {
    try {
      return await assertion();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email", { exact: true }).fill(process.env.QA_EMAIL_A);
  await page.getByLabel("Contraseña").fill(process.env.QA_PASSWORD_A);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/app");
  await page
    .getByRole("link", { name: "+ Nueva propiedad", exact: true })
    .click();
  await page
    .getByLabel("Dirección", { exact: true })
    .fill(`QA Incremento 2 ${Date.now()}`);
  await page.getByLabel("Municipio", { exact: true }).fill("Zaragoza");
  await page.getByLabel("Provincia", { exact: true }).fill("Zaragoza");
  await page.getByRole("button", { name: "Guardar inmueble" }).click();
  await page.waitForURL(/\/app\/properties\/[a-f0-9-]+$/);
  propertyId = page.url().split("/").pop();
  await page.getByRole("button", { name: "+ Nueva visita" }).click();
  await page.waitForURL("**/app/visits/*");
  const visitUrl = page.url(),
    visitId = visitUrl.split("/").pop();
  await page.getByText("Sección 1 de 28", { exact: true }).waitFor();
  await page.getByLabel("Dirección", { exact: true }).fill("QA fachada 5");
  const question = page.locator('[data-question-id="address"]');
  await question.locator("summary").click();
  await page
    .getByLabel("Fuente: Dirección", { exact: true })
    .selectOption("documentary");
  await page.getByLabel("Verificado: Dirección", { exact: true }).check();
  await page
    .getByLabel("Notas: Dirección", { exact: true })
    .fill("Documento revisado en prueba");
  await page
    .getByText("Guardado en dispositivo · puedes cerrar", { exact: true })
    .waitFor();
  await poll(async () => {
    const row = (await remoteAnswers(visitId)).find(
      (r) => r.question_id === "address",
    );
    assert.ok(row);
    assert.equal(row.value_json, "QA fachada 5");
    assert.equal(row.source_type, "documentary");
    assert.equal(row.verified, true);
    assert.equal(row.notes, "Documento revisado en prueba");
  });
  for (let n = 2; n <= 28; n++) {
    await page
      .getByRole("button", { name: "Siguiente →", exact: true })
      .click();
    await page.getByText(`Sección ${n} de 28`, { exact: true }).waitFor();
  }
  await page.getByRole("button", { name: "Secciones", exact: true }).click();
  await page.getByRole("button", { name: /05 · ALTURA LIBRE/ }).click();
  await page.getByLabel("Altura en zona central", { exact: true }).fill("2.85");
  await page
    .getByText("Guardado en dispositivo · puedes cerrar", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByText("Sección 5 de 28", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByLabel("Altura en zona central", { exact: true })
      .inputValue(),
    "2.85",
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.close();
  context = await launch();
  page = await context.newPage();
  listen();
  await page.goto(visitUrl);
  await page.getByText("Sección 5 de 28", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByLabel("Altura en zona central", { exact: true })
      .inputValue(),
    "2.85",
  );
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.getByLabel("Altura bajo vigas", { exact: true }).fill("2.55");
  await page
    .getByText("Guardado en dispositivo · puedes cerrar", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByText("Sección 5 de 28", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Altura bajo vigas", { exact: true }).inputValue(),
    "2.55",
  );
  await context.setOffline(false);
  await poll(async () =>
    assert.equal(
      (await remoteAnswers(visitId)).find(
        (r) => r.question_id === "height_beam",
      )?.value_json,
      2.55,
    ),
  );
  await page.getByLabel("Altura bajo vigas", { exact: true }).fill("2.6");
  await poll(async () => {
    const rows = (await remoteAnswers(visitId)).filter(
      (r) => r.question_id === "height_beam",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value_json, 2.6);
  });
  await page.reload();
  assert.equal(
    await page.getByLabel("Altura bajo vigas", { exact: true }).inputValue(),
    "2.6",
  );
  const answer = (await remoteAnswers(visitId))[0];
  const hidden = await b.from("visit_answers").select().eq("visit_id", visitId);
  assert.ifError(hidden.error);
  assert.equal(hidden.data.length, 0);
  const illegal = await b
    .from("visit_answers")
    .insert({
      visit_id: visitId,
      user_id: authB.data.user.id,
      question_id: "cross-owner",
    });
  assert.ok(illegal.error);
  const update = await b
    .from("visit_answers")
    .update({ notes: "Forbidden", updated_at: new Date().toISOString() })
    .eq("id", answer.id)
    .select();
  assert.ifError(update.error);
  assert.equal(update.data.length, 0);
  const deletion = await b
    .from("visit_answers")
    .delete()
    .eq("id", answer.id)
    .select();
  assert.ifError(deletion.error);
  assert.equal(deletion.data.length, 0);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/inspection-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      base,
      schema: "0.2.0",
      sections: 28,
      login: true,
      reload: true,
      browserRestart: true,
      offlineEdit: true,
      offlineReload: true,
      reconnect: true,
      evidence: true,
      uniqueAnswers: true,
      rlsCrud: true,
      pwa: true,
      horizontalOverflow: false,
    }),
  );
} finally {
  await context.close();
  if (propertyId) {
    const { error } = await a
      .from("properties")
      .delete()
      .eq("id", propertyId)
      .eq("user_id", authA.data.user.id);
    if (error) console.error("QA fixture cleanup failed", error.message);
  }
  await a.auth.signOut();
  await b.auth.signOut();
  await rm(profile, { recursive: true, force: true });
}
