import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/student/history")({ component: History });

function History() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState({ present: 0, missed: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: recs } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });
      const classIds = Array.from(new Set((recs ?? []).map(r => r.class_id)));
      const { data: cls } = classIds.length
        ? await supabase.from("classes").select("id,name").in("id", classIds)
        : { data: [] as any[] };
      const m = new Map((cls ?? []).map(c => [c.id, c.name]));
      const enriched = (recs ?? []).map(r => ({ ...r, className: m.get(r.class_id) || "Class" }));
      setItems(enriched);
      setStats({
        present: enriched.filter(r => r.status === "present").length,
        missed: enriched.filter(r => r.status === "outside").length,
      });
    })();
  }, [user]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">History</h1>
      <div className="grid grid-cols-2 gap-3">
        <div className="card-lift rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Present Days</p>
          <p className="mt-1 text-2xl font-bold text-success">{stats.present}</p>
        </div>
        <div className="card-lift rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Missed/Outside</p>
          <p className="mt-1 text-2xl font-bold text-destructive">{stats.missed}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border p-10 text-center">
          <div className="text-4xl">📜</div>
          <p className="mt-2 text-sm text-muted-foreground">No attendance records yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map(r => (
            <li key={r.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
              <div>
                <p className="font-medium">{r.className}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              {r.status === "present" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5"/>Present</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-3 py-1 text-xs font-bold text-destructive"><XCircle className="h-3.5 w-3.5"/>Outside</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
