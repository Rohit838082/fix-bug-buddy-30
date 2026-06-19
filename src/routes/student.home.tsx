import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, CalendarCheck, Flame, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/student/home")({ component: StudentHome });

function StudentHome() {
  const { user } = useAuth();
  const [s, setS] = useState({ classes: 0, present: 0, streak: 0, pct: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { count: classes } = await supabase.from("class_students").select("class_id", { count: "exact", head: true }).eq("student_id", user.id);
      const { data: recs } = await supabase.from("attendance_records").select("status,created_at").eq("student_id", user.id).order("created_at", { ascending: false });
      const present = (recs ?? []).filter((r) => r.status === "present").length;
      const total = recs?.length ?? 0;
      const pct = total > 0 ? Math.round((present/total)*100) : 0;
      // streak: consecutive distinct days with at least one present, ending today/yesterday
      const presentDays = new Set((recs ?? []).filter(r => r.status === "present").map(r => new Date(r.created_at).toDateString()));
      let streak = 0;
      const d = new Date(); d.setHours(0,0,0,0);
      while (presentDays.has(d.toDateString())) { streak++; d.setDate(d.getDate()-1); }
      setS({ classes: classes ?? 0, present, streak, pct });
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Hi there 👋</h1>
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={BookOpen} label="Classes" value={s.classes} />
        <Stat icon={CalendarCheck} label="Present Days" value={s.present} />
        <Stat icon={Flame} label="Streak 🔥" value={s.streak} />
        <Stat icon={TrendingUp} label="Attendance" value={`${s.pct}%`} accent={s.pct >= 75} />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="card-lift rounded-2xl border border-border bg-card p-5">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5"/></div>
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent === false ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
