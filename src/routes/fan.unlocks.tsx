import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/session";
import { listMyUnlocks, listMySubscriptionContent, getFanAssetUrl } from "@/lib/fan-feed.functions";
import { History, Image as ImageIcon, Video, Music, FileText, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/fan/unlocks")({
  component: UnlocksPage,
  head: () => ({
    meta: [
      { title: "Your unlocks — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Unlock = Awaited<ReturnType<typeof listMyUnlocks>>["unlocks"][number];
type SubItem = Awaited<ReturnType<typeof listMySubscriptionContent>>["items"][number];

function typeIcon(t: string) {
  if (t === "image") return ImageIcon;
  if (t === "video") return Video;
  if (t === "audio") return Music;
  return FileText;
}

function UnlocksPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(listMyUnlocks);
  const loadSubs = useServerFn(listMySubscriptionContent);
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [res, subRes] = await Promise.all([load({ data: {} }), loadSubs({})]);
        setUnlocks(res.unlocks);
        setSubItems(subRes.items);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load your unlocks");
      } finally {
        setReady(true);
      }
    })();
  }, [user, load, loadSubs]);

  if (loading || !ready) {
    return <AppShell><div className="py-20 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const totalCents = unlocks.reduce((s, u) => s + u.amountCents, 0);

  return (
    <AppShell>
      <Link to="/fan" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to dashboard
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <History className="size-3.5" /> Your unlocks
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">Unlocked content</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you've unlocked stays here — revisit it any time.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-2 text-right">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Total spent</div>
          <div className="font-display text-xl font-bold">${(totalCents / 100).toFixed(2)}</div>
        </div>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Purchased ({unlocks.length})
      </div>
      {unlocks.length === 0 ? (
        <div className="mb-8 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
          Nothing unlocked yet. Pay-per-view items you unlock will show up here.
        </div>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {unlocks.map((u) => (
            <UnlockCard key={u.transactionId} unlock={u} />
          ))}
        </div>
      )}

      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Included with your subscriptions ({subItems.length})
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Stays here while your subscription is active — unlike purchases above, this isn't a permanent unlock.
      </p>
      {subItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
          No subscriber-included content available right now.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subItems.map((it, i) => (
            <SubscriptionContentCard key={`${it.asset.id}-${i}`} item={it} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function UnlockCard({ unlock }: { unlock: Unlock }) {
  const [url, setUrl] = useState<string | null>(null);
  const sign = useServerFn(getFanAssetUrl);
  const Icon = typeIcon(unlock.asset?.asset_type ?? "text");

  useEffect(() => {
    if (!unlock.asset) return;
    let alive = true;
    sign({ data: { assetId: unlock.asset.id } })
      .then((r) => { if (alive) setUrl(r.url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [unlock.asset, sign]);

  if (!unlock.asset) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square w-full bg-background/40">
        {url && unlock.asset.asset_type === "image" && (
          <img src={url} alt={unlock.asset.title} className="h-full w-full object-cover" loading="lazy" />
        )}
        {url && unlock.asset.asset_type === "video" && (
          <video src={url} className="h-full w-full object-cover" controls playsInline preload="metadata" />
        )}
        {url && unlock.asset.asset_type === "audio" && (
          <div className="flex h-full w-full items-center justify-center p-3">
            <audio src={url} controls className="w-full" />
          </div>
        )}
        {!url && (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Icon className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="line-clamp-1 text-sm font-medium">{unlock.asset.title}</div>
        {unlock.creator && (
          <Link to="/creators/$handle" params={{ handle: unlock.creator.handle }} className="text-xs text-brand-glow hover:underline">
            @{unlock.creator.handle}
          </Link>
        )}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>${(unlock.amountCents / 100).toFixed(2)} · {new Date(unlock.unlockedAt).toLocaleDateString()}</span>
          {unlock.status === "stub" && (
            <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-[9px] text-amber-300">Demo</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function SubscriptionContentCard({ item }: { item: SubItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const sign = useServerFn(getFanAssetUrl);
  const Icon = typeIcon(item.asset.asset_type);

  useEffect(() => {
    let alive = true;
    sign({ data: { assetId: item.asset.id } })
      .then((r) => { if (alive) setUrl(r.url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [item.asset.id, sign]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square w-full bg-background/40">
        {url && item.asset.asset_type === "image" && (
          <img src={url} alt={item.asset.title} className="h-full w-full object-cover" loading="lazy" />
        )}
        {url && item.asset.asset_type === "video" && (
          <video src={url} className="h-full w-full object-cover" controls playsInline preload="metadata" />
        )}
        {url && item.asset.asset_type === "audio" && (
          <div className="flex h-full w-full items-center justify-center p-3">
            <audio src={url} controls className="w-full" />
          </div>
        )}
        {!url && (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Icon className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="line-clamp-1 text-sm font-medium">{item.asset.title}</div>
        {item.creator && (
          <Link to="/creators/$handle" params={{ handle: item.creator.handle }} className="text-xs text-brand-glow hover:underline">
            @{item.creator.handle}
          </Link>
        )}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{item.persona?.display_name ?? "Subscriber content"}</span>
          <Badge variant="outline" className="border-brand/40 bg-brand/10 text-[9px] text-brand-glow">{item.tier}</Badge>
        </div>
      </div>
    </div>
  );
}
