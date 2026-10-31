export const textFields = ["title", "description", "alt_text"] as const;
export type TextField = (typeof textFields)[number];
export type TextSource = "unset" | "ai" | "manual";
export type TextSources = Record<TextField, TextSource>;
export type CaptionMode = "description" | "custom" | "hidden";

export type PhotographTextFields = {
  title: string;
  description: string;
  altText: string;
  filenameSuggestion: string;
  uncertainties: string[];
};

export type PhotographTextDraft = {
  id: string;
  runId: string;
  photographId: string;
  filename: string;
  storagePath: string;
  fields: PhotographTextFields;
  originalFields: PhotographTextFields;
  version: number;
  baselineRevision: number;
  currentRevision: number;
  sources: TextSources;
  status: "pending" | "applied" | "conflict" | "protected";
  notesResolved: boolean;
};

export type TextBatchRow = {
  draftId: string;
  filename: string;
  status: "ready" | "conflict" | "applied" | "protected";
  eligibleFields: TextField[];
  protectedFields: TextField[];
  before: Record<TextField, string | null>;
  after: Record<TextField, string | null>;
};

export type TextBatchPreview = {
  token: string;
  runId: string;
  rows: TextBatchRow[];
  expiresAt: string;
};

// Recovered approvals must display their own fields, never a newer local
// checkbox selection which could hide a change about to be applied.
export function previewTextFields(row: Pick<TextBatchRow, "eligibleFields" | "protectedFields">): TextField[] {
  return textFields.filter(field => row.eligibleFields.includes(field) || row.protectedFields.includes(field));
}

export type TextBatchResult = {
  draftId: string;
  filename: string;
  status: string;
  fields: TextField[];
};

export type TextSnapshot = {
  formatVersion: 1;
  photos: Array<{
    id: string;
    filename: string;
    storagePath: string;
    width: number;
    height: number;
    textRevision: number;
    title: string | null;
    description: string | null;
    altText: string | null;
  }>;
};

export const emptyTextSources: TextSources = {
  title: "unset", description: "unset", alt_text: "unset",
};

export function photographCaption(photograph: {
  description?: string | null;
  captionMode?: CaptionMode;
  customCaption?: string | null;
}): string | null {
  if (photograph.captionMode === "hidden") return null;
  const value = photograph.captionMode === "custom"
    ? photograph.customCaption : photograph.description;
  return value?.trim() || null;
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const sha256Pattern = /^[0-9a-f]{64}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a text record.");
  }
  return value as Record<string, unknown>;
}

export function validatePhotographTextFields(value: unknown): PhotographTextFields {
  const fields = object(value);
  const required = ["title", "description", "altText", "filenameSuggestion", "uncertainties"];
  if (Object.keys(fields).sort().join() !== required.sort().join()) {
    throw new Error("The draft has unexpected fields.");
  }
  for (const [key, max] of [["title", 200], ["description", 1000], ["altText", 500], ["filenameSuggestion", 160]] as const) {
    const text = fields[key];
    if (typeof text !== "string" || !text.trim() || text.length > max || /[<>\x00-\x1f\x7f]/.test(text)) {
      throw new Error(`The draft ${key} is invalid or too long.`);
    }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+){1,11}\.jpg$/.test(fields.filenameSuggestion as string)) {
    throw new Error("The filename suggestion must be a descriptive .jpg name, not a path.");
  }
  if (!Array.isArray(fields.uncertainties) || fields.uncertainties.length > 5 ||
    fields.uncertainties.some(note => typeof note !== "string" || note.length > 300 || /[<>\x00-\x1f\x7f]/.test(note))) {
    throw new Error("The uncertainty notes are invalid.");
  }
  return fields as PhotographTextFields;
}

export function validateTextImport(value: unknown) {
  const envelope = object(value);
  const config = object(envelope.config);
  if (envelope.formatVersion !== 1 || typeof envelope.runId !== "string" || !uuidPattern.test(envelope.runId) ||
    config.model !== "gpt-6.1-sol" || typeof config.promptVersion !== "string" || !sha256Pattern.test(config.promptVersion) ||
    typeof config.configHash !== "string" || !sha256Pattern.test(config.configHash)) {
    throw new Error("Import a version 1 Sol draft export with its original run/configuration identity.");
  }
  if (!Array.isArray(envelope.records) || !envelope.records.length || envelope.records.length > 20 ||
    JSON.stringify(value).length > 500_000) {
    throw new Error("Import at most 20 metadata records per request.");
  }
  const records = envelope.records.map(value => {
    const row = object(value);
    if (typeof row.photographId !== "string" || !uuidPattern.test(row.photographId) ||
      typeof row.storagePath !== "string" || !row.storagePath || row.storagePath.length > 1024 ||
      typeof row.previewSha256 !== "string" || !sha256Pattern.test(row.previewSha256) ||
      typeof row.filename !== "string" || !row.filename || row.filename.length > 255 ||
      !Number.isSafeInteger(row.width) || (row.width as number) <= 0 ||
      !Number.isSafeInteger(row.height) || (row.height as number) <= 0 ||
      !Number.isSafeInteger(row.textRevision) || (row.textRevision as number) < 0 ||
      typeof row.responseId !== "string" || !row.responseId || row.responseId.length > 200 ||
      typeof row.model !== "string" || !/^gpt-6\.1-sol(?:-[a-z0-9-]+)?$/.test(row.model)) {
      throw new Error("A draft is missing its photograph, preview, response or revision identity.");
    }
    return {
      photographId: row.photographId, filename: row.filename, storagePath: row.storagePath,
      width: row.width as number, height: row.height as number, textRevision: row.textRevision as number,
      previewSha256: row.previewSha256, fields: validatePhotographTextFields(row.fields),
      responseId: row.responseId, model: row.model,
      usage: row.usage && typeof row.usage === "object" ? row.usage : null,
    };
  });
  if (new Set(records.map(row => row.photographId)).size !== records.length) {
    throw new Error("The import contains duplicate photographs.");
  }
  return { formatVersion: 1, runId: envelope.runId, config: {
    model: "gpt-6.1-sol", promptVersion: config.promptVersion, configHash: config.configHash,
  }, records };
}
