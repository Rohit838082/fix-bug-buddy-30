import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/teacher-decision")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") || "";
        const action = url.searchParams.get("action") || "";

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
          return htmlResponse("Error", error.message, false);
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

function htmlResponse(title: string, message: string, ok: boolean) {
  const color = ok ? "#16a34a" : "#dc2626";
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
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
