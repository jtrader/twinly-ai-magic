import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { detectFormat, validateVoiceSource, parseWavHeader, computeWavRmsAmplitude } from "./voice-source-validation.server";

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; handle: string };
}

async function requireOwnedPersona(supabase: any, creatorId: string, personaId: string) {
  const { data: persona, error } = await supabase
    .from("personas").select("id, creator_id, display_name, kind").eq("id", personaId).eq("creator_id", creatorId).maybeSingle();
  if (error) throw error;
  if (!persona) throw new Error("Persona not found, or you don't own it.");
  return persona;
}

/**
 * Voice source recordings require active Digital Twin consent AND active
 * AI-training consent (voice cloning trains a model on the recordings —
 * likeness consent alone doesn't cover that, same forTraining distinction
 * assertTwinPolicy already enforces for generation requests). This function
 * only READS existing consent state — it does not modify the consent-gating
 * logic or schema built in the earlier trust-safety work.
 *
 * Returns the id of the specific 'ai_training' entry in the consent_records
 * ledger that authorized this call, so every recording links to real proof
 * of consent, not just a boolean check.
 */
async function assertVoiceSourceConsent(supabase: any, creatorId: string): Promise<string> {
  const { data: consent, error } = await supabase
    .from("digital_twin_consent")
    .select("signed_at, revoked_at, voice_ok, training_consent_signed_at, training_consent_revoked_at")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (error) throw error;
  if (!consent || !consent.signed_at || consent.revoked_at) {
    throw new Error("Active Digital Twin consent is required before uploading voice source material.");
  }
  if (!consent.voice_ok) {
    throw new Error("Voice consent has not been granted in your Digital Twin profile.");
  }
  if (!consent.training_consent_signed_at || consent.training_consent_revoked_at) {
    throw new Error("Active AI-training consent is required — voice cloning trains on these recordings, which needs training consent specifically, not just likeness consent.");
  }

  const { data: record, error: recErr } = await supabase
    .from("consent_records")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("kind", "ai_training")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recErr) throw recErr;
  if (!record) throw new Error("No training-consent ledger entry found for this creator.");
  return record.id;
}

export type VoiceSourceRecordingResult = {
  id: string;
  status: "validated" | "rejected" | "cloned" | string;
  rejection_reason: string | null;
};

export const uploadVoiceSourceRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    personaId: string;
    filePath: string;
    sourceType: "uploaded" | "recorded_in_app";
    clientDurationSeconds?: number;
    clientSampleRate?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await requireOwnedPersona(supabase, creator.id, data.personaId);
    const consentRecordId = await assertVoiceSourceConsent(supabase, creator.id);

    const expectedPrefix = `voice-source/${creator.id}/${data.personaId}/`;
    if (!data.filePath.startsWith(expectedPrefix)) {
      throw new Error("Invalid file path for this persona.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("voice-messages").download(data.filePath);
    if (dlErr || !blob) throw new Error("Uploaded file not found in storage.");

    const bytes = await blob.arrayBuffer();
    const fileSizeBytes = bytes.byteLength;
    const format = detectFormat(data.filePath, blob.type);

    let durationSeconds = data.clientDurationSeconds ?? 0;
    let sampleRate = data.clientSampleRate ?? 0;
    let rmsAmplitude: number | null = null;

    if (format === "wav") {
      const wav = parseWavHeader(bytes);
      if (!wav) {
        // A file claiming to be WAV that doesn't parse as one is corrupted —
        // reject outright rather than falling back to client-reported values.
        const { data: row, error } = await supabase
          .from("voice_source_recordings")
          .insert({
            creator_id: creator.id, persona_id: data.personaId, file_ref: data.filePath,
            duration_seconds: data.clientDurationSeconds ?? 0, format, sample_rate: data.clientSampleRate ?? 0,
            source_type: data.sourceType, status: "rejected", rejection_reason: "The WAV file is corrupted or malformed.",
            consent_record_id: consentRecordId,
          })
          .select("*").single();
        if (error) throw error;
        return { recording: row as unknown as VoiceSourceRecordingResult };
      }
      durationSeconds = wav.durationSeconds;
      sampleRate = wav.sampleRate;
      rmsAmplitude = computeWavRmsAmplitude(bytes, wav);
    }
    // Compressed formats (mp3/m4a/webm/ogg): exact duration/sample-rate
    // parsing needs real audio decoding, unavailable here — trust the
    // client-reported values (precisely known at record/pick time) and rely
    // on the same bound checks below. See voice-source-validation.server.ts.

    const result = validateVoiceSource({ format, durationSeconds, sampleRate, fileSizeBytes, rmsAmplitude });

    const { data: row, error } = await supabase
      .from("voice_source_recordings")
      .insert({
        creator_id: creator.id,
        persona_id: data.personaId,
        file_ref: data.filePath,
        duration_seconds: durationSeconds,
        format,
        sample_rate: sampleRate,
        source_type: data.sourceType,
        status: result.status,
        rejection_reason: result.status === "rejected" ? result.rejectionReason : null,
        consent_record_id: consentRecordId,
      })
      .select("*").single();
    if (error) throw error;

    await logAudit(userId, "voice_source.uploaded", { type: "voice_source_recording", id: row.id }, {
      personaId: data.personaId, status: result.status, sourceType: data.sourceType,
    });
    return { recording: row as unknown as VoiceSourceRecordingResult };
  });

export const listVoiceSourceRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await requireOwnedPersona(supabase, creator.id, data.personaId);
    const { data: rows, error } = await supabase
      .from("voice_source_recordings")
      .select("*")
      .eq("persona_id", data.personaId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { recordings: rows ?? [] };
  });

export const deleteVoiceSourceRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { recordingId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data: rec, error: findErr } = await supabase
      .from("voice_source_recordings").select("id, file_ref, creator_id").eq("id", data.recordingId).eq("creator_id", creator.id).maybeSingle();
    if (findErr) throw findErr;
    if (!rec) throw new Error("Recording not found.");

    const { error } = await supabase.from("voice_source_recordings").delete().eq("id", data.recordingId);
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("voice-messages").remove([rec.file_ref]).catch(() => {});

    return { ok: true };
  });

const FORMAT_MIME: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  webm: "audio/webm",
  ogg: "audio/ogg",
};

// ElevenLabs' own console caps a single Instant Voice Clone submission —
// stay comfortably under it rather than sending an unbounded batch.
const MAX_CLONE_FILES = 25;

/**
 * Submits validated recordings to ElevenLabs for real Instant Voice Cloning.
 * The resulting voice_id is stored on the CREATOR (one real voice per
 * creator), not the persona — personas opt in to using it individually via
 * use_cloned_voice. Recordings are only marked 'cloned' after ElevenLabs
 * actually accepts them, so a failed call leaves them resubmittable rather
 * than silently marking the intake done despite nothing being produced.
 */
export const submitVoiceCloneJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string; recordingIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await requireOwnedPersona(supabase, creator.id, data.personaId);
    await assertVoiceSourceConsent(supabase, creator.id);

    if (!data.recordingIds.length) throw new Error("Select at least one validated recording.");
    if (data.recordingIds.length > MAX_CLONE_FILES) {
      throw new Error(`Select at most ${MAX_CLONE_FILES} recordings per submission.`);
    }
    const { data: recordings, error } = await supabase
      .from("voice_source_recordings")
      .select("id, status, file_ref, format")
      .eq("persona_id", data.personaId)
      .in("id", data.recordingIds);
    if (error) throw error;
    if ((recordings ?? []).length !== data.recordingIds.length) {
      throw new Error("One or more recordings weren't found for this persona.");
    }
    const notValidated = (recordings ?? []).filter((r: any) => r.status !== "validated");
    if (notValidated.length) {
      throw new Error("Only validated recordings can be submitted for voice cloning.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const files: { bytes: ArrayBuffer; filename: string; mimeType: string }[] = [];
    for (const rec of recordings as any[]) {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("voice-messages").download(rec.file_ref);
      if (dlErr || !blob) throw new Error(`Could not read recording ${rec.id} from storage.`);
      files.push({
        bytes: await blob.arrayBuffer(),
        filename: `${rec.id}.${rec.format}`,
        mimeType: FORMAT_MIME[rec.format] ?? "application/octet-stream",
      });
    }

    const { cloneVoice } = await import("./elevenlabs.server");
    const result = await cloneVoice({
      name: `${creator.handle} — Twinly voice`,
      files,
      description: "Twinly.life creator voice clone, submitted with explicit consent.",
    });

    const now = new Date().toISOString();
    const { error: creatorUpdErr } = await supabase
      .from("creators")
      .update({
        elevenlabs_voice_id: result.voiceId,
        elevenlabs_voice_requires_verification: result.requiresVerification,
        elevenlabs_voice_cloned_at: now,
      })
      .eq("id", creator.id);
    if (creatorUpdErr) throw creatorUpdErr;

    const { error: updErr } = await supabase
      .from("voice_source_recordings")
      .update({ submitted_for_clone_at: now, status: "cloned" })
      .in("id", data.recordingIds);
    if (updErr) throw updErr;

    await logAudit(userId, "voice_source.cloned", { type: "persona", id: data.personaId }, {
      recordingCount: data.recordingIds.length,
      voiceId: result.voiceId,
      requiresVerification: result.requiresVerification,
    });

    return {
      ok: true,
      submittedCount: data.recordingIds.length,
      voiceId: result.voiceId,
      requiresVerification: result.requiresVerification,
      note: result.requiresVerification
        ? "Voice cloned. ElevenLabs flagged this voice for additional verification before it can be used."
        : "Voice cloned successfully — enable it per persona from the persona's Basics tab.",
    };
  });
