import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { User as UserIcon, Pencil } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useUserRoles } from "@/lib/session";
import { listMyBlocks, unblockUserId } from "@/lib/blocks.functions";
import { getMyNotificationPreferences, updateMyNotificationPreferences } from "@/lib/notifications.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useAvatarUrl } from "@/lib/useAvatarUrl";

export const Route = createFileRoute("/account/")({ component: AccountPage });

function AccountPage() {
  const { user, loading } = useSession();
  const roles = useUserRoles(user?.id);
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      {user && <ProfileSection />}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Roles</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.length === 0
            ? <span className="text-sm text-muted-foreground">—</span>
            : roles.map((r) => (
                <span key={r} className="rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-semibold uppercase tracking-widest">{r}</span>
              ))}
        </div>
      </div>
      {user && <NotificationPreferencesSection />}
      {user && <BlockedUsersSection />}
      <div className="mt-6">
        <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>Sign out</Button>
      </div>
    </AppShell>
  );
}

type Prefs = Awaited<ReturnType<typeof getMyNotificationPreferences>>["preferences"];

function ProfileSection() {
  const load = useServerFn(getMyProfile);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMyProfile>>["profile"]>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const avatarUrl = useAvatarUrl(profile?.avatar_url ?? null);

  useEffect(() => {
    load().then((r) => setProfile(r.profile)).finally(() => setLoadingProfile(false));
  }, [load]);

  if (loadingProfile) return null;
  const complete = !!profile?.profile_completed_at;

  // Compute what's still missing so the resume CTA shows an accurate step.
  const steps = [
    { key: "avatar", label: "Profile picture", done: !!profile?.avatar_url },
    { key: "name", label: "Display name", done: !!(profile?.display_name && profile.display_name.trim().length >= 2) },
    { key: "bio", label: "Bio & country (optional)", done: !!(profile?.bio || profile?.country) },
    { key: "payment", label: "Payment method (optional)", done: complete },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.findIndex((s) => !s.done) + 1;
  const percent = complete ? 100 : Math.round((doneCount / steps.length) * 100);

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated">
          {avatarUrl
            ? <img src={avatarUrl} alt="Your avatar" className="size-full object-cover" />
            : <UserIcon className="size-7 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Profile</div>
            {!complete && (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-brand-glow">
                Setup needed
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-display text-lg font-semibold">
            {profile?.display_name || "No display name yet"}
          </div>
          {profile?.full_name && (
            <div className="text-xs text-muted-foreground">Real name: {profile.full_name}</div>
          )}
          {profile?.bio && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{profile.bio}</p>
          )}
          {profile?.country && (
            <div className="mt-1 text-xs text-muted-foreground">{profile.country}</div>
          )}
        </div>
        <Button asChild size="sm" variant={complete ? "outline" : "default"}>
          <Link to="/account/setup"><Pencil className="mr-2 size-3.5" />{complete ? "Edit" : "Complete profile"}</Link>
        </Button>
      </div>
      {!complete && (
        <div className="mt-4 rounded-lg border border-brand/20 bg-brand/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-brand-glow">
              Profile setup · {doneCount} of {steps.length} done
            </div>
            <Button asChild size="sm" variant="default">
              <Link
                to="/account/setup"
                search={{ step: nextStep > 0 ? nextStep : 1 } as any}
              >
                Resume setup →
              </Link>
            </Button>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand via-brand-glow to-ai transition-all"
              style={{ width: `${percent}%` }}
              aria-hidden
            />
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-[11px]">
                <span className={
                  "inline-flex size-4 items-center justify-center rounded-full border text-[9px] font-bold " +
                  (s.done ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-border bg-surface text-muted-foreground")
                }>
                  {s.done ? "✓" : ""}
                </span>
                <span className={s.done ? "text-muted-foreground line-through" : "text-foreground"}>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useServerFn(getMyNotificationPreferences);
  const update = useServerFn(updateMyNotificationPreferences);

  useEffect(() => {
    load().then((r) => setPrefs(r.preferences)).catch(() => {});
  }, [load]);

  async function toggle(field: "inAppEnabled" | "newContent" | "personaReply" | "escalationUpdates", column: keyof Prefs, value: boolean) {
    setPrefs((p) => p ? { ...p, [column]: value } as Prefs : p);
    setBusy(true);
    try {
      await update({ data: { [field]: value } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save preference");
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) return null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notifications</div>
      <div className="mt-3 space-y-3">
        <label className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">In-app notifications</div>
            <div className="text-xs text-muted-foreground">Turn off to silence everything below.</div>
          </div>
          <Switch checked={prefs.in_app_enabled} disabled={busy} onCheckedChange={(v) => toggle("inAppEnabled", "in_app_enabled", v)} />
        </label>
        <label className="flex items-center justify-between">
          <div className="text-sm">New content from creators you follow</div>
          <Switch checked={prefs.new_content} disabled={busy || !prefs.in_app_enabled} onCheckedChange={(v) => toggle("newContent", "new_content", v)} />
        </label>
        <label className="flex items-center justify-between">
          <div className="text-sm">Replies from a Real Me creator</div>
          <Switch checked={prefs.persona_reply} disabled={busy || !prefs.in_app_enabled} onCheckedChange={(v) => toggle("personaReply", "persona_reply", v)} />
        </label>
        <label className="flex items-center justify-between">
          <div className="text-sm">Real Me request updates</div>
          <Switch checked={prefs.escalation_updates} disabled={busy || !prefs.in_app_enabled} onCheckedChange={(v) => toggle("escalationUpdates", "escalation_updates", v)} />
        </label>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Email and push aren't wired up yet — in-app is the only channel that actually delivers right now.</p>
    </div>
  );
}

function BlockedUsersSection() {
  const [blocks, setBlocks] = useState<Awaited<ReturnType<typeof listMyBlocks>>["blocks"]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useServerFn(listMyBlocks);
  const unblock = useServerFn(unblockUserId);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await load();
      setBlocks(res.blocks);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load blocked users");
    } finally {
      setLoadingList(false);
    }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  async function doUnblock(userId: string) {
    setBusyId(userId);
    try {
      await unblock({ data: { userId } });
      setBlocks((s) => s.filter((b) => b.userId !== userId));
      toast.success("Unblocked");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not unblock");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Blocked users</div>
      {loadingList && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
      {!loadingList && blocks.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">You haven't blocked anyone.</p>
      )}
      {!loadingList && blocks.length > 0 && (
        <ul className="mt-2 space-y-2">
          {blocks.map((b) => (
            <li key={b.userId} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm">
              <span>{b.profile?.display_name ?? "Unknown user"}</span>
              <Button size="sm" variant="ghost" disabled={busyId === b.userId} onClick={() => doUnblock(b.userId)}>
                {busyId === b.userId ? "…" : "Unblock"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}