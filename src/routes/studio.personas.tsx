import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { useAvatarUrl } from "@/lib/useAvatarUrl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { listMyPersonas } from "@/lib/onboarding.functions";
import {
  setPersonaVisibility, deletePersona, reorderPersonas,
} from "@/lib/persona-studio.functions";
import { VISIBILITY_LABEL, type Persona, type Visibility } from "@/components/twinly/persona-form-shared";

export const Route = createFileRoute("/studio/personas")({
  component: PersonaStudioPage,
  head: () => ({
    meta: [
      { title: "Personas — Creator Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PersonaCardAvatar({ path, name }: { path: string | null; name: string }) {
  const src = useAvatarUrl(path);
  return (
    <div className="size-12 shrink-0 overflow-hidden rounded-full border border-border bg-surface-elevated">
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
          {(name || "?").slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function PersonaStudioPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [creator, setCreator] = useState<{ id: string; handle: string; verification_status?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [deleting, setDeleting] = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useServerFn(listMyPersonas);
  const setVis = useServerFn(setPersonaVisibility);
  const reorder = useServerFn(reorderPersonas);
  const remove = useServerFn(deletePersona);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    const res = await load();
    if (!res.creator) { navigate({ to: "/onboarding" }); return; }
    setCreator({
      id: res.creator.id,
      handle: res.creator.handle,
      verification_status: (res.creator as any).verification_status,
    });
    setPersonas(res.personas);
    setReady(true);
  }, [load, navigate]);

  useEffect(() => { if (user) refresh().catch(() => setReady(true)); }, [user, refresh]);

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= personas.length) return;
    const next = personas.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setPersonas(next);
    try { await reorder({ data: { order: next.map((p, i) => ({ id: p.id, sortOrder: i })) } }); }
    catch (e: any) { toast.error(e.message ?? "Reorder failed"); refresh(); }
  }

  async function changeVisibility(persona: Persona, visibility: Visibility) {
    setPersonas((s) => s.map((p) => (p.id === persona.id ? { ...p, visibility } : p)));
    try {
      await setVis({ data: { personaId: persona.id, visibility } });
      toast.success(`Set to ${VISIBILITY_LABEL[visibility].toLowerCase()}`);
    } catch (e: any) { toast.error(e.message ?? "Could not update visibility"); refresh(); }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const snapshot = personas;
    const target = deleting;
    setPersonas((s) => s.filter((p) => p.id !== target.id));
    setBusy(true);
    try { await remove({ data: { personaId: target.id } }); toast.success("Persona deleted"); setDeleting(null); }
    catch (e: any) { setPersonas(snapshot); toast.error(e.message ?? "Could not delete persona"); }
    finally { setBusy(false); }
  }

  if (loading || !ready) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Persona studio</div>
            <h1 className="mt-1 font-display text-3xl font-bold">Your personas</h1>
            {creator && (
              <p className="mt-1 text-sm text-muted-foreground">
                Public page:{" "}
                <Link to="/creators/$handle" params={{ handle: creator.handle }} className="text-brand-glow hover:underline">
                  /creators/{creator.handle}
                </Link>
              </p>
            )}
          </div>
          <Button asChild className="min-h-11">
            <Link to="/studio/personas/new">
              <Plus className="mr-1 size-4" aria-hidden /> New persona
            </Link>
          </Button>
        </div>

        {creator && creator.verification_status !== "verified" && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
            Your identity isn't verified yet — you can build and edit personas, but publishing them (Public / Subscribers / VIP) is blocked until verification is complete.
          </div>
        )}

        <div className="mt-6 space-y-3">
          {personas.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-sm text-muted-foreground">No personas yet.</p>
            </div>
          )}
          {personas.map((p, i) => (
            <div key={p.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    className="rounded-md border border-border p-1 text-muted-foreground hover:bg-surface-elevated disabled:opacity-40"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${p.display_name} up`}
                  ><ArrowUp className="size-3.5" aria-hidden /></button>
                  <button
                    className="rounded-md border border-border p-1 text-muted-foreground hover:bg-surface-elevated disabled:opacity-40"
                    disabled={i === personas.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${p.display_name} down`}
                  ><ArrowDown className="size-3.5" aria-hidden /></button>
                </div>
                <PersonaCardAvatar path={(p as any).avatar_url ?? null} name={p.display_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">{p.display_name}</span>
                    <PersonaBadge kind={p.kind} />
                    {p.visibility !== "public" && (
                      <Badge variant="outline" className="text-xs">{VISIBILITY_LABEL[p.visibility]}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {(p as any).price_cents ? `$${((p as any).price_cents / 100).toFixed(2)}` : "Included"}
                    </Badge>
                    {p.kind === "ai" && !((p as any).boundary_rules?.hard_limits ?? []).length && (
                      <Badge variant="outline" className="border-amber-400/40 text-[10px] text-amber-300">
                        No boundary rules — can't publish
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.disclosure_label}</p>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={p.visibility}
                      onValueChange={(v) => changeVisibility(p, v as Visibility)}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs" aria-label={`Visibility for ${p.display_name}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
                          <SelectItem key={v} value={v}>{VISIBILITY_LABEL[v]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/studio/personas/$personaId/edit" params={{ personaId: p.id }}>
                        <Pencil className="mr-1 size-3.5" aria-hidden /> Edit
                      </Link>
                    </Button>
                    {p.visibility === "public" ? (
                      <Button size="sm" variant="ghost" onClick={() => changeVisibility(p, "hidden")}>
                        <EyeOff className="mr-1 size-3.5" aria-hidden /> Hide
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => changeVisibility(p, "public")}>
                        <Eye className="mr-1 size-3.5" aria-hidden /> Publish
                      </Button>
                    )}
                    {!(p as any).is_default_seed && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(p)}>
                        <Trash2 className="mr-1 size-3.5" aria-hidden /> Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this persona?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleting?.display_name}</strong> and its chat history is retained for audit. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmDelete}>
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}