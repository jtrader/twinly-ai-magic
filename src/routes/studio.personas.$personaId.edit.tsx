import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Film, Plus, Trash2, X as XIcon } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { useMediaUploadConsent } from "@/components/twinly/MediaUploadConsentGate";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/lib/useAvatarUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { listMyPersonas } from "@/lib/onboarding.functions";
import { updatePersona, setPersonaVisibility } from "@/lib/persona-studio.functions";
import { listPacks, attachPackToPersona, detachPackFromPersona } from "@/lib/content-packs.functions";
import { getTwinProfile } from "@/lib/twin.functions";
import {
  listSavedMessages, createSavedMessage, updateSavedMessage, deleteSavedMessage,
} from "@/lib/saved-messages.functions";
import {
  createPersonaInvite, listPersonaInvites, revokePersonaInvite,
} from "@/lib/persona-invites.functions";
import {
  createInviteGrant, listInviteGrants, revokeInviteGrant,
} from "@/lib/invite-grants.functions";
import { getPersonaVisibilityPolicy, setPersonaDefaultVisibility } from "@/lib/feed-visibility.functions";
import type { FeedVisibilityTier } from "@/lib/feed-visibility-access.server";
import { nextFeedTierForToggle } from "@/lib/feed-visibility-tier-toggle";
import {
  uploadPersonaIntroVideo, requestPersonaIntroVideoGeneration, getMyPersonaIntroVideoStatus, removePersonaIntroVideo,
  type PersonaIntroVideoStatus,
} from "@/lib/persona-intro-video.functions";
import {
  CONTENT_THEME_KEYS, CONTENT_THEME_LABELS, VISIBILITY_LABEL, ExternalModelIdsPanel, VoiceSettingSlider,
  centsToDollarsInput, dollarsInputToCents, resizeImageToBlob,
  type Persona, type Visibility,
} from "@/components/twinly/persona-form-shared";

export const Route = createFileRoute("/studio/personas/$personaId/edit")({
  component: EditPersonaPage,
  head: () => ({
    meta: [
      { title: "Edit persona — Creator Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Tab = "basics" | "training" | "packs" | "twin" | "invites" | "saved";

function EditPersonaPage() {
  const { personaId } = useParams({ from: "/studio/personas/$personaId/edit" });
  const { user, loading } = useSession();
  const navigate = useNavigate();

  const load = useServerFn(listMyPersonas);
  const update = useServerFn(updatePersona);
  const setVis = useServerFn(setPersonaVisibility);

  const [persona, setPersona] = useState<Persona | null>(null);
  const [creator, setCreator] = useState<{ id: string; elevenlabsVoiceId: string | null; digitalTwinStatus?: string; baselineVeniceSlug: string | null } | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const r = await load();
    if (!r.creator) { navigate({ to: "/onboarding" }); return; }
    const p = r.personas.find((x) => x.id === personaId) ?? null;
    if (!p) { toast.error("Persona not found"); navigate({ to: "/studio/personas" }); return; }
    setCreator({
      id: r.creator.id,
      elevenlabsVoiceId: (r.creator as any).elevenlabs_voice_id ?? null,
      digitalTwinStatus: (r.creator as any).digital_twin_status,
      baselineVeniceSlug: (r.creator as any).venice_character_slug ?? null,
    });
    setPersona(p);
    setReady(true);
  }, [load, navigate, personaId]);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => { if (user) refresh().catch(() => setReady(true)); }, [user, refresh]);

  if (loading || !ready || !persona || !creator) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <PersonaEditForm
        persona={persona}
        creator={creator}
        update={update}
        setVis={setVis}
        refresh={refresh}
      />
    </AppShell>
  );
}

function PersonaEditForm({
  persona, creator, update, setVis, refresh,
}: {
  persona: Persona;
  creator: { id: string; elevenlabsVoiceId: string | null; digitalTwinStatus?: string; baselineVeniceSlug: string | null };
  update: ReturnType<typeof useServerFn<typeof updatePersona>>;
  setVis: ReturnType<typeof useServerFn<typeof setPersonaVisibility>>;
  refresh: () => Promise<void>;
}) {
  const { user } = useSession();
  const { ensureConsent } = useMediaUploadConsent();
  const getFeedPolicy = useServerFn(getPersonaVisibilityPolicy);
  const setFeedPolicy = useServerFn(setPersonaDefaultVisibility);
  const [feedTier, setFeedTier] = useState<FeedVisibilityTier>("subscribers_only");
  const [feedTierBusy, setFeedTierBusy] = useState(false);

  const getIntroStatus = useServerFn(getMyPersonaIntroVideoStatus);
  const uploadIntro = useServerFn(uploadPersonaIntroVideo);
  const generateIntro = useServerFn(requestPersonaIntroVideoGeneration);
  const removeIntro = useServerFn(removePersonaIntroVideo);
  const [introStatus, setIntroStatus] = useState<PersonaIntroVideoStatus | null>(null);
  const [introPrompt, setIntroPrompt] = useState("");
  const [introUploadBusy, setIntroUploadBusy] = useState(false);
  const [introGenerateBusy, setIntroGenerateBusy] = useState(false);

  const [displayName, setName] = useState(persona.display_name);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(((persona as any).avatar_url as string | null) ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(persona.visibility);
  const [visBusy, setVisBusy] = useState(false);
  const avatarSrc = useAvatarUrl(avatarUrl);
  const [description, setDescription] = useState(persona.description ?? "");
  const [disclosureLabel, setDisclosure] = useState(persona.disclosure_label);
  const [systemPrompt, setSystemPrompt] = useState(((persona as any).system_prompt as string | null) ?? "");
  const [explicitnessCeiling, setExplicitnessCeiling] = useState<"sfw" | "suggestive" | "explicit">(
    ((persona as any).explicitness_ceiling as any) ?? "sfw",
  );
  const [personality, setPersonality] = useState(((persona as any).tone_rules?.personality as string | null) ?? "");
  const [hardLimitsText, setHardLimitsText] = useState(
    ((((persona as any).boundary_rules?.hard_limits ?? []) as string[])).join("\n"),
  );
  const [priceDollars, setPriceDollars] = useState(centsToDollarsInput((persona as any).price_cents));
  const [veniceChatOptIn, setVeniceChatOptIn] = useState(!!(persona as any).venice_chat_opt_in);
  const [contentThemeOverrides, setContentThemeOverrides] = useState<Record<string, boolean>>(
    ((persona as any).content_theme_overrides as Record<string, boolean> | null) ?? {},
  );
  const [useClonedVoice, setUseClonedVoice] = useState(!!(persona as any).use_cloned_voice);
  const [voiceStability, setVoiceStability] = useState(((persona as any).voice_stability as number | null) ?? 0.5);
  const [voiceSimilarityBoost, setVoiceSimilarityBoost] = useState(((persona as any).voice_similarity_boost as number | null) ?? 0.75);
  const [voiceStyle, setVoiceStyle] = useState(((persona as any).voice_style as number | null) ?? 0);
  const [requireIdVerification, setRequireIdVerification] = useState(!!(persona as any).require_id_verification);
  const [requiresVerifiedSupporter, setRequiresVerifiedSupporter] = useState(
    !!(persona as any).requires_verified_supporter,
  );
  const [veniceCharacterSlug, setVeniceCharacterSlug] = useState(((persona as any).venice_character_slug as string | null) ?? "");
  const [busy, setBusy] = useState(false);

  const tn = useMemo(() => ((persona as any).training_notes ?? {}) as Record<string, string>, [persona]);
  const [toneExamples, setToneExamples] = useState(tn.tone_examples ?? "");
  const [dos, setDos] = useState(tn.dos ?? "");
  const [donts, setDonts] = useState(tn.donts ?? "");
  const [samplePhrasings, setSamplePhrasings] = useState(tn.sample_phrasings ?? "");
  const [voiceRefUrl, setVoiceRefUrl] = useState(tn.voice_ref_url ?? "");

  const [tab, setTab] = useState<Tab>("basics");

  // Saved messages
  const [savedItems, setSavedItems] = useState<any[] | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newFewShot, setNewFewShot] = useState(false);
  const [savedBusy, setSavedBusy] = useState<string | null>(null);
  const refreshSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await listSavedMessages({ data: { personaId: persona.id } });
      setSavedItems(res.items ?? []);
    } catch (e: any) { toast.error(e.message ?? "Could not load saved replies"); }
    finally { setSavedLoading(false); }
  }, [persona.id]);
  useEffect(() => { if (tab === "saved" && savedItems === null) refreshSaved(); }, [tab, savedItems, refreshSaved]);

  // Invites
  const createInvite = useServerFn(createPersonaInvite);
  const listInvites = useServerFn(listPersonaInvites);
  const revokeInvite = useServerFn(revokePersonaInvite);
  const [invites, setInvites] = useState<any[] | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const refreshInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const res = await listInvites({ data: { personaId: persona.id } });
      setInvites(res.invites ?? []);
    } catch (e: any) { toast.error(e.message ?? "Could not load invites"); }
    finally { setInvitesLoading(false); }
  }, [persona.id, listInvites]);
  useEffect(() => { if (tab === "invites" && invites === null) refreshInvites(); }, [tab, invites, refreshInvites]);

  async function generateInvite() {
    setInviteBusy(true);
    try { await createInvite({ data: { personaId: persona.id } }); setInvites(null); refreshInvites(); }
    catch (e: any) { toast.error(e.message ?? "Could not create invite"); }
    finally { setInviteBusy(false); }
  }
  async function handleRevokeInvite(inviteId: string) {
    setInviteBusy(true);
    try {
      await revokeInvite({ data: { inviteId } });
      setInvites((s) => s?.map((i) => i.id === inviteId ? { ...i, status: "revoked" } : i) ?? null);
    } catch (e: any) { toast.error(e.message ?? "Could not revoke invite"); }
    finally { setInviteBusy(false); }
  }

  // Supporter invite grants
  const createGrantFn = useServerFn(createInviteGrant);
  const listGrantsFn = useServerFn(listInviteGrants);
  const revokeGrantFn = useServerFn(revokeInviteGrant);
  const [grants, setGrants] = useState<any[] | null>(null);
  const [grantsBusy, setGrantsBusy] = useState(false);
  const [grantExpiryHours, setGrantExpiryHours] = useState<number>(168);
  const refreshGrants = useCallback(async () => {
    try {
      const r = await listGrantsFn({ data: { personaId: persona.id } });
      setGrants(r.grants ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Could not load supporter invites"); }
  }, [listGrantsFn, persona.id]);
  useEffect(() => { if (tab === "invites" && grants === null) refreshGrants(); }, [tab, grants, refreshGrants]);

  async function generateGrant() {
    setGrantsBusy(true);
    try {
      await createGrantFn({ data: { personaId: persona.id, expiresInHours: grantExpiryHours } });
      setGrants(null); await refreshGrants();
      toast.success("Supporter invite created");
    } catch (e: any) { toast.error(e?.message ?? "Could not create supporter invite"); }
    finally { setGrantsBusy(false); }
  }
  async function handleRevokeGrant(id: string) {
    setGrantsBusy(true);
    try {
      await revokeGrantFn({ data: { grantId: id } });
      setGrants((s) => s?.map((g) => g.id === id ? { ...g, revoked_at: new Date().toISOString(), revocation_reason: "creator_revoked" } : g) ?? null);
    } catch (e: any) { toast.error(e?.message ?? "Could not revoke"); }
    finally { setGrantsBusy(false); }
  }
  async function addSaved() {
    if (!newLabel.trim()) return;
    setSavedBusy("new");
    try {
      await createSavedMessage({ data: { personaId: persona.id, label: newLabel.trim(), body: newBody.trim() || undefined, useAsFewShot: newFewShot } });
      setNewLabel(""); setNewBody(""); setNewFewShot(false);
      setSavedItems(null); refreshSaved();
    } catch (e: any) { toast.error(e.message ?? "Could not save reply"); }
    finally { setSavedBusy(null); }
  }
  async function toggleFewShot(item: any, v: boolean) {
    setSavedBusy(item.id);
    try {
      await updateSavedMessage({ data: { id: item.id, useAsFewShot: v } });
      setSavedItems((s) => s?.map((r) => r.id === item.id ? { ...r, use_as_few_shot: v } : r) ?? null);
    } catch (e: any) { toast.error(e.message ?? "Update failed"); }
    finally { setSavedBusy(null); }
  }
  async function removeSaved(id: string) {
    setSavedBusy(id);
    try {
      await deleteSavedMessage({ data: { id } });
      setSavedItems((s) => s?.filter((r) => r.id !== id) ?? null);
    } catch (e: any) { toast.error(e.message ?? "Delete failed"); }
    finally { setSavedBusy(null); }
  }

  // Twin refs
  const [twinLinkMode, setTwinLinkMode] = useState<"all" | "selected" | "none">(((persona as any).twin_link_mode as any) ?? "all");
  const [linkedRefIds, setLinkedRefIds] = useState<string[]>(((persona as any).linked_twin_ref_ids as string[] | null) ?? []);
  const [heygenAvatarId, setHeygenAvatarId] = useState(((persona as any).heygen_avatar_id as string | null) ?? "");
  const [heygenVoiceId, setHeygenVoiceId] = useState(((persona as any).heygen_voice_id as string | null) ?? "");
  const [elevenlabsVoiceIdOverride, setElevenlabsVoiceIdOverride] = useState(((persona as any).elevenlabs_voice_id as string | null) ?? "");
  const [twinRefs, setTwinRefs] = useState<any[] | null>(null);
  const loadTwin = useServerFn(getTwinProfile);
  useEffect(() => {
    if (tab !== "twin" || twinRefs) return;
    (async () => {
      try { const r = await loadTwin(); setTwinRefs(r.refs as any[]); }
      catch (e: any) { toast.error(e?.message ?? "Failed to load twin refs"); }
    })();
  }, [tab, twinRefs, loadTwin]);

  // Packs
  const loadPacks = useServerFn(listPacks);
  const attachPack = useServerFn(attachPackToPersona);
  const detachPack = useServerFn(detachPackFromPersona);
  const [packs, setPacks] = useState<any[]>([]);
  const [attachRows, setAttachRows] = useState<Array<{ pack_id: string; persona_id: string; permission_type: string }>>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packBusy, setPackBusy] = useState<string | null>(null);
  const refreshPacks = useCallback(async () => {
    setPacksLoading(true);
    try { const res = await loadPacks(); setPacks(res.packs ?? []); setAttachRows(res.attach ?? []); }
    catch (e: any) { toast.error(e.message ?? "Could not load packs"); }
    finally { setPacksLoading(false); }
  }, [loadPacks]);
  useEffect(() => { if (tab === "packs") refreshPacks(); }, [tab, refreshPacks]);

  useEffect(() => {
    getFeedPolicy({ data: { personaId: persona.id } }).then((r) => setFeedTier(r.defaultVisibility)).catch(() => {});
  }, [persona.id, getFeedPolicy]);

  const refreshIntroStatus = useCallback(async () => {
    try { const r = await getIntroStatus({ data: { personaId: persona.id } }); setIntroStatus(r); }
    catch { setIntroStatus(null); }
  }, [persona.id, getIntroStatus]);
  useEffect(() => { refreshIntroStatus(); }, [refreshIntroStatus]);

  async function handleIntroVideoPick(file: File) {
    if (!(await ensureConsent({ context: "persona.intro_video" }))) return;
    const allowed = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowed.includes(file.type)) { toast.error("Use an MP4, WebM, or MOV video."); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Video must be under 50MB."); return; }
    const durationOk = await new Promise<boolean>((resolve) => {
      const url = URL.createObjectURL(file);
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      videoEl.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(videoEl.duration >= 3 && videoEl.duration <= 15); };
      videoEl.onerror = () => { URL.revokeObjectURL(url); resolve(true); };
      videoEl.src = url;
    });
    if (!durationOk) { toast.error("Intro video should be roughly 3–15 seconds long."); return; }

    setIntroUploadBusy(true);
    try {
      const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
      const path = `${creator.id}/intro-video/${persona.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("content-assets").upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      await uploadIntro({ data: { personaId: persona.id, storagePath: path, byteSize: file.size } });
      toast.success("Intro video uploaded — pending admin approval.");
      await refreshIntroStatus();
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setIntroUploadBusy(false); }
  }
  async function handleGenerateIntroVideo() {
    if (!introPrompt.trim()) return;
    setIntroGenerateBusy(true);
    try {
      await generateIntro({ data: { personaId: persona.id, prompt: introPrompt.trim() } });
      toast.success("Intro video queued — this can take a few minutes, then needs admin approval.");
      setIntroPrompt("");
      await refreshIntroStatus();
    } catch (e: any) { toast.error(e?.message ?? "Could not queue the intro video"); }
    finally { setIntroGenerateBusy(false); }
  }
  async function handleRemoveIntroVideo() {
    try {
      await removeIntro({ data: { personaId: persona.id } });
      setIntroStatus({ state: "none" });
      toast.success("Intro video removed");
    } catch (e: any) { toast.error(e?.message ?? "Could not remove intro video"); }
  }

  async function applyFeedTier(next: FeedVisibilityTier) {
    const prev = feedTier;
    setFeedTier(next); setFeedTierBusy(true);
    try { await setFeedPolicy({ data: { personaId: persona.id, defaultVisibility: next } }); toast.success("Feed audience updated"); }
    catch (e: any) { setFeedTier(prev); toast.error(e.message ?? "Could not update feed audience"); }
    finally { setFeedTierBusy(false); }
  }
  const feedLoggedOutVisible = feedTier === "public";
  const feedLoggedInVisible = feedTier === "public" || feedTier === "logged_in";

  async function togglePack(packId: string, attached: boolean, permission: string) {
    setPackBusy(packId);
    try {
      if (attached) {
        await detachPack({ data: { packId, personaId: persona.id } });
        setAttachRows((s) => s.filter((r) => !(r.pack_id === packId && r.persona_id === persona.id)));
        toast.success("Pack detached");
      } else {
        await attachPack({ data: { packId, personaId: persona.id, permissionType: permission as any } });
        setAttachRows((s) => [...s, { pack_id: packId, persona_id: persona.id, permission_type: permission }]);
        toast.success("Pack attached");
      }
    } catch (e: any) { toast.error(e.message ?? "Could not update pack"); }
    finally { setPackBusy(null); }
  }
  async function changePermission(packId: string, permission: string) {
    setPackBusy(packId);
    try {
      await attachPack({ data: { packId, personaId: persona.id, permissionType: permission as any } });
      setAttachRows((s) => s.map((r) => r.pack_id === packId && r.persona_id === persona.id ? { ...r, permission_type: permission } : r));
      toast.success("Access updated");
    } catch (e: any) { toast.error(e.message ?? "Could not update access"); }
    finally { setPackBusy(null); }
  }

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setBusy(true);
    try {
      const hardLimits = hardLimitsText.split("\n").map((s) => s.trim()).filter(Boolean);
      await update({ data: {
        personaId: persona.id,
        displayName, description, disclosureLabel,
        priceCents: dollarsInputToCents(priceDollars),
        systemPrompt: persona.kind === "ai" ? systemPrompt : undefined,
        isExplicit: persona.kind === "ai" ? explicitnessCeiling !== "sfw" : undefined,
        explicitnessCeiling: persona.kind === "ai" ? explicitnessCeiling : undefined,
        toneRules: persona.kind === "ai" ? { personality } : undefined,
        boundaryRules: persona.kind === "ai" ? { hardLimits } : undefined,
        veniceChatOptIn: persona.kind === "ai" ? veniceChatOptIn : undefined,
        contentThemeOverrides: persona.kind === "ai" ? contentThemeOverrides : undefined,
        useClonedVoice: persona.kind === "ai" ? useClonedVoice : undefined,
        voiceStability: persona.kind === "ai" && useClonedVoice ? voiceStability : undefined,
        voiceSimilarityBoost: persona.kind === "ai" && useClonedVoice ? voiceSimilarityBoost : undefined,
        voiceStyle: persona.kind === "ai" && useClonedVoice ? voiceStyle : undefined,
        requireIdVerification: persona.kind === "ai" ? requireIdVerification : undefined,
        requiresVerifiedSupporter: persona.kind === "ai" ? requiresVerifiedSupporter : undefined,
        veniceCharacterSlug: persona.kind === "ai" ? veniceCharacterSlug : undefined,
        elevenlabsVoiceId: persona.kind === "ai" ? elevenlabsVoiceIdOverride : undefined,
        trainingNotes: { tone_examples: toneExamples, dos, donts, sample_phrasings: samplePhrasings, voice_ref_url: voiceRefUrl },
        twinLinkMode, linkedTwinRefIds: twinLinkMode === "selected" ? linkedRefIds : [],
        heygenAvatarId, heygenVoiceId, avatarUrl,
      }});
      toast.success("Persona saved");
      await refresh();
    } catch (err: any) { toast.error(err.message ?? "Could not save persona"); }
    finally { setBusy(false); }
  }

  async function handleAvatarPick(file: File) {
    if (!user) return;
    if (!(await ensureConsent({ context: "persona.avatar" }))) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) { toast.error("Use a PNG, JPG, or WebP image."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Image must be under 8MB."); return; }
    setAvatarBusy(true);
    try {
      const resized = await resizeImageToBlob(file, 512, 0.9).catch(() => null);
      const blob: Blob = resized ?? file;
      const contentType = resized ? "image/jpeg" : file.type;
      const ext = resized ? "jpg" : (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
      const path = `${user.id}/personas/${persona.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType });
      if (upErr) throw upErr;
      setAvatarUrl(path);
      await update({ data: { personaId: persona.id, avatarUrl: path } });
      toast.success("Avatar updated");
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setAvatarBusy(false); }
  }
  async function handleAvatarRemove() {
    setAvatarBusy(true);
    try {
      setAvatarUrl(null);
      await update({ data: { personaId: persona.id, avatarUrl: null } });
      toast.success("Avatar removed");
    } catch (e: any) { toast.error(e?.message ?? "Could not remove avatar"); }
    finally { setAvatarBusy(false); }
  }

  async function changeVisibilityInline(v: Visibility) {
    if (v === visibility) return;
    const prev = visibility;
    setVisibility(v); setVisBusy(true);
    try { await setVis({ data: { personaId: persona.id, visibility: v } }); toast.success(`Set to ${VISIBILITY_LABEL[v].toLowerCase()}`); }
    catch (e: any) { setVisibility(prev); toast.error(e?.message ?? "Could not update visibility"); }
    finally { setVisBusy(false); }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "basics", label: "Basics" },
    { id: "training", label: "Training" },
    { id: "packs", label: "Packs" },
    { id: "twin", label: "Twin" },
    { id: "invites", label: "Invites" },
    { id: "saved", label: "Saved" },
  ];

  return (
    <main className="mx-auto max-w-3xl pb-28">
      <header className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Link to="/studio/personas" className="hover:underline">Persona studio</Link> &rsaquo; Edit
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">{persona.display_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {persona.kind === "ai" ? "AI persona — disclosure is required." : "Real Me — human-led replies."}
        </p>
      </header>

      <div role="tablist" aria-label="Persona editor sections" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`tab-panel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={"min-h-11 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest " + (tab === t.id ? "border-b-2 border-brand text-foreground" : "text-muted-foreground hover:text-foreground")}
          >{t.label}</button>
        ))}
      </div>

      <form onSubmit={submit}>
        {tab === "basics" && (
          <section id="tab-panel-basics" role="tabpanel" aria-labelledby="tab-basics" className="space-y-4">
            <h2 className="sr-only">Basics</h2>
            <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-surface-elevated">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
                    {(displayName || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Profile picture</div>
                <p className="mt-0.5 text-xs text-muted-foreground">PNG or JPG, up to 5MB. Shown on this persona's card and chat header.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium hover:border-brand/40">
                    <Camera className="mr-1 size-3.5" aria-hidden />
                    <span>{avatarBusy ? "Uploading…" : avatarUrl ? "Replace" : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label="Upload profile picture"
                      disabled={avatarBusy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarPick(f); e.target.value = ""; }}
                    />
                  </label>
                  {avatarUrl && (
                    <Button type="button" size="sm" variant="ghost" disabled={avatarBusy} onClick={handleAvatarRemove} aria-label="Remove profile picture">
                      <XIcon className="mr-1 size-3.5" aria-hidden /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-persona-name">Name</Label>
              <Input id="edit-persona-name" className="mt-1.5" value={displayName} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div>
              <Label htmlFor="edit-persona-visibility">Visibility</Label>
              <Select value={visibility} onValueChange={(v) => changeVisibilityInline(v as Visibility)} disabled={visBusy}>
                <SelectTrigger id="edit-persona-visibility" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
                    <SelectItem key={v} value={v}>{VISIBILITY_LABEL[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Applies instantly. Draft &amp; Hidden are only visible to you. Public shows to everyone; Subscribers &amp; VIP only to fans in that tier.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Feed audience</h3>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Visible to logged-out visitors</span>
                <Switch checked={feedLoggedOutVisible} disabled={feedTierBusy} onCheckedChange={(v) => applyFeedTier(nextFeedTierForToggle(feedTier, "loggedOut", v))} />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Visible to logged-in visitors (non-subscribers)</span>
                <Switch checked={feedLoggedInVisible} disabled={feedTierBusy} onCheckedChange={(v) => applyFeedTier(nextFeedTierForToggle(feedTier, "loggedIn", v))} />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Subscribers can always see everything. This sets the default for new feed posts — for per-post overrides and full control, see{" "}
                <Link to="/studio/feed-visibility" className="underline">Feed visibility &rarr;</Link>
              </p>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Film className="size-3.5" aria-hidden /> Intro video</h3>
                {introStatus && (
                  <Badge variant="outline" className={
                    "text-[10px] uppercase " +
                    (introStatus.state === "approved" ? "border-emerald-400/40 text-emerald-300"
                      : introStatus.state === "rejected" ? "border-rose-400/40 text-rose-300"
                      : introStatus.state === "none" ? "text-muted-foreground"
                      : "border-amber-400/40 text-amber-300")
                  }>
                    {introStatus.state === "none" ? "None"
                      : introStatus.state === "processing" ? "Processing"
                      : introStatus.state === "pending_review" ? "Pending review"
                      : introStatus.state === "approved" ? "Live"
                      : "Rejected"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                A short (~10s) teaser shown as a play icon on this persona's public card. Uploaded or generated clips need admin approval before they're visible to fans.
              </p>
              {(introStatus?.state === "pending_review" || introStatus?.state === "approved") && introStatus.previewUrl && (
                <video src={introStatus.previewUrl} controls className="max-h-40 w-full rounded-md bg-black" />
              )}
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium hover:border-brand/40">
                  <Camera className="mr-1 size-3.5" aria-hidden />
                  <span>{introUploadBusy ? "Uploading…" : "Upload a clip"}</span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    aria-label="Upload intro video clip"
                    disabled={introUploadBusy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIntroVideoPick(f); e.target.value = ""; }}
                  />
                </label>
                {introStatus && introStatus.state !== "none" && (
                  <Button type="button" size="sm" variant="ghost" onClick={handleRemoveIntroVideo}>
                    <XIcon className="mr-1 size-3.5" aria-hidden /> Remove
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-persona-intro-prompt" className="sr-only">Intro video prompt</Label>
                <Textarea
                  id="edit-persona-intro-prompt"
                  rows={2}
                  maxLength={2000}
                  value={introPrompt}
                  onChange={(e) => setIntroPrompt(e.target.value)}
                  placeholder="Or describe a 10-second clip to generate via Venice…"
                  disabled={creator.digitalTwinStatus !== "approved"}
                />
                {creator.digitalTwinStatus !== "approved" ? (
                  <p className="text-[11px] text-amber-300">
                    Your Digital Twin Profile must be approved before generating video — see{" "}
                    <Link to="/studio/twin-onboarding" className="underline">Twin baseline &rarr;</Link>
                  </p>
                ) : (
                  <Button type="button" size="sm" disabled={introGenerateBusy || !introPrompt.trim()} onClick={handleGenerateIntroVideo}>
                    {introGenerateBusy ? "Queuing…" : "Generate (10s)"}
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="edit-persona-description">Description</Label>
              <Textarea id="edit-persona-description" className="mt-1.5" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-persona-disclosure">Disclosure label</Label>
              <Input id="edit-persona-disclosure" className="mt-1.5" value={disclosureLabel} onChange={(e) => setDisclosure(e.target.value)} maxLength={120} />
              <p className="mt-1 text-xs text-muted-foreground">Shown to every fan before they interact.</p>
            </div>
            <div>
              <Label htmlFor="edit-persona-price">Price</Label>
              <div className="relative mt-1.5">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id="edit-persona-price" className="pl-6" type="number" min="0" step="0.01" value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value)} placeholder="0.00" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Shown to fans on this persona's card. Leave blank for "Included".</p>
            </div>

            {persona.kind === "ai" && (
              <>
                <ExternalModelIdsPanel
                  idPrefix="edit-persona"
                  venice={veniceCharacterSlug} onVenice={setVeniceCharacterSlug}
                  heygenAvatar={heygenAvatarId} onHeygenAvatar={setHeygenAvatarId}
                  heygenVoice={heygenVoiceId} onHeygenVoice={setHeygenVoiceId}
                  elevenlabsVoice={elevenlabsVoiceIdOverride} onElevenlabsVoice={setElevenlabsVoiceIdOverride}
                  baselineVeniceSlug={creator.baselineVeniceSlug}
                />
                <div>
                  <Label htmlFor="edit-persona-system-prompt">System prompt</Label>
                  <Textarea id="edit-persona-system-prompt" className="mt-1.5" rows={5} maxLength={4000} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="edit-persona-personality">Personality / tone</Label>
                  <Input id="edit-persona-personality" className="mt-1.5" maxLength={300} value={personality} onChange={(e) => setPersonality(e.target.value)}
                    placeholder="e.g. Playful, teasing, warm — never sarcastic." />
                </div>
                <div>
                  <Label htmlFor="edit-persona-boundary">Boundary ceiling — one hard limit per line</Label>
                  <Textarea id="edit-persona-boundary" className="mt-1.5" rows={3} maxLength={6000} value={hardLimitsText}
                    onChange={(e) => setHardLimitsText(e.target.value)}
                    placeholder={"Never discuss meeting in person\nNever claim to be human"} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Platform-enforced and non-negotiable. Required before this persona can be published.
                  </p>
                </div>
                <div>
                  <Label htmlFor="edit-persona-explicitness">Explicitness level</Label>
                  <Select value={explicitnessCeiling} onValueChange={(v) => setExplicitnessCeiling(v as any)}>
                    <SelectTrigger id="edit-persona-explicitness" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sfw">SFW</SelectItem>
                      <SelectItem value="suggestive">Suggestive</SelectItem>
                      <SelectItem value="explicit">Explicit</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enforced on every reply, independent of what a fan says. Above "SFW" requires fan 18+ acknowledgement. Can't exceed the platform-wide maximum.
                  </p>
                </div>
                {explicitnessCeiling === "explicit" && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Venice AI (mandatory)</Badge>
                    <p className="text-xs text-muted-foreground">
                      Explicit-tier chat always runs on Venice AI — the default AI Gateway is moderated and can't produce this tier of content.
                    </p>
                  </div>
                )}
                {explicitnessCeiling === "suggestive" && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label htmlFor="edit-persona-venice-opt-in">Use Venice AI for chat</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Optional at this tier. Off uses the default AI Gateway.</p>
                    </div>
                    <Switch id="edit-persona-venice-opt-in" checked={veniceChatOptIn} onCheckedChange={setVeniceChatOptIn} />
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="edit-persona-require-id-verification">Require ID verification</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional. When on, this persona becomes verified-supporters only — fans must complete identity verification before chatting or viewing this persona's feed, regardless of explicitness tier.
                    </p>
                    <p className="mt-1 text-[11px] text-brand-glow/90">
                      Platform-wide, ID verification is <span className="font-semibold">not mandatory</span> for supporters — you're choosing to restrict <span className="font-semibold">this persona's</span> audience. Unverified fans see a friendly prompt on the join / chat screens explaining they can verify in ~3 minutes to unlock it.
                    </p>
                  </div>
                  <Switch id="edit-persona-require-id-verification" checked={requireIdVerification} onCheckedChange={setRequireIdVerification} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="edit-persona-requires-verified-supporter">Verified supporters only</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      When on, this persona is only reachable by fans with an active Level 1 identity verification — or by anyone you personally invite via the <button type="button" className="text-brand-glow underline" onClick={() => setTab("invites")}>Invites</button> tab. If a supporter's verification later expires or is revoked, their invite-grant access is revoked automatically.
                    </p>
                  </div>
                  <Switch id="edit-persona-requires-verified-supporter" checked={requiresVerifiedSupporter} onCheckedChange={setRequiresVerifiedSupporter} />
                </div>
                <div>
                  <Label>Content categories</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Off means this persona won't draw on that theme from the reference content library. Doesn't override your boundary ceiling above — this only narrows within it.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {CONTENT_THEME_KEYS.map((key) => {
                      const allowed = contentThemeOverrides[key] !== false;
                      return (
                        <label key={key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs">
                          <span>{CONTENT_THEME_LABELS[key]}</span>
                          <Switch checked={allowed} onCheckedChange={(v) => setContentThemeOverrides((s) => ({ ...s, [key]: v }))} />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>Voice replies</Label>
                  {creator.elevenlabsVoiceId ? (
                    <div className="mt-1.5 space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm">Use your cloned voice</div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Off falls back to a generic preset voice for this persona's spoken replies.
                          </p>
                        </div>
                        <Switch checked={useClonedVoice} onCheckedChange={setUseClonedVoice} />
                      </div>
                      {useClonedVoice && (
                        <div className="space-y-3 border-t pt-3">
                          <VoiceSettingSlider label="Closeness to your voice" value={voiceSimilarityBoost} onChange={setVoiceSimilarityBoost} />
                          <VoiceSettingSlider label="Stability" value={voiceStability} onChange={setVoiceStability} />
                          <VoiceSettingSlider label="Style exaggeration" value={voiceStyle} onChange={setVoiceStyle} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Record and clone your voice first from this persona's onboarding page ("Voice samples" step) to enable spoken replies that sound like you.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "training" && (
          <section id="tab-panel-training" role="tabpanel" aria-labelledby="tab-training" className="space-y-4">
            <h2 className="sr-only">Training</h2>
            <p className="text-xs text-muted-foreground">
              These inputs shape how the persona sounds. They're merged into the AI system prompt at chat time and are only visible to you.
            </p>
            <div>
              <Label htmlFor="edit-persona-tone-examples">Tone &amp; voice examples</Label>
              <Textarea id="edit-persona-tone-examples" className="mt-1.5" rows={3} maxLength={4000} value={toneExamples} onChange={(e) => setToneExamples(e.target.value)}
                placeholder="Playful, teasing, uses emojis sparingly. Never sarcastic." />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="edit-persona-dos">Do's</Label>
                <Textarea id="edit-persona-dos" className="mt-1.5" rows={4} maxLength={4000} value={dos} onChange={(e) => setDos(e.target.value)}
                  placeholder={"- Address fans by name\n- Offer VIP upsells naturally"} />
              </div>
              <div>
                <Label htmlFor="edit-persona-donts">Don'ts</Label>
                <Textarea id="edit-persona-donts" className="mt-1.5" rows={4} maxLength={4000} value={donts} onChange={(e) => setDonts(e.target.value)}
                  placeholder={"- Never claim to be human\n- No political topics"} />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-persona-sample-phrasings">Sample phrasings</Label>
              <Textarea id="edit-persona-sample-phrasings" className="mt-1.5" rows={3} maxLength={4000} value={samplePhrasings} onChange={(e) => setSamplePhrasings(e.target.value)}
                placeholder={"“hey babe 💜 what are we getting into tonight?”"} />
            </div>
            <div>
              <Label htmlFor="edit-persona-voice-ref-url">Voice reference URL (optional)</Label>
              <Input id="edit-persona-voice-ref-url" className="mt-1.5" value={voiceRefUrl} onChange={(e) => setVoiceRefUrl(e.target.value)}
                placeholder="https://…/voice-sample.mp3" />
              <p className="mt-1 text-xs text-muted-foreground">Placeholder for future voice-clone training input.</p>
            </div>
          </section>
        )}

        {tab === "packs" && (
          <section id="tab-panel-packs" role="tabpanel" aria-labelledby="tab-packs" className="space-y-3">
            <h2 className="sr-only">Packs</h2>
            <p className="text-xs text-muted-foreground">
              Attach approved content packs to this persona. Choose how fans access each pack: included with a subscription, pay-per-view, or restricted (locked preview).
            </p>
            {packsLoading && <div className="text-sm text-muted-foreground">Loading packs…</div>}
            {!packsLoading && packs.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No content packs yet.{" "}
                <Link to="/studio/packs" className="text-brand-glow hover:underline">Create a pack</Link>
              </div>
            )}
            {!packsLoading && packs.length > 0 && (
              <ul className="space-y-2">
                {packs.map((p) => {
                  const row = attachRows.find((r) => r.pack_id === p.id && r.persona_id === persona.id);
                  const attached = !!row;
                  const permission = row?.permission_type ?? "included";
                  const canAttach = p.status === "approved";
                  return (
                    <li key={p.id} className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{p.name}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">{p.pack_type}</Badge>
                            <Badge variant={p.status === "approved" ? "default" : "outline"} className="text-[10px] uppercase">{p.status.replace("_", " ")}</Badge>
                          </div>
                          {p.description && (<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>)}
                          {!canAttach && !attached && (<p className="mt-1 text-[11px] text-muted-foreground">Only approved packs can be attached.</p>)}
                        </div>
                        <Switch checked={attached} disabled={packBusy === p.id || (!canAttach && !attached)} onCheckedChange={() => togglePack(p.id, attached, permission)} aria-label={`${attached ? "Detach" : "Attach"} pack ${p.name}`} />
                      </div>
                      {attached && (
                        <div className="mt-3 flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground" htmlFor={`pack-permission-${p.id}`}>Access</Label>
                          <Select value={permission} onValueChange={(v) => changePermission(p.id, v)} disabled={packBusy === p.id}>
                            <SelectTrigger id={`pack-permission-${p.id}`} className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="included">Included</SelectItem>
                              <SelectItem value="ppv">Pay-per-view</SelectItem>
                              <SelectItem value="restricted">Restricted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === "twin" && (
          <section id="tab-panel-twin" role="tabpanel" aria-labelledby="tab-twin" className="space-y-3">
            <h2 className="sr-only">Twin</h2>
            <p className="text-xs text-muted-foreground">
              Choose which identity, voice, and style references from your <Link to="/studio/twin" className="text-brand-glow hover:underline">Digital Twin Profile</Link> this persona uses.
            </p>
            <fieldset className="rounded-lg border border-border bg-surface p-3 text-xs">
              <legend className="px-1 text-sm font-semibold">Reference scope</legend>
              <div className="space-y-2">
                {([
                  { v: "all", label: "Use all approved twin references", hint: "Broadest — inherits every approved identity, voice, and style ref." },
                  { v: "selected", label: "Use only selected references", hint: "Pick specific refs below. Great for a tightly styled persona." },
                  { v: "none", label: "Do not use twin references", hint: "The persona won't draw from your digital twin." },
                ] as const).map((opt) => (
                  <label key={opt.v} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2">
                    <input type="radio" name="twin-mode" className="mt-1" checked={twinLinkMode === opt.v} onChange={() => setTwinLinkMode(opt.v)} />
                    <span>
                      <span className="block text-sm font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {twinLinkMode === "selected" && (
              twinRefs === null ? (<div className="text-sm text-muted-foreground">Loading references…</div>)
              : twinRefs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No twin references yet. <Link to="/studio/twin" className="text-brand-glow hover:underline">Upload some</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {(["identity_ref", "voice_ref", "style_ref"] as const).map((k) => {
                    const group = twinRefs.filter((r: any) => r.kind === k);
                    if (!group.length) return null;
                    return (
                      <div key={k}>
                        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {k === "identity_ref" ? "Identity" : k === "voice_ref" ? "Voice" : "Style"}
                        </h3>
                        <ul className="space-y-1">
                          {group.map((r: any) => {
                            const on = linkedRefIds.includes(r.id);
                            const approved = r.review_status === "approved";
                            return (
                              <li key={r.id}>
                                <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs">
                                  <span className="min-w-0 flex-1 truncate">
                                    <span className="font-medium">{r.slot_label || "Untitled"}</span>{" "}
                                    <span className={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${approved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-border bg-surface text-muted-foreground"}`}>{r.review_status ?? "draft"}</span>
                                  </span>
                                  <Switch checked={on} onCheckedChange={(v) => setLinkedRefIds((s) => v ? [...s, r.id] : s.filter((i) => i !== r.id))} aria-label={`Include reference ${r.slot_label || "Untitled"}`} />
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )
            )}
            <p className="text-[11px] text-muted-foreground">
              Looking for HeyGen avatar/voice IDs? They're in the persona <button type="button" className="text-brand-glow underline" onClick={() => setTab("basics")}>Basics</button> tab under <span className="font-medium">External model IDs</span>.
            </p>
          </section>
        )}

        {tab === "invites" && (
          <section id="tab-panel-invites" role="tabpanel" aria-labelledby="tab-invites" className="space-y-3">
            <h2 className="sr-only">Invites</h2>
            <p className="text-xs text-muted-foreground">
              Share this persona privately with specific people you trust, without listing it publicly. Only takes effect once this persona's{" "}
              <button type="button" className="text-brand-glow underline" onClick={() => setTab("basics")}>visibility</button> is set to "Invite only".
            </p>
            {visibility !== "invite_only" && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                Set visibility to "Invite only" in the Basics tab to make invite links functional.
              </div>
            )}
            <Button type="button" size="sm" onClick={generateInvite} disabled={inviteBusy}>
              {inviteBusy ? "Creating…" : "Generate invite link"}
            </Button>
            {invitesLoading || invites === null ? (
              <div className="text-sm text-muted-foreground">Loading invites…</div>
            ) : invites.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No invites yet. Generate one above and send the link to someone you trust.
              </div>
            ) : (
              <ul className="space-y-2">
                {invites.map((inv) => {
                  const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${inv.token}` : `/invite/${inv.token}`;
                  const tone = inv.status === "accepted" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : inv.status === "revoked" ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                    : "border-border bg-surface text-muted-foreground";
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${tone}`}>{inv.status}</span>
                          <span className="text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</span>
                        </div>
                        {inv.status === "pending" && (
                          <button
                            type="button"
                            className="mt-1 block truncate text-left text-brand-glow underline"
                            onClick={() => { navigator.clipboard.writeText(url); toast.success("Invite link copied"); }}
                            title={url}
                            aria-label={`Copy invite link ${url}`}
                          >{url}</button>
                        )}
                      </div>
                      {inv.status !== "revoked" && (
                        <Button size="sm" variant="ghost" disabled={inviteBusy} onClick={() => handleRevokeInvite(inv.id)}>Revoke</Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === "saved" && (
          <section id="tab-panel-saved" role="tabpanel" aria-labelledby="tab-saved" className="space-y-3">
            <h2 className="sr-only">Saved replies</h2>
            <p className="text-xs text-muted-foreground">
              Reusable replies for this persona. Available in the Real Me inbox composer. Mark items as “Few-shot examples” to also feed them into the AI persona's tone at chat time.
            </p>
            <div className="rounded-lg border border-border bg-surface p-3">
              <h3 className="mb-1 text-sm font-semibold">New saved reply</h3>
              <Label htmlFor="new-saved-label" className="sr-only">Label</Label>
              <Input id="new-saved-label" placeholder="Label (e.g. Welcome DM)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} />
              <Label htmlFor="new-saved-body" className="sr-only">Body</Label>
              <Textarea id="new-saved-body" className="mt-2" rows={3} maxLength={4000} placeholder="Body — the reply text" value={newBody} onChange={(e) => setNewBody(e.target.value)} />
              <label className="mt-2 flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs">
                <span>Use as few-shot example for AI persona</span>
                <Switch checked={newFewShot} onCheckedChange={setNewFewShot} />
              </label>
              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" onClick={addSaved} disabled={!newLabel.trim() || savedBusy === "new"}>
                  <Plus className="mr-1 size-3" aria-hidden /> Add
                </Button>
              </div>
            </div>
            {savedLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!savedLoading && savedItems && savedItems.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No saved replies yet.
              </div>
            )}
            {!savedLoading && savedItems && savedItems.length > 0 && (
              <ul className="space-y-2">
                {savedItems.map((s: any) => (
                  <li key={s.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{s.label}</div>
                        {s.body && <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{s.body}</div>}
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeSaved(s.id)} disabled={savedBusy === s.id} aria-label={`Delete saved reply ${s.label}`}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                    <label className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Few-shot example for AI</span>
                      <Switch checked={!!s.use_as_few_shot} onCheckedChange={(v) => toggleFewShot(s, v)} disabled={savedBusy === s.id} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div
          role="region"
          aria-label="Form actions"
          className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70"
        >
          <Button asChild variant="ghost" disabled={busy}>
            <Link to="/studio/personas">Back to personas</Link>
          </Button>
          <Button type="submit" disabled={busy} className="min-h-11">
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </main>
  );
}