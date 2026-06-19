import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/teacher/reports")({
  component: Reports,
});

function Reports() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [stats, setStats] = useState({ sessions: 0, students: 0, present: 0, avgPct: 0 });
  const [weekly, setWeekly] = useState<any[]>([]);
  const [perStudent, setPerStudent] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("classes").select("id,name").eq("teacher_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => {
        setClasses(data ?? []);
        if (data?.[0]) setClassId(data[0].id);
      });
  }, [user]);

  useEffect(() => {
    if (!classId) return;
    (async () => {
      const { data: sessions } = await supabase.from("attendance_sessions").select("id,started_at").eq("class_id", classId);
      const { data: enroll } = await supabase.from("class_students").select("student_id").eq("class_id", classId);
      const { data: recs } = await supabase.from("attendance_records").select("*").eq("class_id", classId);
      const totalSessions = sessions?.length ?? 0;
      const totalStudents = enroll?.length ?? 0;
      const present = (recs ?? []).filter((r) => r.status === "present").length;
      const total = recs?.length ?? 0;
      setStats({
        sessions: totalSessions,
        students: totalStudents,
        present,
        avgPct: total > 0 ? Math.round((present / total) * 100) : 0,
      });

      // weekly
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const counts: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        counts[d.toDateString()] = 0;
      }
      (recs ?? []).forEach((r) => {
        if (r.status !== "present") return;
        const k = new Date(r.created_at).toDateString();
        if (k in counts) counts[k]++;
      });
      setWeekly(Object.entries(counts).map(([k, v]) => ({ day: days[new Date(k).getDay()], present: v })));

      // per student
      const studentIds = (enroll ?? []).map((e) => e.student_id);
      const { data: profs } = studentIds.length
        ? await supabase.from("profiles").select("id,name,email").in("id", studentIds)
        : { data: [] as any[] };
      const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
      const list = studentIds.map((sid) => {
        const sPresent = (recs ?? []).filter((r) => r.student_id === sid && r.status === "present").length;
        const pct = totalSessions > 0 ? Math.min(100, Math.round((sPresent / totalSessions) * 100)) : 0;
        const p = profMap.get(sid);
        return { id: sid, name: p?.name || "Student", email: p?.email || "", pct, present: sPresent };
      });
      setPerStudent(list);
    })();
  }, [classId]);

  const exportCsv = () => {
    const rows = [["Name", "Email", "Present Days", "Attendance %"]];
    perStudent.forEach((s) => rows.push([s.name, s.email, s.present, `${s.pct}%`]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-${classId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance Reports</h1>
          <p className="mt-1 text-muted-foreground">Drill into how your class is performing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.id})</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={!perStudent.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border p-16 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-semibold">No classes to report on</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Sessions" value={stats.sessions} />
            <Stat label="Students" value={stats.students} />
            <Stat label="Present Records" value={stats.present} />
            <Stat label="Avg Attendance" value={`${stats.avgPct}%`} />
          </div>

          <div className="card-lift rounded-2xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold">Weekly</h3>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Bar dataKey="present" fill="var(--color-primary)" radius={[8,8,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-lift rounded-2xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold">Per-student attendance</h3>
            {perStudent.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No students joined yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {perStudent.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <div className="flex w-1/2 items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full ${s.pct >= 75 ? "bg-success" : "bg-destructive"}`} style={{ width: `${s.pct}%` }} />
                      </div>
                      <span className={`w-12 text-right text-sm font-semibold ${s.pct >= 75 ? "text-success" : "text-destructive"}`}>{s.pct}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: any) {
  return (
    <div className="card-lift rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
