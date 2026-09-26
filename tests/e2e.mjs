import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import assert from "node:assert/strict";
const password = fs.readFileSync(".env.qa.local", "utf8").trim().split("=")[1];
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split("=")),
);
const base = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const a = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY),
  b = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const authA = await a.auth.signInWithPassword({
  email: "qa-a@localvivienda.example",
  password,
});
assert.ifError(authA.error);
const authB = await b.auth.signInWithPassword({
  email: "qa-b@localvivienda.example",
  password,
});
assert.ifError(authB.error);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  }),
  page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base + "/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("qa-a@localvivienda.example");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/app");
  await page
    .getByRole("link", { name: "+ Nueva propiedad", exact: true })
    .click();
  await page
    .getByLabel("Dirección", { exact: true })
    .fill("QA Local " + Date.now());
  await page.getByLabel("Municipio", { exact: true }).fill("Zaragoza");
  await page.getByLabel("Provincia", { exact: true }).fill("Zaragoza");
  await page.getByLabel("Superficie construida (m²)").fill("85");
  await page.getByRole("button", { name: "Guardar inmueble" }).click();
  await page.waitForURL(/\/app\/properties\/[a-f0-9-]+$/);
  const propertyId = page.url().split("/").pop();
  await page
    .getByText("Sincronizado con Supabase", { exact: true })
    .waitFor({ timeout: 45000 });
  await page.reload();
  await page.getByText("Sincronizado con Supabase", { exact: true }).waitFor();
  await page.getByRole("button", { name: "+ Nueva visita" }).click();
  await page.waitForURL("**/app/visits/*");
  const visitId = page.url().split("/").pop();
  await page
    .getByText("Guardada en este dispositivo y sincronizada con Supabase", {
      exact: true,
    })
    .waitFor({ timeout: 45000 });
  await page.getByLabel("Altura central", { exact: true }).fill("2.8");
  await page.getByLabel("Acceso desde la calle", { exact: true }).check();
  await page.reload();
  await page
    .getByText("Guardada en este dispositivo y sincronizada con Supabase", {
      exact: true,
    })
    .waitFor();
  const remote = await a.from("visits").select().eq("id", visitId).single();
  assert.ifError(remote.error);
  assert.equal(remote.data.property_id, propertyId);
  const local = await page.evaluate(async (id) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("localvivienda");
      req.onsuccess = () => {
        const database = req.result;
        const get = database
          .transaction("localVisits")
          .objectStore("localVisits")
          .get(id);
        get.onsuccess = () => {
          resolve(get.result);
          database.close();
        };
        get.onerror = () => reject(get.error);
      };
    });
  }, visitId);
  assert.equal(local.sync_status, "synced");
  const hidden = await b.from("properties").select().eq("id", propertyId);
  assert.ifError(hidden.error);
  assert.equal(hidden.data.length, 0);
  const hiddenVisits = await b.from("visits").select().eq("id", visitId);
  assert.ifError(hiddenVisits.error);
  assert.equal(hiddenVisits.data.length, 0);
  const forbiddenInsert = await b
    .from("properties")
    .insert({
      address: "Forbidden",
      municipality: "Zaragoza",
      province: "Zaragoza",
      user_id: authA.data.user.id,
    });
  assert.ok(forbiddenInsert.error);
  const crossVisit = await b
    .from("visits")
    .insert({
      property_id: propertyId,
      user_id: authB.data.user.id,
      device_id: "qa",
    });
  assert.ok(crossVisit.error);
  const forbiddenUpdate = await b
    .from("properties")
    .update({ address: "Forbidden" })
    .eq("id", propertyId)
    .select();
  assert.ifError(forbiddenUpdate.error);
  assert.equal(forbiddenUpdate.data.length, 0);
  const forbiddenDelete = await b
    .from("visits")
    .delete()
    .eq("id", visitId)
    .select();
  assert.ifError(forbiddenDelete.error);
  assert.equal(forbiddenDelete.data.length, 0);
  const profiles = await b
    .from("profiles")
    .select()
    .eq("id", authA.data.user.id);
  assert.equal(profiles.data.length, 0);
  const ownerChange = await a
    .from("properties")
    .update({ user_id: authB.data.user.id })
    .eq("id", propertyId);
  assert.ok(ownerChange.error);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.goto(base + "/app/properties/" + propertyId);
  await page.getByRole("button", { name: "+ Nueva visita" }).click();
  await page.waitForURL("**/app/visits/*");
  const offlineId = page.url().split("/").pop();
  await page
    .getByText("Guardada en este dispositivo · pendiente de sincronizar", {
      exact: true,
    })
    .waitFor();
  await page.reload();
  await page.getByLabel("Altura central", { exact: true }).waitFor();
  await context.setOffline(false);
  await page
    .getByText("Guardada en este dispositivo y sincronizada con Supabase", {
      exact: true,
    })
    .waitFor({ timeout: 45000 });
  const syncedOffline = await a
    .from("visits")
    .select()
    .eq("id", offlineId)
    .single();
  assert.ifError(syncedOffline.error);
  await page.screenshot({ path: "../qa-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      base,
      login: true,
      propertyId,
      visitId,
      offlineId,
      reload: true,
      indexedDB: true,
      schemaFields: true,
      rlsIsolation: true,
      ownerChangeBlocked: true,
      crossOwnerVisitBlocked: true,
      pwaOffline: true,
      offlineRetry: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
  await a.auth.signOut();
  await b.auth.signOut();
}
