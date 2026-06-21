import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/teacher-decision")({
  server: {
    handlers: {
      // GET only renders a confirmation form. No state change happens here,
      // so email link-prefetchers / scanners (SafeLinks, etc.) cannot trigger
      // an approval or rejection by merely opening the URL.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") || "";
        const action = url.searchParams.get("action") || "";

        if (!token || (action !== "approved" && action !== "rejected")) {
          return htmlResponse("Invalid request", "Missing or invalid parameters.", false);
        }
        return confirmPage(token, action);
      },
      POST: async ({ request }) => {
        let token = "";
        let action = "";
        try {
          const ct = request.headers.get("content-type") || "";
          if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
            const form = await request.formData();
            token = String(form.get("token") || "");
            action = String(form.get("action") || "");
          } else {
            const body = await request.json().catch(() => ({}) as any);
            token = String(body.token || "");
            action = String(body.action || "");
          }
        } catch {
          return htmlResponse("Invalid request", "Could not parse request body.", false);
        }

        if (!token || (action !== "approved" && action !== "rejected")) {
          return htmlResponse("Invalid request", "Missing or invalid parameters.", false);
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await admin.rpc("app_admin_decide_teacher_request", {
          _token: token,
          _decision: action,
        });

        if (error) {
          console.error(error);
          return htmlResponse("Error", "Could not process the request.", false);
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.ok) {
          return htmlResponse("Could not process", row?.message || "Failed", false);
        }
        const title = action === "approved" ? "✅ Approved" : "❌ Rejected";
        const msg =
          action === "approved"
            ? `Teacher access granted to ${row.user_email}.`
            : `Teacher access rejected for ${row.user_email}.`;
        return htmlResponse(title, msg, true);
      },
    },
  },
});

function confirmPage(token: string, action: string) {
  const safeToken = escapeHtml(token);
  const safeAction = escapeHtml(action);
  const approve = action === "approved";
  const title = approve ? "Confirm approval" : "Confirm rejection";
  const color = approve ? "#16a34a" : "#dc2626";
  const btnLabel = approve ? "Approve teacher access" : "Reject teacher access";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <meta name="robots" content="noindex">
      <meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a">
        <form method="POST" action="/api/public/teacher-decision" style="max-width:480px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center">
          <h1 style="margin:0 0 12px;color:${color}">${escapeHtml(title)}</h1>
          <p style="margin:0 0 20px;color:#475569">Click the button below to confirm this decision. This action is final.</p>
          <input type="hidden" name="token" value="${safeToken}" />
          <input type="hidden" name="action" value="${safeAction}" />
          <button type="submit" style="background:${color};color:#fff;padding:12px 20px;border-radius:8px;border:0;font-weight:600;font-size:15px;cursor:pointer">${escapeHtml(btnLabel)}</button>
        </form>
      </body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function htmlResponse(title: string, message: string, ok: boolean) {
  const color = ok ? "#16a34a" : "#dc2626";
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
      <meta name="robots" content="noindex">
      <meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a">
        <div style="max-width:480px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center">
          <h1 style="margin:0 0 12px;color:${color}">${safeTitle}</h1>
          <p style="margin:0;color:#475569">${safeMessage}</p>
        </div>
      </body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
