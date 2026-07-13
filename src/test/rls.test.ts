import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// RLS behavior tests hitting the live Lovable Cloud (Supabase) project.
// - Anon-role checks always run (uses the project's publishable key).
// - Authenticated / owner / admin checks run only when creds are provided
//   via env vars, so the suite stays green in vanilla CI.
//
// Env vars (all optional except URL/key which come from .env):
//   TEST_USER_EMAIL / TEST_USER_PASSWORD           — any authenticated user
//   TEST_OWNER_EMAIL / TEST_OWNER_PASSWORD         — owns an agency row
//   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD         — has 'admin' role

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY;

const anon = createClient(URL!, KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signedIn(
  email?: string,
  password?: string,
): Promise<SupabaseClient | null> {
  if (!email || !password) return null;
  const client = createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

describe("RLS: environment", () => {
  it("has Supabase URL and publishable key configured", () => {
    expect(URL).toBeTruthy();
    expect(KEY).toBeTruthy();
  });
});

describe("RLS: agencies", () => {
  it("anon cannot list agency rows directly", async () => {
    const { data, error } = await anon.from("agencies").select("*");
    // Either RLS blocks (error) or returns empty — never leaks rows.
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("anon cannot call list_selectable_agencies RPC", async () => {
    const { error } = await anon.rpc("list_selectable_agencies");
    expect(error).toBeTruthy();
  });

  const authIt =
    process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
      ? it
      : it.skip;

  authIt("authenticated can call list_selectable_agencies RPC", async () => {
    const client = await signedIn(
      process.env.TEST_USER_EMAIL,
      process.env.TEST_USER_PASSWORD,
    );
    const { data, error } = await client!.rpc("list_selectable_agencies");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // RPC exposes only id + name — verify shape.
    if ((data ?? []).length > 0) {
      expect(Object.keys(data![0]).sort()).toEqual(["id", "name"]);
    }
  });

  authIt(
    "non-owner authenticated user cannot select arbitrary agency rows",
    async () => {
      const client = await signedIn(
        process.env.TEST_USER_EMAIL,
        process.env.TEST_USER_PASSWORD,
      );
      const { data, error } = await client!.from("agencies").select("*");
      if (!error) {
        // Any row returned must be one the caller owns.
        const { data: uData } = await client!.auth.getUser();
        const uid = uData.user?.id;
        for (const row of data ?? []) {
          expect((row as { owner_user_id: string }).owner_user_id).toBe(uid);
        }
      }
    },
  );

  const adminIt =
    process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD
      ? it
      : it.skip;

  adminIt("admin can select agency rows", async () => {
    const client = await signedIn(
      process.env.TEST_ADMIN_EMAIL,
      process.env.TEST_ADMIN_PASSWORD,
    );
    const { error } = await client!.from("agencies").select("id").limit(1);
    expect(error).toBeNull();
  });
});

describe("RLS: polls visibility", () => {
  it("anon only sees polls with visibility='public'", async () => {
    const { data, error } = await anon.from("polls").select("id, visibility");
    if (error) {
      expect(error).toBeTruthy();
      return;
    }
    for (const row of data ?? []) {
      expect((row as { visibility: string }).visibility).toBe("public");
    }
  });

  it("anon cannot read subscribers_only or logged_in polls", async () => {
    const { data } = await anon
      .from("polls")
      .select("id")
      .in("visibility", ["subscribers_only", "logged_in"]);
    expect(data ?? []).toHaveLength(0);
  });

  it("anon poll_options are only reachable for public parent polls", async () => {
    const { data, error } = await anon
      .from("poll_options")
      .select("id, poll_id, polls!inner(visibility)")
      .limit(50);
    if (error) {
      expect(error).toBeTruthy();
      return;
    }
    for (const row of data ?? []) {
      expect(
        (row as { polls: { visibility: string } }).polls.visibility,
      ).toBe("public");
    }
  });

  const authIt =
    process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
      ? it
      : it.skip;

  authIt("authenticated non-subscriber never sees subscribers_only polls", async () => {
    const client = await signedIn(
      process.env.TEST_USER_EMAIL,
      process.env.TEST_USER_PASSWORD,
    );
    const { data: uData } = await client!.auth.getUser();
    const uid = uData.user?.id;
    const { data, error } = await client!
      .from("polls")
      .select("id, creator_id, visibility")
      .eq("visibility", "subscribers_only");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      // If a subscribers_only row shows up, it must be because caller is the
      // creator, an agency manager, or an entitled subscriber. The weakest
      // safe check: it should NOT be an arbitrary row where the caller has
      // no relationship. We assert creator_id !== uid implies caller has
      // creator access (verified via the RPC helper).
      const r = row as { creator_id: string };
      if (r.creator_id !== uid) {
        const { data: allowed } = await client!.rpc("has_creator_access", {
          _user_id: uid,
          _creator_id: r.creator_id,
          _min_tier: "base",
        });
        expect(allowed).toBe(true);
      }
    }
  });
});

describe("RLS: profiles_public / profiles", () => {
  it("anon cannot select from profiles directly (PII protected)", async () => {
    const { data, error } = await anon.from("profiles").select("id").limit(1);
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("anon can select from profiles_public view", async () => {
    const { error } = await anon
      .from("profiles_public")
      .select("id, display_name, avatar_url")
      .limit(1);
    expect(error).toBeNull();
  });

  it("profiles_public view exposes only safe columns", async () => {
    const { data, error } = await anon
      .from("profiles_public")
      .select("*")
      .limit(1);
    expect(error).toBeNull();
    if ((data ?? []).length > 0) {
      const keys = Object.keys(data![0]).sort();
      expect(keys).toEqual(["avatar_url", "display_name", "id"]);
    }
  });

  const authIt =
    process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
      ? it
      : it.skip;

  authIt("authenticated can read their own profile row", async () => {
    const client = await signedIn(
      process.env.TEST_USER_EMAIL,
      process.env.TEST_USER_PASSWORD,
    );
    const { data: uData } = await client!.auth.getUser();
    const uid = uData.user?.id;
    const { data, error } = await client!
      .from("profiles")
      .select("id")
      .eq("id", uid!)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(uid);
  });

  authIt(
    "authenticated cannot read arbitrary other users' full profiles",
    async () => {
      const client = await signedIn(
        process.env.TEST_USER_EMAIL,
        process.env.TEST_USER_PASSWORD,
      );
      const { data: uData } = await client!.auth.getUser();
      const uid = uData.user?.id;
      const { data, error } = await client!
        .from("profiles")
        .select("id")
        .neq("id", uid!)
        .limit(5);
      if (!error) {
        // No arbitrary other-user rows should leak through.
        expect(data ?? []).toHaveLength(0);
      }
    },
  );
});