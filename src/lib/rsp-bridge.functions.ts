import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  encryptQuestionnaire,
  processIntake,
  rankVaultAssets,
  generateBriefs,
  type Intake,
  type Tier,
  type VaultAssetCandidate,
  type VaultMatch,
  type buildVaultQuery,
} from "./rsp-bridge.server";

/**
 * Fetches the real content assets available to the persona this submission
 * targets and ranks them against the vault query. Real content_assets has a
 * flat asset_type + free-form tags, not a namespaced taxonomy — see the
 * comment above rankVaultAssets for why this bridges rather than invents a
 * new tagging layer. Returns [] (never throws) if there's no matching
 * persona or no eligible assets — the questionnaire submission itself must
 * never fail because content recommendations couldn't be computed.
 */
async function matchVaultAssets(
  db: any,
  supabaseAdmin: any,
  creatorId: string,
  personaTemplate: string,
  query: ReturnType<typeof buildVaultQuery>,
): Promise<VaultMatch[]> {
  const personaType = personaTemplate === "real" ? "real_me" : personaTemplate;
  const { data: persona } = await supabaseAdmin
    .from("personas")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("persona_type", personaType)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!persona) return [];

  // Same "directly permitted OR shared_across_personas" resolution as
  // fan-feed.functions.ts's getPersonaFeed — the one existing, correct way
  // this app already answers "which assets can this persona show."
  const [{ data: perms }, { data: shared }] = await Promise.all([
    db.from("persona_content_permissions").select("asset_id, permission_type").eq("persona_id", persona.id),
    db.from("content_assets").select("id").eq("creator_id", creatorId).eq("shared_across_personas", true),
  ]);
  const permMap = new Map<string, "included" | "ppv" | "restricted">();
  for (const p of perms ?? []) permMap.set(p.asset_id, p.permission_type);
  for (const s of shared ?? []) if (!permMap.has(s.id)) permMap.set(s.id, "included");
  const assetIds = Array.from(permMap.keys());
  if (!assetIds.length) return [];

  const { data: assets } = await db
    .from("content_assets")
    .select("id, title, asset_type, tags, created_at")
    .in("id", assetIds)
    .eq("approval_status", "approved")
    .neq("moderation_status", "removed")
    .neq("internal_label", "do_not_use")
    .neq("internal_label", "restricted")
    .neq("visibility", "private");

  const candidates: VaultAssetCandidate[] = (assets ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    assetType: a.asset_type,
    tags: a.tags ?? [],
    permissionType: permMap.get(a.id) ?? "included",
    createdAt: a.created_at,
  }));
  return rankVaultAssets(candidates, query);
}

export const submitRspQuestionnaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { creatorId: string; intake: Intake }) => data)
  .handler(async ({ data, context }) => {
    const key = process.env.RSP_ENCRYPTION_KEY,
      keyVersion = process.env.RSP_ENCRYPTION_KEY_VERSION ?? "v1";
    if (!key) throw new Error("RSP bridge encryption is not configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: creator, error: creatorError },
      { data: subscription, error: subscriptionError },
    ] = await Promise.all([
      context.supabase.from("creators").select("id").eq("id", data.creatorId).maybeSingle(),
      supabaseAdmin
        .from("subscriptions")
        .select("tier,status,current_period_end")
        .eq("fan_id", context.userId)
        .eq("creator_id", data.creatorId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    if (creatorError || !creator) throw new Error("Creator scope is unavailable");
    if (subscriptionError) throw new Error("Entitlement resolution failed");
    const rawTier = subscription?.tier ?? "base",
      tier: Tier =
        rawTier === "vip"
          ? "vip"
          : ["plus", "naughty", "wicked"].includes(rawTier)
            ? "plus"
            : "base";
    const submissionId = crypto.randomUUID(),
      now = new Date(),
      result = processIntake(data.intake, {
        creatorScope: data.creatorId,
        tier,
        submissionId,
        now,
      });
    const encrypted = encryptQuestionnaire(data.intake.questionnaire, {
      creatorId: data.creatorId,
      submissionId,
      schemaVersion: data.intake.schemaVersion,
      retentionExpiry: result.policy.retention.expiresAt,
      keyVersion,
      masterKey: key,
    });
    // Generated database types update after the additive migration is deployed.
    // Generated database types update after the migration is deployed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { error: submissionError } = await db.from("rsp_questionnaire_submissions").insert({
      id: submissionId,
      creator_id: data.creatorId,
      supporter_id: context.userId,
      schema_version: data.intake.schemaVersion,
      questionnaire_version: data.intake.sessionContext.questionnaireVersion,
      source: data.intake.sessionContext.source,
      locale: data.intake.sessionContext.locale,
      status: "processed",
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authentication_tag: encrypted.authenticationTag,
      wrapped_data_key: encrypted.wrappedDataKey,
      wrap_nonce: encrypted.wrapNonce,
      wrap_authentication_tag: encrypted.wrapAuthenticationTag,
      encryption_algorithm: encrypted.encryptionAlgorithm,
      key_version: encrypted.keyVersion,
      associated_data_hash: encrypted.associatedDataHash,
      expires_at: encrypted.retentionExpiry,
      processed_at: now.toISOString(),
    });
    if (submissionError) throw new Error("Encrypted intake could not be stored");
    const receiptHash = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(JSON.stringify(data.intake.consentReceipt)))
      .then((hash) =>
        Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""),
      );
    const { error: derivedError } = await db.from("rsp_consent_receipts").insert({
      submission_id: submissionId,
      consent_version: data.intake.consentReceipt.consentVersion,
      accepted_at: data.intake.consentReceipt.acceptedAt,
      adult_confirmed: data.intake.consentReceipt.adultConfirmed,
      respectful_use_accepted: data.intake.consentReceipt.respectfulUseAccepted,
      personalisation_allowed: data.intake.consentReceipt.personalisationAllowed,
      preferences_may_be_saved: data.intake.consentReceipt.preferencesMayBeSaved,
      receipt_hash: receiptHash,
    });
    if (derivedError) throw new Error("Consent receipt could not be stored");
    const { data: profileRow, error: profileError } = await db
      .from("rsp_privacy_safe_profiles")
      .insert({
        submission_id: submissionId,
        creator_id: data.creatorId,
        profile_token: result.profile.profileToken ?? null,
        profile_version: result.profile.profileVersion,
        profile: result.profile,
        expires_at: result.policy.retention.expiresAt,
      })
      .select("id")
      .single();
    if (profileError) throw new Error("Privacy-safe profile could not be stored");
    const writes = await Promise.all([
      db.from("rsp_policy_envelopes").insert({
        submission_id: submissionId,
        creator_id: data.creatorId,
        policy_version: result.policy.policyVersion,
        policy_hash: result.policy.policyHash,
        envelope: result.policy,
        expires_at: result.policy.retention.expiresAt,
      }),
      db.from("rsp_state_profiles").insert({
        profile_id: profileRow.id,
        state_version: result.state.stateVersion,
        states: result.state.states,
        quality: result.state.quality,
        cluster_summaries: result.state.clusterSummaries,
      }),
      db.from("rsp_vault_retrieval_requests").insert({
        profile_id: profileRow.id,
        creator_id: data.creatorId,
        request_id: result.query.requestId,
        policy_hash: result.policy.policyHash,
        retrieval_version: result.query.retrievalVersion,
        tag_schema_version: result.query.tagSchemaVersion,
        ranking_version: "metatag-rank-v1",
        request_projection: result.query,
        expires_at: result.policy.retention.expiresAt,
      }),
      db.from("rsp_audit_events").insert({
        creator_id: data.creatorId,
        actor_id: context.userId,
        submission_id: submissionId,
        event_type: "rsp.processed",
        purpose: "questionnaire_to_vault",
        category_metadata: {
          schemaVersion: "2.0",
          retained: result.policy.retention.savePreferences,
        },
      }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (writes.some(({ error }: any) => error))
      throw new Error("Derived bridge records could not be stored");

    // Vault matching is enrichment on top of an already-successful
    // submission — never let it fail the request the supporter is waiting
    // on. requiresCreatorReview stays true regardless, so nothing derived
    // here reaches a fan without a human looking at it first.
    let tailoredContentBrief = result.tailoredContentBrief;
    try {
      const matches = await matchVaultAssets(
        db,
        supabaseAdmin,
        data.creatorId,
        data.intake.questionnaire.persona,
        result.query,
      );
      const sequenceId = crypto.randomUUID();
      const { error: sequenceError } = await db.from("rsp_curated_sequences").insert({
        id: sequenceId,
        profile_id: profileRow.id,
        creator_id: data.creatorId,
        sequence_version: "1.0",
        policy_hash: result.policy.policyHash,
        persona: result.profile.persona,
        relationship_stage: result.profile.relationshipStage,
        objective: result.profile.objective,
        runtime_rules: { hardConstraints: result.chatExperienceBrief.hardConstraints },
        status: "draft",
        expires_at: result.policy.retention.expiresAt,
      });
      if (!sequenceError) {
        if (matches.length) {
          tailoredContentBrief = generateBriefs(result.policy, result.profile, result.query, matches)
            .tailoredContentBrief;
          await db.from("rsp_curated_sequence_steps").insert(
            matches.map((m, i) => ({
              sequence_id: sequenceId,
              position: i + 1,
              journey_stage: "journey.recommendation",
              asset_id: m.assetId,
              asset_version: 1,
              match_score: m.matchScore,
              match_explanation: m.matchExplanation,
              transition_rules: {},
            })),
          );
        }
        await db.from("rsp_generated_briefs").insert([
          { sequence_id: sequenceId, brief_type: "chat_experience", schema_version: "2.0", brief: result.chatExperienceBrief },
          { sequence_id: sequenceId, brief_type: "tailored_content", schema_version: "2.0", brief: tailoredContentBrief },
        ]);
      }
    } catch (e) {
      console.error("[twinly] RSP vault matching failed (non-fatal):", e);
    }

    return {
      submissionId,
      status: "ready_for_vault",
      policyHash: result.policy.policyHash,
      profileId: profileRow.id,
      expiresAt: result.policy.retention.expiresAt,
      chatExperienceBrief: result.chatExperienceBrief,
      tailoredContentBrief,
    };
  });

export const deleteRspProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { profileId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Generated database types update after the migration is deployed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: profile } = await db
      .from("rsp_privacy_safe_profiles")
      .select("id,submission_id")
      .eq("id", data.profileId)
      .maybeSingle();
    if (!profile) return { ok: true };
    const { data: submission } = await db
      .from("rsp_questionnaire_submissions")
      .select("supporter_id")
      .eq("id", profile.submission_id)
      .single();
    if (submission.supporter_id !== context.userId) throw new Error("Not authorized");
    const { error } = await db
      .from("rsp_questionnaire_submissions")
      .delete()
      .eq("id", profile.submission_id);
    if (error) throw new Error("Profile deletion failed");
    return { ok: true };
  });
