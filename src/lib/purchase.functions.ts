import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error("Authorization check failed");
  if (!data) throw new Error("Forbidden — admin access required");
}

/* List all purchase requests (admin) with profile + plan info, and signed screenshot URLs. */
export const adminListPurchaseRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reqs, error } = await supabaseAdmin
      .from("purchase_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const list = reqs ?? [];
    const userIds = Array.from(new Set(list.map((r: any) => r.user_id)));
    const planIds = Array.from(new Set(list.map((r: any) => r.plan_id)));
    const [profs, plans] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, name, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      planIds.length
        ? supabaseAdmin.from("subscription_plans").select("id, name").in("id", planIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const pMap = new Map(((profs as any).data ?? []).map((p: any) => [p.id, p]));
    const planMap = new Map(((plans as any).data ?? []).map((p: any) => [p.id, p]));

    // Sign screenshot URLs (1 hour) — screenshot_url stores the storage path
    const signed = await Promise.all(
      list.map(async (r: any) => {
        const { data } = await supabaseAdmin.storage
          .from("payment-proofs")
          .createSignedUrl(r.screenshot_url, 3600);
        return data?.signedUrl ?? null;
      }),
    );

    return list.map((r: any, i: number) => ({
      ...r,
      profile: pMap.get(r.user_id) ?? null,
      plan: planMap.get(r.plan_id) ?? null,
      screenshot_signed_url: signed[i],
    }));
  });

/* Approve or reject a purchase request. On approve, set the user's subscription. */
export const adminDecidePurchaseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        request_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: rerr } = await supabaseAdmin
      .from("purchase_requests")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (rerr) throw new Error(rerr.message);
    if (!req) throw new Error("Request not found");
    if ((req as any).status !== "pending") throw new Error(`Already ${(req as any).status}`);

    const { error: uerr } = await supabaseAdmin
      .from("purchase_requests")
      .update({
        status: data.decision,
        admin_notes: data.notes ?? null,
        decided_at: new Date().toISOString(),
        decided_by: userId,
      })
      .eq("id", data.request_id);
    if (uerr) throw new Error(uerr.message);

    if (data.decision === "approved") {
      const interval = (req as any).billing_interval;
      const days = interval === "year" ? 365 : 30;
      const periodEnd = new Date(Date.now() + days * 86400 * 1000).toISOString();
      const { error: serr } = await supabaseAdmin.from("subscriptions").upsert({
        user_id: (req as any).user_id,
        plan_id: (req as any).plan_id,
        status: "active",
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      });
      if (serr) throw new Error(serr.message);
    }
    return { ok: true };
  });

/* Get a signed URL for the current user's own purchase request screenshot. */
export const getMyScreenshotUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    // path must be under the user's folder
    if (!data.path.startsWith(`${userId}/`)) throw new Error("Forbidden");
    const { data: signed, error } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });
