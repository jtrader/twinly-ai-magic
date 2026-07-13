import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/session";
import { getMyVerificationLevel } from "@/lib/identity-verification.functions";
import {
  listAvailableAgencies,
  getMyAgencyConnection,
  requestAgencyLinkAsCreator,
  cancelMyAgencyRequest,
  CREATOR_AGENCY_AGREEMENT_VERSION,
} from "@/lib/agency-connect.functions";
import { VALID_AGENCY_SCOPES } from "@/lib/agency-consent.functions";

export const Route = createFileRoute("/studio/agency")({
  component: StudioAgencyPage,
  head: () => ({
    meta: [
      { title: "Agency management — Creator studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  manage_personas: { label: "Manage personas", description: "Create, edit, publish or reorder your personas." },
  manage_content: { label: "Manage content vault", description: "Upload and organise vault assets and content packs." },
  reply_to_supporters: { label: "Reply to supporters", description: "Answer supporter messages on your behalf." },
  manage_pricing: { label: "Manage pricing", description: "Adjust subscription tier prices and paywall settings." },
  manage_payouts: { label: "View payouts", description: "See earnings dashboards. Does NOT change payout destination." },
};

function StudioAgencyPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();

  const loadAgencies = useServerFn(listAvailableAgencies);
  const loadConnection = useServerFn(getMyAgencyConnection);
  const loadLevel = useServerFn(getMyVerificationLevel);
  const submitRequest = useServerFn(requestAgencyLinkAsCreator);
  const cancelRequest = useServerFn(cancelMyAgencyRequest);

  const [agencies, setAgencies] = useState<{ id: string; name: string }[] | null>(null);
  const [connection, setConnection] = useState<any>(null);
  const [level, setLevel] = useState<{ level: number; isAdult: boolean } | null>(null);
  const [ready, setReady] = useState(false);

  const [agencyId, setAgencyId] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [note, setNote] = useState("");
  const [scopes, setScopes] = useState<string[]>(["manage_personas", "manage_content"]);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => { if (user?.email) setContactEmail(user.email); }, [user?.email]);

  async function refresh() {
    try {
      const [ag, conn, lv] = await Promise.all([
        loadAgencies(),
        loadConnection(),
        loadLevel().catch(() => ({ level: 0, isAdult: false })),
      ]);
      setAgencies(ag.agencies);
      setConnection(conn);
      setLevel({ level: (lv as any)?.level ?? 0, isAdult: !!(lv as any)?.isAdult });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load agency data");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  const hasL1L2 = (level?.level ?? 0) >= 2;

  const activeLink = connection?.link ?? null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyId) { toast.error("Choose an agency."); return; }
    if (!agreed) { toast.error("You must accept the agreement to continue."); return; }
    if (scopes.length === 0) { toast.error("Select at least one delegated scope."); return; }
    setSubmitting(true);
    try {
      await submitRequest({
        data: {
          agencyId,
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          agreedScopes: scopes,
          agreementVersion: CREATOR_AGENCY_AGREEMENT_VERSION,
          note: note.trim() || null,
        },
      });
      toast.success("Request sent — awaiting agency approval.");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not submit request");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel(agencyIdToCancel: string) {
    if (!confirm("Cancel this pending agency request?")) return;
    try {
      await cancelRequest({ data: { agencyId: agencyIdToCancel } });
      toast.success("Request cancelled");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not cancel");
    }
  }

  const toggleScope = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  if (loading || !user || !ready) {
    return <AppShell><div className="py-20 text-center text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
        <h1 className="mt-1 font-display text-3xl font-bold flex items-center gap-2">
          <Building2 className="size-7 text-brand-glow" /> Agency management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Delegate account-management tasks to a verified Twinly agency. You keep full control — you can revoke access at any time, and identity verification, consent, and payout destination stay non-delegable.
        </p>
      </div>

      {activeLink ? <ExistingLinkPanel link={activeLink} onCancel={onCancel} /> : (
        !hasL1L2 ? <VerificationRequiredPanel currentLevel={level?.level ?? 0} /> : (
          <ConnectForm
            agencies={agencies ?? []}
            agencyId={agencyId} setAgencyId={setAgencyId}
            contactEmail={contactEmail} setContactEmail={setContactEmail}
            contactPhone={contactPhone} setContactPhone={setContactPhone}
            note={note} setNote={setNote}
            scopes={scopes} toggleScope={toggleScope}
            agreed={agreed} setAgreed={setAgreed}
            submitting={submitting} onSubmit={onSubmit}
          />
        )
      )}
    </AppShell>
  );
}

function VerificationRequiredPanel({ currentLevel }: { currentLevel: number }) {
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="size-5 text-amber-300 mt-0.5" />
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold">Verification required</div>
          <p className="mt-1 text-sm text-muted-foreground">
            You need Level 1 (identity + age) and Level 2 (monetizing creator) verification before you can appoint an agency to manage your account. Your current level is <b>{currentLevel}</b>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/studio/twin"><Button size="sm">Continue verification</Button></Link>
            <Link to="/studio"><Button size="sm" variant="outline">Back to studio</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExistingLinkPanel({ link, onCancel }: { link: any; onCancel: (agencyId: string) => void }) {
  const status = link.status as string;
  const badge =
    status === "active" ? { icon: <CheckCircle2 className="size-4 text-emerald-300" />, label: "Active", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" }
    : status === "pending" ? { icon: <Clock className="size-4 text-amber-300" />, label: "Awaiting agency approval", tone: "border-amber-400/30 bg-amber-400/10 text-amber-300" }
    : status === "suspended" ? { icon: <AlertTriangle className="size-4 text-rose-300" />, label: "Suspended", tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" }
    : { icon: <XCircle className="size-4" />, label: status, tone: "border-border bg-surface text-muted-foreground" };
  const scopes: string[] = Array.isArray(link.requested_scopes) ? link.requested_scopes : [];
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Connected agency</div>
          <div className="mt-1 font-display text-xl font-bold">{link.agency?.name ?? "Unknown agency"}</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-widest ${badge.tone}`}>
          {badge.icon}{badge.label}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Contact email</dt><dd>{link.contact_email ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Contact phone</dt><dd>{link.contact_phone ?? "—"}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Delegated scopes</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {scopes.length === 0 && <span className="text-muted-foreground">None</span>}
            {scopes.map((s) => (
              <span key={s} className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs">{SCOPE_LABELS[s]?.label ?? s}</span>
            ))}
          </dd>
        </div>
        {link.agreement_version && (
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            Agreement <code>{link.agreement_version}</code> accepted {link.agreement_accepted_at ? new Date(link.agreement_accepted_at).toLocaleString() : ""}
          </div>
        )}
      </dl>
      {status === "pending" && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onCancel(link.agency_id)}>Cancel request</Button>
        </div>
      )}
      {status === "active" && (
        <p className="mt-5 text-xs text-muted-foreground">
          Need to end this relationship? Revoke it from your consent settings — the agency will lose access immediately.
        </p>
      )}
    </div>
  );
}

function ConnectForm(props: {
  agencies: { id: string; name: string }[];
  agencyId: string; setAgencyId: (v: string) => void;
  contactEmail: string; setContactEmail: (v: string) => void;
  contactPhone: string; setContactPhone: (v: string) => void;
  note: string; setNote: (v: string) => void;
  scopes: string[]; toggleScope: (s: string) => void;
  agreed: boolean; setAgreed: (v: boolean) => void;
  submitting: boolean; onSubmit: (e: React.FormEvent) => void;
}) {
  const { agencies, agencyId, setAgencyId, contactEmail, setContactEmail, contactPhone, setContactPhone, note, setNote, scopes, toggleScope, agreed, setAgreed, submitting, onSubmit } = props;
  const selectedAgency = useMemo(() => agencies.find((a) => a.id === agencyId), [agencies, agencyId]);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">1. Choose an agency</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only agencies with active Twinly Level 2 verification appear here.</p>
        {agencies.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No agencies are currently onboarded. Please check back later.
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {agencies.map((a) => (
              <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${agencyId === a.id ? "border-brand-glow bg-surface-elevated" : "border-border hover:border-brand/40"}`}>
                <input type="radio" name="agency" className="accent-brand-glow" checked={agencyId === a.id} onChange={() => setAgencyId(a.id)} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">Agency ID: {a.id.slice(0, 8)}…</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">2. Delegated scopes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant only what you want the agency to do on your behalf. Payout-destination changes and withdrawals are heightened-risk and require a separate on-platform confirmation — they are never granted here.
        </p>
        <div className="mt-4 space-y-2">
          {VALID_AGENCY_SCOPES.map((s) => (
            <label key={s} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:border-brand/40">
              <Checkbox checked={scopes.includes(s)} onCheckedChange={() => toggleScope(s)} className="mt-0.5" />
              <div>
                <div className="font-semibold text-sm">{SCOPE_LABELS[s]?.label ?? s}</div>
                <div className="text-xs text-muted-foreground">{SCOPE_LABELS[s]?.description}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">3. Your contact details</h2>
        <p className="mt-1 text-sm text-muted-foreground">The agency will use these to reach you about onboarding and management.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact_email">Email</Label>
            <Input id="contact_email" type="email" required maxLength={255} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contact_phone">Phone</Label>
            <Input id="contact_phone" type="tel" required minLength={5} maxLength={40} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 555 123 4567" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="note">Note to the agency (optional)</Label>
            <Textarea id="note" maxLength={1000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the agency should know before approving…" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold">4. Agreement</h2>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-elevated p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">Creator–Agency Account Management Agreement (v1)</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Twinly is not a party to this agreement; the platform enforces only the permissions technically supported by the AgencyCreatorAssignment.</li>
            <li>You (the Client) must personally complete all identity, age, likeness, voice and biometric verification steps. The Agency may not perform them for you.</li>
            <li>The Agency will act only within the Delegated Scope you selected above and within Twinly Policies.</li>
            <li>You may revoke the Agency's access at any time; this right is unwaivable and takes effect immediately at the platform level.</li>
            <li>Payout-destination changes and withdrawals require a separate, distinctly-flagged consent on Twinly — this form does not grant them.</li>
            <li>Content ownership stays with you (or as set by Twinly's platform terms). The Agency has no independent right to keep content published after revocation.</li>
            <li>Automatic platform suspension can occur if your Level 1 verification lapses, if the Agency's Level 2 verification lapses, or if the Agency's Twinly billing lapses.</li>
          </ul>
          <p className="mt-3">
            The full text (fees, term, non-solicitation, indemnity, dispute-resolution etc.) is in the Creator–Agency Account Management Agreement (v1). Contact <a className="text-brand-glow underline" href="mailto:support@lovekey.com.au?subject=Creator-Agency%20Agreement%20v1%20request">Twinly support</a> for a signed copy.
          </p>
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
          <span>
            I have read and accept the Creator–Agency Account Management Agreement (v1) and confirm the delegated scopes and contact details above are correct.
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {selectedAgency ? <>Sending request to <b>{selectedAgency.name}</b>.</> : "Select an agency to continue."}
        </div>
        <Button type="submit" disabled={submitting || !selectedAgency || !agreed}>
          {submitting ? "Sending…" : "Send request to agency"}
        </Button>
      </div>
    </form>
  );
}