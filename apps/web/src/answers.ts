import { db, type LocalDatabase } from "./db";
import type {
  AnswerContent,
  LocalVisitAnswer,
  SourceType,
} from "../../../packages/domain";

export async function saveAnswer(
  input: {
    userId: string;
    visitId: string;
    questionId: string;
    sectionId: string;
    defaultSource: SourceType;
    patch: Partial<AnswerContent>;
  },
  database: LocalDatabase = db,
): Promise<LocalVisitAnswer> {
  return database.transaction(
    "rw",
    database.localVisits,
    database.localVisitAnswers,
    async () => {
      const visit = await database.localVisits.get(input.visitId);
      if (!visit || visit.user_id !== input.userId)
        throw new Error("Esta visita no pertenece a la cuenta activa.");
      const previous = await database.localVisitAnswers
        .where("[visit_id+question_id]")
        .equals([input.visitId, input.questionId])
        .first();
      const now = new Date(
        Math.max(
          Date.now(),
          Date.parse(previous?.local_updated_at ?? "") + 1 || 0,
        ),
      ).toISOString();
      const row: LocalVisitAnswer = {
        id: previous?.id ?? crypto.randomUUID(),
        visit_id: input.visitId,
        user_id: input.userId,
        question_id: input.questionId,
        section_id: input.sectionId,
        value_json: previous?.value_json ?? null,
        source_type: previous?.source_type ?? input.defaultSource,
        verified: previous?.verified ?? false,
        notes: previous?.notes ?? "",
        ...input.patch,
        created_at: previous?.created_at ?? now,
        updated_at: now,
        local_updated_at: now,
        local_revision: (previous?.local_revision ?? 0) + 1,
        pending_operation: "upsert",
        sync_status:
          previous && previous.sync_status !== "pending_create"
            ? "pending_update"
            : "pending_create",
      };
      await database.localVisitAnswers.put(row);
      return row;
    },
  );
}
export async function deleteAnswer(
  userId: string,
  id: string,
  database: LocalDatabase = db,
) {
  await database.transaction("rw", database.localVisitAnswers, async () => {
    const row = await database.localVisitAnswers.get(id);
    if (!row || row.user_id !== userId)
      throw new Error("Respuesta no disponible en esta cuenta.");
    await database.localVisitAnswers.update(id, {
      sync_status: "pending_delete",
      pending_operation: "delete",
      local_revision: (row.local_revision ?? 0) + 1,
      local_updated_at: new Date().toISOString(),
    });
  });
}
