import { createHash } from "node:crypto";
import type { EvidenceCheck, EvidenceItem } from "@workspace/db";
import { db, evidenceAuditEventsTable, evidenceItemsTable } from "@workspace/db";
import { asc, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const serializeEvidence = (evidence: EvidenceItem, auditEvents: typeof evidenceAuditEventsTable.$inferSelect[] = []) => ({
  ...evidence,
  verifiedAt: evidence.verifiedAt?.toISOString() ?? null,
  candidateQuantity: evidence.candidateQuantity ?? null,
  confidence: evidence.confidence ?? null,
  identityConfidence: evidence.identityConfidence ?? null,
  retentionUntil: evidence.retentionUntil ?? null,
  originalName: evidence.originalName ?? null,
  latitude: evidence.latitude ?? null,
  longitude: evidence.longitude ?? null,
  candidateWorkTypeId: evidence.candidateWorkTypeId ?? null,
  candidateUnit: evidence.candidateUnit ?? null,
  explanation: evidence.explanation ?? null,
  transcript: evidence.transcript ?? null,
  errorMessage: evidence.errorMessage ?? null,
  createdAt: evidence.createdAt.toISOString(),
  updatedAt: evidence.updatedAt.toISOString(),
  auditEvents: auditEvents.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  })),
});

export async function loadEvidence(executor: typeof db | Transaction, ids: number[]) {
  if (ids.length === 0) return [];
  const rows = await executor.select().from(evidenceItemsTable).where(inArray(evidenceItemsTable.id, ids)).orderBy(asc(evidenceItemsTable.id));
  const audits = await executor
    .select()
    .from(evidenceAuditEventsTable)
    .where(inArray(evidenceAuditEventsTable.evidenceId, ids))
    .orderBy(asc(evidenceAuditEventsTable.createdAt), asc(evidenceAuditEventsTable.id));
  return rows.map((row) => serializeEvidence(row, audits.filter((audit) => audit.evidenceId === row.id)));
}

export async function appendEvidenceAudit(
  tx: Transaction,
  evidenceId: number,
  eventType: string,
  actor: string,
  details: Record<string, unknown> = {},
) {
  await tx.insert(evidenceAuditEventsTable).values({ evidenceId, eventType, actor, details });
}

type KnownWorkType = { id: number; code: string; name: string; unit: string; maxPerCrewDay: string };
type CandidateItem = { id: number; workTypeId: number; quantity: string; unit: string };

type Interpretation = {
  transcript?: string;
  quantity?: number;
  workTypeId?: number;
  unit?: string;
  confidence: number;
  identityConfidence: number;
  explanation: string;
};

function parseModelJson(value: string): Interpretation {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const quantity = typeof parsed.quantity === "number" ? parsed.quantity : undefined;
  const workTypeId = Number.isInteger(parsed.workTypeId) ? Number(parsed.workTypeId) : undefined;
  const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const identityConfidence =
    typeof parsed.identityConfidence === "number" ? Math.max(0, Math.min(1, parsed.identityConfidence)) : 0;
  return {
    quantity,
    workTypeId,
    unit: typeof parsed.unit === "string" ? parsed.unit : undefined,
    confidence,
    identityConfidence,
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : "Model returned no explanation.",
  };
}

function promptForContext(workTypes: KnownWorkType[], items: CandidateItem[]) {
  return `You are extracting one fiber construction production proposal from field evidence.
Only use the known work types and production item IDs below. Never invent an ID.
Known work types: ${JSON.stringify(workTypes.map((workType) => ({
    id: workType.id,
    code: workType.code,
    name: workType.name,
    unit: workType.unit,
  })))}
Existing production items for this crew-day: ${JSON.stringify(items)}
Return JSON only with keys quantity (number or null), workTypeId (integer or null), unit (string or null), confidence (0..1), identityConfidence (0..1), explanation (string).
If the evidence is unreadable, ambiguous, or does not identify a known work type, return null quantity/workTypeId and low confidence.`;
}

async function interpretPhoto(buffer: Buffer, contentType: string, workTypes: KnownWorkType[], items: CandidateItem[]) {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: promptForContext(workTypes, items) },
      {
        role: "user",
        content: [
          { type: "text", text: "Read the counter, sign, or site evidence and extract the supported production quantity." },
          { type: "image_url", image_url: { url: `data:${contentType};base64,${buffer.toString("base64")}` } },
        ],
      },
    ],
  });
  return parseModelJson(response.choices[0]?.message?.content ?? "{}");
}

async function interpretAudio(buffer: Buffer, contentType: string, workTypes: KnownWorkType[], items: CandidateItem[]) {
  const format = contentType.includes("webm") ? "webm" : "mp3";
  const transcript = await speechToText(buffer, format);
  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: promptForContext(workTypes, items) },
      { role: "user", content: `Field voice note transcript:\n${transcript}` },
    ],
  });
  return { ...parseModelJson(response.choices[0]?.message?.content ?? "{}"), transcript };
}

export async function interpretEvidence(
  evidence: Pick<EvidenceItem, "kind" | "contentType" | "objectPath">,
  workTypes: KnownWorkType[],
  items: CandidateItem[],
) {
  const file = await storage.getObjectEntityFile(evidence.objectPath);
  const [buffer] = await file.download();
  if (evidence.kind === "photo") return interpretPhoto(buffer, evidence.contentType, workTypes, items);
  return interpretAudio(buffer, evidence.contentType, workTypes, items);
}

export async function verifyEvidenceObject(
  objectPath: string,
  expectedBytes: number,
  expectedContentType: string,
  expectedSha256: string,
) {
  const file = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  return {
    buffer,
    valid:
      Number(metadata.size) === expectedBytes &&
      String(metadata.contentType ?? expectedContentType) === expectedContentType &&
      actualSha256.toLowerCase() === expectedSha256.toLowerCase(),
    actualSha256,
  };
}

export function buildEvidenceChecks(
  interpretation: Interpretation,
  workTypes: KnownWorkType[],
  items: CandidateItem[],
  plannedQuantity: string | undefined,
  otherCrewDayQuantity: string,
  otherSiteQuantity: string,
  verifiedDuplicateIds: number[] = [],
): EvidenceCheck[] {
  const checks: EvidenceCheck[] = [];
  const workType = interpretation.workTypeId ? workTypes.find((candidate) => candidate.id === interpretation.workTypeId) : undefined;
  const matchingItems = interpretation.workTypeId ? items.filter((item) => item.workTypeId === interpretation.workTypeId) : [];
  checks.push({
    code: "identity_context",
    passed: Boolean(workType && matchingItems.length === 1),
    severity: workType && matchingItems.length === 1 ? "info" : "blocking",
    message: workType && matchingItems.length === 1 ? "Matched to one known work type in this crew-day." : "Evidence identity is ambiguous or unknown.",
  });
  checks.push({
    code: "quantity_positive",
    passed: typeof interpretation.quantity === "number" && interpretation.quantity > 0,
    severity: "blocking",
    message: typeof interpretation.quantity === "number" && interpretation.quantity > 0 ? "Candidate quantity is positive." : "No positive quantity was extracted.",
  });
  checks.push({
    code: "unit_consistency",
    passed: Boolean(workType && interpretation.unit === workType.unit),
    severity: "blocking",
    message: workType && interpretation.unit === workType.unit ? "Candidate unit matches the known work type." : "Candidate unit does not match the known work type.",
  });
  const matchedItem = matchingItems.length === 1 ? matchingItems[0] : undefined;
  const submittedQuantity = matchedItem ? Number(matchedItem.quantity) : 0;
  const relativeDifference =
    matchedItem && submittedQuantity > 0 && typeof interpretation.quantity === "number"
      ? Math.abs(interpretation.quantity - submittedQuantity) / submittedQuantity
      : 0;
  checks.push({
    code: "cost_of_error",
    passed: !matchedItem || (typeof interpretation.quantity === "number" && relativeDifference <= 0.25),
    severity: "blocking",
    message:
      !matchedItem
        ? "No uniquely matched submitted item was available for a cost-of-error comparison."
        : typeof interpretation.quantity !== "number"
          ? "Candidate quantity is unavailable for cost-of-error comparison."
          : relativeDifference <= 0.25
            ? `Candidate is within 25% of submitted quantity (${submittedQuantity.toFixed(2)}).`
            : `Candidate differs from submitted quantity ${submittedQuantity.toFixed(2)} by ${(relativeDifference * 100).toFixed(1)}%; manual review is required.`,
  });
  const candidate = interpretation.quantity ?? 0;
  const maxPerCrewDay = workType ? Number(workType.maxPerCrewDay) : 0;
  checks.push({
    code: "crew_day_plausibility",
    passed: Boolean(workType && candidate + Number(otherCrewDayQuantity) <= maxPerCrewDay),
    severity: "blocking",
    message: workType && candidate + Number(otherCrewDayQuantity) <= maxPerCrewDay ? "Candidate remains within crew-day plausibility limits." : "Candidate exceeds the crew-day limit.",
  });
  checks.push({
    code: "remaining_plan",
    passed: plannedQuantity === undefined || candidate + Number(otherSiteQuantity) <= Number(plannedQuantity),
    severity: "blocking",
    message: plannedQuantity === undefined || candidate + Number(otherSiteQuantity) <= Number(plannedQuantity) ? "Candidate does not exceed the remaining plan." : "Candidate exceeds the remaining plan.",
  });
  checks.push({
    code: "confidence_route",
    passed: interpretation.confidence >= 0.85 && interpretation.identityConfidence >= 0.9,
    severity: "warning",
    message: interpretation.confidence >= 0.85 && interpretation.identityConfidence >= 0.9 ? "Confidence is suitable for a reviewer proposal." : "Low confidence requires manual review.",
  });
  if (verifiedDuplicateIds.length > 0) {
    checks.push({
      code: "duplicate_content",
      passed: false,
      severity: "blocking",
      message: `Verified content duplicate of evidence ${verifiedDuplicateIds.join(", ")}; manual review is required to preserve provenance.`,
    });
  }
  return checks;
}