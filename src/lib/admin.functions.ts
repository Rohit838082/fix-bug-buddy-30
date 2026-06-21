import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error("Authorization check failed");
  if (!data) throw new Error("Forbidden — admin access required");
}

/* ----------------------------- OVERVIEW STATS ----------------------------- */
export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      profiles,
      roles,
      classes,
      subs,
      todayAtt,
      plans,
      recentRecords,
      recentProfiles,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, created_at", { count: "exact" }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("classes").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("subscriptions").select("plan_id, status"),
      supabaseAdmin
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "present")
        .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabaseAdmin.from("subscription_plans").select("id, price_cents"),
      supabaseAdmin
        .from("attendance_records")
        .select("created_at, status")
        .gte("created_at", since.toISOString()),
      supabaseAdmin
        .from("profiles")
        .select("created_at")
        .gte("created_at", since.toISOString()),
    ]);

    const roleCounts = (roles.data ?? []).reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [r.role]: (acc[r.role] || 0) + 1 }),
      {},
    );
    const planPrice = new Map((plans.data ?? []).map((p) => [p.id, p.price_cents]));
    const mrrCents = (subs.data ?? [])
      .filter((s) => s.status === "active" || s.status === "trialing")
      .reduce((sum, s) => sum + (planPrice.get(s.plan_id) ?? 0), 0);

    // 30-day buckets
    const days: { day: string; signups: number; present: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({ day: d.toISOString().slice(5, 10), signups: 0, present: 0 });
    }
    const dayIndex = (iso: string) => {
      const d = new Date(iso);
      d.setHours(0, 0, 0, 0);
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
      const idx = 29 - diff;
      return idx >= 0 && idx < 30 ? idx : -1;
    };
    for (const p of recentProfiles.data ?? []) {
      const i = dayIndex(p.created_at as string);
      if (i >= 0) days[i].signups += 1;
    }
    for (const r of recentRecords.data ?? []) {
      if (r.status !== "present") continue;
      const i = dayIndex(r.created_at as string);
      if (i >= 0) days[i].present += 1;
    }

    return {
      totalUsers: profiles.count ?? 0,
      teachers: roleCounts["teacher"] ?? 0,
      students: roleCounts["student"] ?? 0,
      admins: roleCounts["admin"] ?? 0,
      classes: classes.count ?? 0,
      paidSubs: (subs.data ?? []).filter(
        (s) => s.plan_id !== "free" && (s.status === "active" || s.status === "trialing"),
      ).length,
      mrrCents,
      todayPresent: todayAtt.count ?? 0,
      series: days,
    };
  });

/* ------------------------------- USERS LIST ------------------------------- */
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string }) => ({ search: (d?.search ?? "").trim() }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("profiles")
      .select("id, name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.search) {
      q = q.or(`email.ilike.%${data.search}%,name.ilike.%${data.search}%`);
    }
    const { data: profs, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (profs ?? []).map((p) => p.id);
    if (ids.length === 0) return [];
    const [roles, subs, statuses] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan_id, status, current_period_end")
        .in("user_id", ids),
      supabaseAdmin.from("user_status").select("user_id, status").in("user_id", ids),
    ]);

    const roleMap = new Map<string, string[]>();
    for (const r of roles.data ?? []) {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role as string);
      roleMap.set(r.user_id, arr);
    }
    const subMap = new Map((subs.data ?? []).map((s) => [s.user_id, s]));
    const statusMap = new Map((statuses.data ?? []).map((s) => [s.user_id, s.status]));

    return (profs ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      created_at: p.created_at,
      roles: roleMap.get(p.id) ?? [],
      plan_id: subMap.get(p.id)?.plan_id ?? "free",
      sub_status: subMap.get(p.id)?.status ?? "active",
      account_status: statusMap.get(p.id) ?? "active",
    }));
  });

/* ----------------------------- USER MUTATIONS ----------------------------- */
export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        target_user_id: z.string().uuid(),
        role: z.enum(["student", "teacher", "admin"]),
        add: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.add) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.target_user_id, role: data.role as any }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.target_user_id)
        .eq("role", data.role as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        target_user_id: z.string().uuid(),
        status: z.enum(["active", "suspended"]),
        reason: z.string().max(280).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_status").upsert({
      user_id: data.target_user_id,
      status: data.status,
      reason: data.reason ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ target_user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    if (data.target_user_id === userId) throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.target_user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- SUBSCRIPTION ACTIONS ------------------------- */
export const adminSetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        target_user_id: z.string().uuid(),
        plan_id: z.string().min(1),
        status: z.enum(["active", "trialing", "past_due", "canceled"]).default("active"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure plan exists
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("id")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (!plan) throw new Error("Unknown plan");

    const { error } = await supabaseAdmin.from("subscriptions").upsert({
      user_id: data.target_user_id,
      plan_id: data.plan_id,
      status: data.status,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, plan_id, status, current_period_end, created_at, cancel_at_period_end");
    const ids = (subs ?? []).map((s) => s.user_id);
    if (ids.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .in("id", ids);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (subs ?? [])
      .map((s) => ({ ...s, profile: pMap.get(s.user_id) ?? null }))
      .sort((a, b) => (a.plan_id > b.plan_id ? -1 : 1));
  });

/* ---------------------------- TEACHER REQUESTS ---------------------------- */
export const adminListTeacherRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("teacher_requests")
      .select("id, user_id, user_name, user_email, status, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminDecideTeacherRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        request_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error: rerr } = await supabaseAdmin
      .from("teacher_requests")
      .select("user_id, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (rerr) throw new Error(rerr.message);
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Already ${req.status}`);

    const { error: uerr } = await supabaseAdmin
      .from("teacher_requests")
      .update({ status: data.decision, decided_at: new Date().toISOString() })
      .eq("id", data.request_id);
    if (uerr) throw new Error(uerr.message);

    if (data.decision === "approved") {
      const { error: rerr2 } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: req.user_id, role: "teacher" as any }, { onConflict: "user_id,role" });
      if (rerr2) throw new Error(rerr2.message);
    }
    return { ok: true };
  });

/* --------------------------- CLASSES OVERVIEW ----------------------------- */
export const adminListClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: classes, error } = await supabaseAdmin
      .from("classes")
      .select("id, name, subject, section, teacher_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const list = classes ?? [];
    const tIds = Array.from(new Set(list.map((c) => c.teacher_id)));
    const ids = list.map((c) => c.id);
    const [teachers, counts, today] = await Promise.all([
      tIds.length
        ? supabaseAdmin.from("profiles").select("id, name, email").in("id", tIds)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabaseAdmin.from("class_students").select("class_id").in("class_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabaseAdmin
            .from("attendance_records")
            .select("class_id, status")
            .in("class_id", ids)
            .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const tMap = new Map(((teachers as any).data ?? []).map((t: any) => [t.id, t]));
    const studentCount = new Map<string, number>();
    for (const cs of (counts as any).data ?? []) {
      studentCount.set(cs.class_id, (studentCount.get(cs.class_id) ?? 0) + 1);
    }
    const todayPresent = new Map<string, number>();
    for (const r of (today as any).data ?? []) {
      if (r.status === "present") {
        todayPresent.set(r.class_id, (todayPresent.get(r.class_id) ?? 0) + 1);
      }
    }
    return list.map((c) => ({
      ...c,
      teacher: tMap.get(c.teacher_id) ?? null,
      students: studentCount.get(c.id) ?? 0,
      today_present: todayPresent.get(c.id) ?? 0,
    }));
  });

/* ------------------------------- MY PLAN ---------------------------------- */
export const myPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const [{ data: plan }, { data: sub }, classes] = await Promise.all([
      supabase.rpc("current_plan", { _user_id: userId }),
      supabase
        .from("subscriptions")
        .select("plan_id, status, current_period_end, cancel_at_period_end")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("teacher_id", userId),
    ]);
    return {
      plan,
      subscription: sub,
      usage: { classes: classes.count ?? 0 },
    };
  });
