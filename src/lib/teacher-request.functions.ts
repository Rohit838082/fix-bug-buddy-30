import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "pvishvajeet52@gmail.com";

function getPublicBaseUrl(): string {
  // Prefer published URL; fall back to dev
  return (
    process.env.PUBLIC_SITE_URL ||
    "https://loc-register.lovable.app"
  );
}

export const requestTeacherAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as any;
    const url = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get email + name from profiles (fallback to claims)
    const { data: profile } = await admin
      .from("profiles")
      .select("name, email")
      .eq("id", userId)
      .maybeSingle();

    const userEmail = profile?.email || claims.email || "";
    const userName = profile?.name || userEmail.split("@")[0] || "Unknown";

    // Upsert request: if already pending/approved/rejected, reuse
    const { data: existing } = await admin
      .from("teacher_requests")
      .select("id, status, decision_token")
      .eq("user_id", userId)
      .maybeSingle();

    let req = existing;
    if (!req) {
      const { data: inserted, error } = await admin
        .from("teacher_requests")
        .insert({
          user_id: userId,
          user_name: userName,
          user_email: userEmail,
        })
        .select("id, status, decision_token")
        .single();
      if (error) throw new Error(error.message);
      req = inserted;
    }

    // Only send email if pending (don't spam admin on re-request of already-decided)
    if (req.status === "pending") {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

      const base = getPublicBaseUrl();
      const approveUrl = `${base}/api/public/teacher-decision?token=${req.decision_token}&action=approved`;
      const rejectUrl = `${base}/api/public/teacher-decision?token=${req.decision_token}&action=rejected`;
      const ts = new Date().toISOString();

      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
          <h2 style="margin:0 0 16px">GeoPresent — Teacher Access Request</h2>
          <p style="margin:0 0 8px"><strong>Name:</strong> ${escapeHtml(userName)}</p>
          <p style="margin:0 0 8px"><strong>Email:</strong> ${escapeHtml(userEmail)}</p>
          <p style="margin:0 0 24px"><strong>Requested at:</strong> ${ts}</p>
          <div style="display:flex;gap:12px">
            <a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Approve</a>
            <a href="${rejectUrl}" style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reject</a>
          </div>
          <p style="margin-top:24px;color:#64748b;font-size:12px">If buttons don't work, copy a link:<br/>Approve: ${approveUrl}<br/>Reject: ${rejectUrl}</p>
        </div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "GeoPresent <onboarding@resend.dev>",
          to: [ADMIN_EMAIL],
          subject: `Teacher access request from ${userName}`,
          html,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Resend error:", res.status, text);
        throw new Error(`Email send failed (${res.status})`);
      }
    }

    return { status: req.status as "pending" | "approved" | "rejected" };
  });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
