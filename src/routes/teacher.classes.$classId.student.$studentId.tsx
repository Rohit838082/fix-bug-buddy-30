import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Mail, Calendar as CalIcon, ChevronLeft, ChevronRight, GraduationCap, Cake, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/teacher/classes/$classId/student/$studentId")({
  component: StudentDetail,
});

function StudentDetail() {
  const { classId, studentId } = useParams({ from: "/teacher/classes/$classId/student/$studentId" });
  const [profile, setProfile] = useState<any>(null);
  const [enroll, setEnroll] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [cls, setCls] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });

  const load = useCallback(async () => {
    const [p, e, r, c] = await Promise.all([
      supabase.from("profiles").select("id,name,email,college,age,dob").eq("id", studentId).maybeSingle(),
      supabase.from("class_students").select("joined_at").eq("class_id", classId).eq("student_id", studentId).maybeSingle(),
      supabase.from("attendance_records").select("*").eq("class_id", classId).eq("student_id", studentId).order("attendance_date", { ascending: false }),
      supabase.from("classes").select("id,name").eq("id", classId).maybeSingle(),
    ]);
    setProfile(p.data); setEnroll(e.data); setRecords(r.data ?? []); setCls(c.data);
    setLoading(false);
  }, [classId, studentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`teacher-student-${classId}-${studentId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "attendance_records", filter: `student_id=eq.${studentId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [classId, studentId, load]);

  if (loading) return <div className="space-y-4"><div className="h-24 animate-pulse rounded-2xl bg-muted"/><div className="h-60 animate-pulse rounded-2xl bg-muted"/></div>;
  if (!profile) return <p className="text-muted-foreground">Student not found.</p>;

  const dateKey = (r: any) => r.attendance_date || new Date(r.created_at).toISOString().slice(0, 10);

  // Overall
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const total = present + absent + late;
  const pct = total ? Math.round((present / total) * 100) : 0;

  // Month-scoped
  const yyyy = month.getFullYear();
  const mm = month.getMonth();
  const inMonth = (r: any) => {
    const d = new Date(dateKey(r) + "T00:00:00");
    return d.getFullYear() === yyyy && d.getMonth() === mm;
  };
  const monthRecords = records
    .filter(inMonth)
    .sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  const mPresent = monthRecords.filter((r) => r.status === "present").length;
  const mAbsent = monthRecords.filter((r) => r.status === "absent").length;
  const mLate = monthRecords.filter((r) => r.status === "late").length;
  const mTotal = mPresent + mAbsent + mLate;
  const mPct = mTotal ? Math.round((mPresent / mTotal) * 100) : 0;
  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  const exportCSV = () => {
    const rows = [["Date", "Status", "Time", "Distance (m)"]];
    for (const r of monthRecords) {
      const d = new Date(r.created_at);
      rows.push([
        dateKey(r),
        r.status,
        d.toLocaleTimeString(),
        String(Math.round(r.distance ?? 0)),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.name || "student"}-${monthLabel}-attendance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const initials = (profile.name || profile.email || "?").trim().slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/teacher/classes/$classId" params={{ classId }}>
        <Button variant="ghost" size="sm" className="gap-2 -ml-2"><ArrowLeft className="h-4 w-4"/> Back to {cls?.name || "class"}</Button>
      </Link>

      {/* Header */}
      <div className="card-lift rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">{initials}</div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">{profile.name || "Student"}</h1>
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-4 w-4"/> {profile.email}</p>
              {profile.college && <p className="flex items-center gap-2 text-sm text-muted-foreground"><GraduationCap className="h-4 w-4"/> {profile.college}</p>}
              {(profile.age || profile.dob) && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Cake className="h-4 w-4"/>
                  {profile.age ? `${profile.age} yrs` : ""}{profile.age && profile.dob ? " · " : ""}{profile.dob ? new Date(profile.dob).toLocaleDateString() : ""}
                </p>
              )}
              {enroll && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalIcon className="h-4 w-4"/> Enrolled {new Date(enroll.joined_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <div className={`rounded-2xl px-5 py-3 text-center ${pct >= 75 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
            <p className="text-xs font-semibold uppercase tracking-wider">Attendance</p>
            <p className="text-3xl font-bold">{pct}%</p>
          </div>
        </div>
      </div>

      {/* Attendance + Summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Attendance Table */}
        <div className="card-lift rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Previous month"
                onClick={() => { const d = new Date(month); d.setMonth(d.getMonth()-1); setMonth(d); }}>
                <ChevronLeft className="h-4 w-4"/>
              </Button>
              <h3 className="min-w-[160px] text-center text-base font-semibold">{monthLabel}</h3>
              <Button variant="ghost" size="icon" aria-label="Next month"
                onClick={() => { const d = new Date(month); d.setMonth(d.getMonth()+1); setMonth(d); }}>
                <ChevronRight className="h-4 w-4"/>
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={monthRecords.length === 0} className="gap-2">
              <Download className="h-4 w-4"/> Export
            </Button>
          </div>
          {monthRecords.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No attendance records for {monthLabel}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Date</th><th>Status</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthRecords.map((r) => {
                    const d = new Date(dateKey(r) + "T00:00:00");
                    const tone = r.status === "present"
                      ? "bg-success/15 text-success"
                      : r.status === "late"
                      ? "bg-warning/15 text-warning"
                      : "bg-destructive/15 text-destructive";
                    return (
                      <tr key={r.id}>
                        <td className="py-2 font-medium">{d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${tone}`}>{r.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          <SummaryCard title="Overall Attendance" total={total} present={present} absent={absent + late} pct={pct} />
          <SummaryCard title={`${monthLabel}`} total={mTotal} present={mPresent} absent={mAbsent + mLate} pct={mPct} />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, total, present, absent, pct }: { title: string; total: number; present: number; absent: number; pct: number; }) {
  return (
    <div className="card-lift rounded-2xl border border-border bg-card p-5">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-3xl font-bold">{pct}%</span>
        <span className="text-xs text-muted-foreground">{present}/{total} classes</span>
      </div>
      <Progress value={pct} className="mt-2 h-2" />
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-muted-foreground">Total</p>
          <p className="text-base font-bold">{total}</p>
        </div>
        <div className="rounded-lg bg-success/10 p-2">
          <p className="text-success">Present</p>
          <p className="text-base font-bold text-success">{present}</p>
        </div>
        <div className="rounded-lg bg-destructive/10 p-2">
          <p className="text-destructive">Absent</p>
          <p className="text-base font-bold text-destructive">{absent}</p>
        </div>
      </div>
    </div>
  );
}