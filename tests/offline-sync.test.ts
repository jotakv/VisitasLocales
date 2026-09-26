import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type LocalDatabase } from "../apps/web/src/db";
import { saveAnswer, deleteAnswer } from "../apps/web/src/answers";
import { syncOnce, type RemoteStore } from "../apps/web/src/sync-core";
import type { Property, Visit, VisitAnswer } from "../packages/domain";
const now = new Date().toISOString();
const p: Property = {
  id: "p",
  user_id: "a",
  address: "Test",
  municipality: "Zaragoza",
  province: "Zaragoza",
  postal_code: "",
  cadastral_reference: "",
  asking_price: null,
  built_area: null,
  usable_area: null,
  created_at: now,
  updated_at: now,
};
const v: Visit = {
  id: "v",
  user_id: "a",
  property_id: "p",
  schema_id: "commercial-to-residential",
  schema_version: "0.2.0",
  status: "draft",
  started_at: now,
  completed_at: null,
  device_id: "test",
  created_at: now,
  updated_at: now,
};
const databases: LocalDatabase[] = [];
async function fixture() {
  const database = createDatabase(`qa-${crypto.randomUUID()}`);
  databases.push(database);
  await database.localProperties.add({
    ...p,
    sync_status: "pending_create",
    local_updated_at: now,
  });
  await database.localVisits.add({
    ...v,
    sync_status: "pending_create",
    local_updated_at: now,
  });
  return database;
}
const save = (
  database: LocalDatabase,
  patch: Parameters<typeof saveAnswer>[0]["patch"] = { value_json: 2.8 },
) =>
  saveAnswer(
    {
      userId: "a",
      visitId: "v",
      questionId: "central_height",
      sectionId: "height",
      defaultSource: "observed",
      patch,
    },
    database,
  );
class Remote implements RemoteStore {
  ps: Property[] = [];
  vs: Visit[] = [];
  as: VisitAnswer[] = [];
  calls: string[] = [];
  fail = false;
  async userId() {
    return "a";
  }
  async properties() {
    return structuredClone(this.ps);
  }
  async visits() {
    return structuredClone(this.vs);
  }
  async answers() {
    return structuredClone(this.as);
  }
  async putProperty(row: Property) {
    this.calls.push("property");
    this.ps = [row];
    return row;
  }
  async putVisit(row: Visit) {
    expect(this.ps.some((p) => p.id === row.property_id)).toBe(true);
    this.calls.push("visit");
    this.vs = [row];
    return row;
  }
  async putAnswer(row: VisitAnswer) {
    if (this.fail) throw new Error("Network failed");
    expect(this.vs.some((v) => v.id === row.visit_id)).toBe(true);
    this.calls.push("answer");
    const previous = this.as.find(
      (a) => a.visit_id === row.visit_id && a.question_id === row.question_id,
    );
    const saved =
      previous && Date.parse(previous.updated_at) >= Date.parse(row.updated_at)
        ? previous
        : { ...row, id: previous?.id ?? row.id };
    this.as = [
      ...this.as.filter((a) => a.question_id !== row.question_id),
      saved,
    ];
    return structuredClone(saved);
  }
  async deleteAnswer(id: string) {
    if (this.fail) throw new Error("Network failed");
    this.as = this.as.filter((a) => a.id !== id);
  }
}
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});
describe("local answers and additive Dexie upgrade", () => {
  it("upgrades v1 without deleting historical visits or properties", async () => {
    const name = `v1-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old
      .version(1)
      .stores({
        localProperties: "id,user_id,sync_status",
        localVisits: "id,user_id,property_id,sync_status",
      });
    await old.table("localProperties").put(p);
    await old.table("localVisits").put({ ...v, schema_version: "0.1.0" });
    old.close();
    const database = createDatabase(name);
    databases.push(database);
    expect((await database.localVisits.get("v"))?.schema_version).toBe("0.1.0");
    expect(await database.localProperties.count()).toBe(1);
    expect(await database.localVisitAnswers.count()).toBe(0);
  });
  it("persists value/provenance/verified/notes through close and reopen", async () => {
    let database = await fixture();
    await save(database, {
      value_json: 2.8,
      source_type: "seller_claim",
      verified: false,
      notes: "Ask architect",
    });
    await database.visitCursors.put({
      visit_id: "v",
      user_id: "a",
      section_id: "height",
    });
    const name = database.name;
    database.close();
    database = createDatabase(name);
    databases.push(database);
    const a = await database.localVisitAnswers.toArray();
    expect(a[0]).toMatchObject({
      value_json: 2.8,
      source_type: "seller_claim",
      verified: false,
      notes: "Ask architect",
      sync_status: "pending_create",
    });
    expect((await database.visitCursors.get("v"))?.section_id).toBe("height");
  });
  it("merges rapid partial updates transactionally with one natural-key answer", async () => {
    const database = await fixture();
    await Promise.all([
      save(database, { value_json: 2.9 }),
      save(database, { verified: true }),
      save(database, { notes: "Tape" }),
    ]);
    expect(await database.localVisitAnswers.count()).toBe(1);
    expect((await database.localVisitAnswers.toArray())[0]).toMatchObject({
      value_json: 2.9,
      verified: true,
      notes: "Tape",
      local_revision: 3,
    });
  });
  it("rejects writing another user's visit locally", async () => {
    const database = await fixture();
    await expect(
      saveAnswer(
        {
          userId: "b",
          visitId: "v",
          questionId: "x",
          sectionId: "height",
          defaultSource: "unknown",
          patch: { value_json: 1 },
        },
        database,
      ),
    ).rejects.toThrow(/cuenta/);
  });
});
describe("ordered offline synchronization", () => {
  it("offline stays pending, reconnect sends parents before answers, updates without duplicates", async () => {
    const database = await fixture(),
      remote = new Remote();
    await save(database);
    await syncOnce(database, remote, "a", () => false);
    expect(remote.calls).toEqual([]);
    expect((await database.localVisitAnswers.toArray())[0].sync_status).toBe(
      "pending_create",
    );
    await syncOnce(database, remote, "a", () => true);
    expect(remote.calls).toEqual(["property", "visit", "answer"]);
    expect((await database.localVisitAnswers.toArray())[0].sync_status).toBe(
      "synced",
    );
    await save(database, {
      value_json: 3,
      source_type: "documentary",
      verified: true,
      notes: "Proof",
    });
    await syncOnce(database, remote, "a", () => true);
    await syncOnce(database, remote, "a", () => true);
    expect(remote.as).toHaveLength(1);
    expect(remote.as[0]).toMatchObject({
      value_json: 3,
      verified: true,
      source_type: "documentary",
      notes: "Proof",
    });
  });
  it("does not acknowledge or overwrite a newer edit made during an in-flight request", async () => {
    const database = await fixture(),
      remote = new Remote();
    await save(database);
    const put = remote.putAnswer.bind(remote);
    let edit = true;
    remote.putAnswer = async (row) => {
      if (edit) {
        edit = false;
        await save(database, { value_json: 3.1 });
      }
      return put(row);
    };
    await syncOnce(database, remote, "a", () => true);
    expect((await database.localVisitAnswers.toArray())[0]).toMatchObject({
      value_json: 3.1,
      sync_status: "pending_create",
    });
    await syncOnce(database, remote, "a", () => true);
    expect(remote.as[0].value_json).toBe(3.1);
  });
  it("recovers from a network error and preserves the last local edit", async () => {
    const database = await fixture(),
      remote = new Remote();
    await save(database);
    remote.fail = true;
    await expect(syncOnce(database, remote, "a", () => true)).rejects.toThrow(
      "Network failed",
    );
    expect((await database.localVisitAnswers.toArray())[0]).toMatchObject({
      value_json: 2.8,
      sync_status: "error",
    });
    remote.fail = false;
    await syncOnce(database, remote, "a", () => true);
    expect((await database.localVisitAnswers.toArray())[0].sync_status).toBe(
      "synced",
    );
  });
  it("retains deletion intent across errors and never resurrects a tombstone during pull", async () => {
    const database = await fixture(),
      remote = new Remote();
    const answer = await save(database);
    await syncOnce(database, remote, "a", () => true);
    await deleteAnswer("a", answer.id, database);
    remote.fail = true;
    await expect(syncOnce(database, remote, "a", () => true)).rejects.toThrow();
    expect(
      (await database.localVisitAnswers.get(answer.id))?.pending_operation,
    ).toBe("delete");
    remote.fail = false;
    await syncOnce(database, remote, "a", () => true);
    expect(await database.localVisitAnswers.count()).toBe(0);
    expect(remote.as).toHaveLength(0);
  });
  it("remote LWW accepts the newest timestamp and canonical ID", async () => {
    const database = await fixture(),
      remote = new Remote();
    const answer = await save(database);
    remote.as = [
      {
        ...answer,
        id: "remote-id",
        value_json: 9,
        updated_at: new Date(Date.now() + 100000).toISOString(),
      },
    ];
    await syncOnce(database, remote, "a", () => true);
    expect(await database.localVisitAnswers.count()).toBe(1);
    expect((await database.localVisitAnswers.toArray())[0]).toMatchObject({
      id: "remote-id",
      value_json: 9,
      sync_status: "synced",
    });
  });
  it("does not sync while a different account is authenticated", async () => {
    const database = await fixture(),
      remote = new Remote();
    remote.userId = async () => "b";
    await save(database);
    await syncOnce(database, remote, "a", () => true);
    expect(remote.calls).toEqual([]);
  });
  it("retains pending local answers if a remote parent has disappeared", async () => {
    const database = await fixture(),
      remote = new Remote();
    await save(database);
    await syncOnce(database, remote, "a", () => true);
    await save(database, { notes: "Unsent" });
    remote.vs = [];
    remote.fail = true;
    await expect(syncOnce(database, remote, "a", () => true)).rejects.toThrow();
    expect(await database.localVisitAnswers.count()).toBe(1);
    expect(await database.localVisits.get("v")).toBeTruthy();
  });
});
