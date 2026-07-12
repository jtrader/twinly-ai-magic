import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  getComposerOptions,
  listComments,
  toggleLike,
} from "@/lib/posts.functions";
import { Heart, MessageCircle, Image as ImageIcon, X, Trash2, Package, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PollCard } from "@/components/twinly/PollCard";

type Post = {
  id: string;
  body: string;
  imageUrl: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAt: string;
  creator: { id: string; handle: string; stageName: string; avatarUrl: string | null; verified: boolean };
  linkedPack: { id: string; name: string; slug: string } | null;
  linkedPersona: { id: string; slug: string; displayName: string; kind: string } | null;
  linkedPoll: any | null;
};

export function PostFeed({
  posts,
  emptyText = "No posts yet.",
  onChanged,
}: {
  posts: Post[];
  emptyText?: string;
  onChanged?: () => void;
}) {
  const { user } = useSession();
  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} viewerId={user?.id ?? null} onChanged={onChanged} />
      ))}
    </div>
  );
}

function PostCard({
  post,
  viewerId,
  onChanged,
}: {
  post: Post;
  viewerId: string | null;
  onChanged?: () => void;
}) {
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [showComments, setShowComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const like = useServerFn(toggleLike);
  const removePost = useServerFn(deletePost);

  const canDelete = !!viewerId; // RLS enforces; UI shows for signed-in viewers
  const onLike = async () => {
    if (!viewerId || busy) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    setBusy(true);
    try {
      await like({ data: { postId: post.id, like: next } });
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <header className="flex items-center gap-3">
        {post.creator.avatarUrl ? (
          <img
            src={post.creator.avatarUrl}
            alt={post.creator.stageName}
            className="size-10 rounded-full border border-brand-glow/40 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="size-10 rounded-full bg-brand/20" />
        )}
        <div className="min-w-0 flex-1">
          <Link
            to="/creators/$handle"
            params={{ handle: post.creator.handle }}
            className="truncate font-display text-sm font-semibold hover:text-brand-glow"
          >
            {post.creator.stageName}
            {post.creator.verified && <span className="ml-1 text-brand-glow">✓</span>}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            @{post.creator.handle} · {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </div>
        </div>
        {canDelete && post.creator.id && viewerId && (
          <DeletePostButton
            onDelete={async () => {
              await removePost({ data: { postId: post.id } });
              onChanged?.();
            }}
          />
        )}
      </header>

      <p className="mt-3 whitespace-pre-wrap text-sm">{post.body}</p>

      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt=""
          className="mt-3 max-h-[520px] w-full rounded-xl border border-border object-cover"
          loading="lazy"
        />
      )}

      {(post.linkedPack || post.linkedPersona) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.linkedPersona && (
            <Link
              to="/creators/$handle/$persona"
              params={{ handle: post.creator.handle, persona: post.linkedPersona.slug }}
              className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs hover:bg-brand/20"
            >
              <Sparkles className="size-3" /> {post.linkedPersona.displayName}
              <Badge variant="outline" className="ml-1 text-[10px]">
                {post.linkedPersona.kind === "ai" ? "AI" : "Real"}
              </Badge>
            </Link>
          )}
          {post.linkedPack && (
            <Link
              to="/creators/$handle"
              params={{ handle: post.creator.handle }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs hover:border-brand/40"
            >
              <Package className="size-3" /> {post.linkedPack.name}
            </Link>
          )}
        </div>
      )}

      {post.linkedPoll && (
        <div className="mt-3">
          <PollCard poll={post.linkedPoll} onVoted={onChanged} />
        </div>
      )}

      <footer className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onLike}
          disabled={!viewerId || busy}
          className={`inline-flex items-center gap-1 transition-colors hover:text-brand-glow disabled:opacity-60 ${liked ? "text-brand-glow" : ""}`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <Heart className={`size-4 ${liked ? "fill-current" : ""}`} />
          <span>{likeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          className="inline-flex items-center gap-1 hover:text-brand-glow"
        >
          <MessageCircle className="size-4" />
          <span>{post.commentCount}</span>
        </button>
      </footer>

      {showComments && <Comments postId={post.id} viewerId={viewerId} />}
    </article>
  );
}

function DeletePostButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setConfirming(true)}
        aria-label="Delete post"
      >
        <Trash2 className="size-4" />
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  );
}

function Comments({ postId, viewerId }: { postId: string; viewerId: string | null }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useServerFn(listComments);
  const post = useServerFn(addComment);
  const del = useServerFn(deleteComment);

  const refresh = async () => {
    const rows = await load({ data: { postId } });
    setItems(rows);
  };
  useEffect(() => { refresh(); /* eslint-disable-line */ }, [postId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerId || busy) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await post({ data: { postId, body: trimmed } });
      setBody("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      {items === null ? (
        <div className="text-xs text-muted-foreground">Loading comments…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground">No comments yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {c.authorAvatar ? (
                <img src={c.authorAvatar} alt="" className="size-7 rounded-full object-cover" />
              ) : (
                <div className="size-7 rounded-full bg-brand/20" />
              )}
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.authorName}</span>
                  {" · "}
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
              {viewerId && viewerId === c.authorId && (
                <button
                  type="button"
                  onClick={async () => {
                    await del({ data: { commentId: c.id } });
                    await refresh();
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                  aria-label="Delete comment"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {viewerId ? (
        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            rows={2}
            maxLength={500}
            className="resize-none text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length}/500</span>
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>Post</Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          <Link to="/auth" className="underline hover:text-brand-glow">Sign in</Link> to comment.
        </div>
      )}
    </div>
  );
}

export function PostComposer({
  creatorId,
  onPosted,
}: {
  creatorId: string;
  onPosted?: () => void;
}) {
  const { user } = useSession();
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [linkedPackId, setLinkedPackId] = useState<string>("");
  const [linkedPersonaId, setLinkedPersonaId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<{ packs: any[]; personas: any[] }>({ packs: [], personas: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const create = useServerFn(createPost);
  const loadOptions = useServerFn(getComposerOptions);

  useEffect(() => {
    if (!user) return;
    loadOptions({ data: { creatorId } }).then(setOptions).catch(() => {});
  }, [user, creatorId, loadOptions]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB");
      return;
    }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Say something first.");
      return;
    }
    setBusy(true);
    try {
      let imagePath: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("post-media")
          .upload(path, imageFile, { cacheControl: "3600", upsert: false });
        if (upErr) throw new Error(upErr.message);
        imagePath = path;
      }
      await create({
        data: {
          creatorId,
          body: trimmed,
          imagePath,
          linkedPackId: linkedPackId || null,
          linkedPersonaId: linkedPersonaId || null,
        },
      });
      setBody("");
      clearImage();
      setLinkedPackId("");
      setLinkedPersonaId("");
      onPosted?.();
    } catch (err: any) {
      setError(err?.message ?? "Failed to post");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share something with your supporters…"
        rows={3}
        maxLength={1000}
        className="resize-none"
      />
      {imagePreview && (
        <div className="relative mt-3 inline-block">
          <img src={imagePreview} alt="" className="max-h-64 rounded-xl border border-border" />
          <button
            type="button"
            onClick={clearImage}
            className="absolute right-2 top-2 rounded-full bg-background/80 p-1 hover:bg-background"
            aria-label="Remove image"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="mr-1 size-4" /> Image
        </Button>
        {options.personas.length > 0 && (
          <select
            value={linkedPersonaId}
            onChange={(e) => setLinkedPersonaId(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">Link a persona…</option>
            {options.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} ({p.kind === "ai" ? "AI" : "Real"})
              </option>
            ))}
          </select>
        )}
        {options.packs.length > 0 && (
          <select
            value={linkedPackId}
            onChange={(e) => setLinkedPackId(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">Link a pack…</option>
            {options.packs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{body.length}/1000</span>
          <Button type="submit" size="sm" disabled={busy || !body.trim()}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  );
}
