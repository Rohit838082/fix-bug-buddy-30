import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { AttendanceHistoryPanel } from "@/components/AttendanceHistoryPanel";
import { useEffect, useState, useCallback } from "react";
import { Radio, Trash2, Users, MapPin, Download, Loader2, UserCheck, UserX, Percent, Copy, Check, ChevronLeft, ChevronRight, Pencil, ChevronRight as ChevR, History, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClassLocationsManager } from "@/components/geopresent/ClassLocationsManager";
import { TimePicker12h, format12h } from "@/components/time-picker-12h";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeSVG } from "qrcode.react";

// Format a Date as YYYY-MM-DD in Asia/Kolkata (IST) — matches DB attendance_date default.
function istYmd(d: Date): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
// Build a YYYY-MM-DD key from local Y/M/D numbers (no TZ conversion).
function ymdKey(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// Parse YYYY-MM-DD as a local Date (avoids UTC midnight shift).
function parseYmdLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const Route = createFileRoute("/teacher/classes/$classId")({
  component: ClassDetail,
});

function ClassDetail() {
  const { classId } = useParams({ from: "/teacher/classes/$classId" });
  const navigate = useNavigate();
  const [cls, setCls] = useState<any>(null);
  const [password, setPassword] = useState<string>("");
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeStudent, setRemoveStudent] = useState<{ id: string; name: string } | null>(null);
  const [removingStudent, setRemovingStudent] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", attendance_end_time: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openStat, setOpenStat] = useState<null | "total" | "present" | "absent" | "pct">(null);
  const [statSearch, setStatSearch] = useState("");
  const [statCollege, setStatCollege] = useState<string>("all");
  const [statSort, setStatSort] = useState<"name" | "joined">("name");
  const [statPage, setStatPage] = useState(1);
  const [pctMonth, setPctMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  useEffect(() => { setStatSearch(""); setStatCollege("all"); setStatPage(1); }, [openStat]);

  const loadClass = useCallback(async () => {
    const { data } = await supabase
      .from("classes")
      .select("id, teacher_id, name, subject, section, semester, lat, lng, radius, attendance_end_time, active_session, created_at")
      .eq("id", classId)
      .maybeSingle();
    setCls(data);
    // Password is column-revoked from clients; fetch via SECURITY DEFINER RPC (teacher only).
    const { data: pw } = await supabase.rpc("get_class_password" as any, { _class_id: classId });
    setPassword((pw as string) ?? "");
  }, [classId]);

  const loadStudents = useCallback(async () => {
    const { data: enroll } = await supabase
      .from("class_students").select("student_id, joined_at").eq("class_id", classId);
    const ids = (enroll ?? []).map((e) => e.student_id);
    if (!ids.length) { setStudents([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id, name, email, college, age, dob").in("id", ids);
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const { data: sessions } = await supabase.from("attendance_sessions").select("id").eq("class_id", classId);
    const totalSessions = sessions?.length ?? 0;
    const list = await Promise.all((enroll ?? []).map(async (e) => {
      const { count } = await supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("class_id", classId).eq("student_id", e.student_id).eq("status", "present");
      const pct = totalSessions > 0 ? Math.min(Math.round(((count ?? 0) / totalSessions) * 100), 100) : 0;
      const p: any = profMap.get(e.student_id);
      return {
        id: e.student_id,
        name: p?.name || "Student",
        email: p?.email || "",
        college: p?.college || "",
        age: p?.age ?? null,
        dob: p?.dob ?? null,
        joined_at: e.joined_at,
        pct,
        present: count ?? 0,
      };
    }));
    setStudents(list);
  }, [classId]);

  const loadRecords = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(2000);
    const ids = Array.from(new Set((data ?? []).map((r) => r.student_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,name,email").in("id", ids)
      : { data: [] as any[] };
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    setRecords((data ?? []).map((r) => ({ ...r, profile: map.get(r.student_id) })));
  }, [classId]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadClass(), loadStudents(), loadRecords()]);
      setLoading(false);
    })();
  }, [loadClass, loadStudents, loadRecords]);

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase
      .channel(`teacher-class-${classId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records", filter: `class_id=eq.${classId}` },
        () => { loadRecords(); loadStudents(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "class_students", filter: `class_id=eq.${classId}` },
        () => loadStudents())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "classes", filter: `id=eq.${classId}` },
        (payload) => setCls(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [classId, loadRecords, loadStudents]);

  const toggleSession = async () => {
    if (!cls) return;
    setBusy(true);
    const next = !cls.active_session;
    const { error } = await supabase.from("classes").update({ active_session: next }).eq("id", classId);
    if (!error) {
      if (next) {
        await supabase.from("attendance_sessions").insert({ class_id: classId });
        toast.success("Session started");
      } else {
        await supabase.from("attendance_sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("class_id", classId).is("ended_at", null);
        toast.success("Session ended");
      }
      setCls({ ...cls, active_session: next });
    } else toast.error(error.message);
    setBusy(false);
  };

  const deleteClass = async () => {
    setDeleting(true);
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    setConfirmOpen(false);
    toast.success("Class deleted successfully");
    navigate({ to: "/teacher/classes" });
  };

  const removeStudentFromClass = async () => {
    if (!removeStudent) return;
    setRemovingStudent(true);
    const { error } = await supabase
      .from("class_students")
      .delete()
      .eq("class_id", classId)
      .eq("student_id", removeStudent.id);
    setRemovingStudent(false);
    if (error) { toast.error(error.message || "Failed to remove student"); return; }
    toast.success("Student removed successfully.");
    setRemoveStudent(null);
    loadStudents();
  };

  const openEdit = () => {
    if (!cls) return;
    setEditForm({ name: cls.name, attendance_end_time: cls.attendance_end_time || "" });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) return toast.error("Name is required");
    setSavingEdit(true);
    const { data, error } = await supabase
      .from("classes")
      .update({ name: editForm.name.trim(), attendance_end_time: editForm.attendance_end_time || null })
      .eq("id", classId)
      .select()
      .maybeSingle();
    setSavingEdit(false);
    if (error) return toast.error(error.message);
    setCls(data);
    setEditOpen(false);
    toast.success("Class updated");
  };

  const exportCsv = () => {
    const rows = [["Student", "Email", "Date", "Time", "Status", "Distance (m)"]];
    records.forEach((r) => {
      const d = new Date(r.created_at);
      rows.push([
        r.profile?.name || "Student",
        r.profile?.email || "",
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        r.status,
        String(Math.round(r.distance)),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cls?.name || "class"}-attendance.csv`;
    a.click();
  };

  const copyTo = async (txt: string, key: string) => {
    await navigator.clipboard.writeText(txt);
    setCopied(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 1500);
  };

  const copyInvite = () =>
    copyTo(
      `Class: ${cls?.name}\nID: ${cls?.id}\nPassword: ${password}\nRadius: ${cls?.radius}m`,
      "invite",
    );

  if (loading) return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-2xl bg-muted"/>
      <div className="h-40 animate-pulse rounded-2xl bg-muted"/>
      <div className="h-60 animate-pulse rounded-2xl bg-muted"/>
    </div>
  );
  if (!cls) return <p className="text-muted-foreground">Class not found.</p>;

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const todayPresent = records.filter((r) => r.status === "present" && new Date(r.created_at) >= startOfToday);
  const todayPresentIds = new Set(todayPresent.map((r) => r.student_id));
  const todayAbsent = students.length - todayPresentIds.size;
  const pct = students.length ? Math.round((todayPresentIds.size / students.length) * 100) : 0;

  const filtered = students.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()),
  );

  // Per-student aggregates for Students tab
  const studentRows = students.map((s) => {
    const recs = records.filter((r) => r.student_id === s.id);
    const present = recs.filter((r) => r.status === "present").length;
    const absent = recs.filter((r) => r.status === "absent").length;
    const total = present + absent;
    const pct = total ? Math.round((present / total) * 100) : 0;
    const last = recs[0];
    return { ...s, present, absent, pct, last };
  }).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()),
  );

  // Calendar data — group by attendance_date
  const dayMap = (() => {
    // Group present records by IST date. Absent = enrolled students minus present
    // (matches Dashboard logic; explicit absent rows are inserted next day by
    // finalize_daily_attendance, so we shouldn't depend on them).
    const presentByDay = new Map<string, Map<string, any>>();
    const explicitAbsentByDay = new Map<string, Map<string, any>>();
    for (const r of records) {
      const key = r.attendance_date || istYmd(new Date(r.created_at));
      const target = r.status === "present" ? presentByDay : explicitAbsentByDay;
      if (!target.has(key)) target.set(key, new Map());
      // Keep one row per student per day (latest wins by iteration order).
      if (!target.get(key)!.has(r.student_id)) target.get(key)!.set(r.student_id, r);
    }
    const out = new Map<string, { present: any[]; absent: any[] }>();
    const allDays = new Set<string>([...presentByDay.keys(), ...explicitAbsentByDay.keys()]);
    const todayKey = istYmd(new Date());
    for (const key of allDays) {
      const present = Array.from(presentByDay.get(key)?.values() ?? []);
      const presentIds = new Set(present.map((r) => r.student_id));
      // For past days prefer enrolled-minus-present; for future days no absents.
      let absent: any[];
      if (key > todayKey) {
        absent = [];
      } else {
        absent = students
          .filter((s) => !presentIds.has(s.id))
          .map((s) => ({ id: `abs-${key}-${s.id}`, student_id: s.id, status: "absent" }));
      }
      out.set(key, { present, absent });
    }
    return out;
  })();

  // Analytics: last 14 days trend
  const trend = buildTrend(records, students.length);
  const overall = {
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/teacher/dashboard" className="hover:text-foreground">Main</Link>
        <ChevR className="h-3 w-3" />
        <Link to="/teacher/classes" className="hover:text-foreground">My Classes</Link>
        <ChevR className="h-3 w-3" />
        <span className="font-medium text-foreground">{cls.name}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Class ID · {cls.id}</p>
          <h1 className="mt-1 text-3xl font-bold">{cls.name}</h1>
          <p className="text-muted-foreground">{cls.subject || "—"} · {cls.section || "—"} · {cls.semester || "—"} · Radius {cls.radius}m{cls.attendance_end_time ? ` · Closes ${cls.attendance_end_time} IST` : ""}</p>
          <p className="text-xs text-muted-foreground">Created {new Date(cls.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={toggleSession} disabled={busy} variant={cls.active_session ? "destructive" : "default"} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Radio className={`h-4 w-4 ${cls.active_session ? "animate-pulse" : ""}`} />}
            {cls.active_session ? "End Session" : "Start Session"}
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportCsv}><Download className="h-4 w-4"/> CSV</Button>
          <Button variant="outline" className="gap-2" onClick={openEdit}>
            <Pencil className="h-4 w-4" /> Edit Class
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2" aria-label="Delete class">
                <Trash2 className="h-4 w-4" /> Delete Class
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Class?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. All students, attendance records, and class data will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); deleteClass(); }}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Deleting…</> : "Delete Permanently"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <AlertDialog open={!!removeStudent} onOpenChange={(o) => { if (!o) setRemoveStudent(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeStudent?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this student from the class? This action cannot be undone.
              Past attendance records will be retained for reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingStudent}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); removeStudentFromClass(); }}
              disabled={removingStudent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingStudent ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Removing…</> : "Remove Student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
            <DialogDescription>Update class name and attendance closing time. Manage locations from the Overview tab.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Class Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Attendance End Time (IST)</Label>
              <Input type="time" value={editForm.attendance_end_time} onChange={(e) => setEditForm({ ...editForm, attendance_end_time: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Students cannot mark attendance after this time.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="gap-2">
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Users} label="Total Students" value={students.length} onClick={() => setOpenStat("total")} />
        <Stat icon={UserCheck} label="Present Today" value={todayPresentIds.size} tone="success" onClick={() => setOpenStat("present")} />
        <Stat icon={UserX} label="Absent Today" value={todayAbsent} tone="destructive" onClick={() => setOpenStat("absent")} />
        <Stat icon={Percent} label="Attendance %" value={`${pct}%`} onClick={() => setOpenStat("pct")} />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="history">Attendance History</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ClassLocationsManager classId={classId} />
            </div>
            <div className="card-lift space-y-3 rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Invite Details</h3>
              <CopyRow label="Class ID" value={cls.id} mono onCopy={() => copyTo(cls.id, "id")} copied={copied === "id"} />
              <CopyRow label="Password" value={password} mono onCopy={() => copyTo(password, "pw")} copied={copied === "pw"} />
              <Button variant="outline" className="w-full gap-2" onClick={copyInvite}>
                {copied === "invite" ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>} Copy Invite Details
              </Button>
              {(() => {
                const url = typeof window !== "undefined"
                  ? `${window.location.origin}/student/class/${cls.id}`
                  : `/student/class/${cls.id}`;
                return (
                  <div className="space-y-2 border-t border-border pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permanent Attendance Link</h4>
                    <CopyRow label="Link" value={url} onCopy={() => copyTo(url, "url")} copied={copied === "url"} />
                    <div className="grid place-items-center rounded-xl border border-border bg-white p-3">
                      <QRCodeSVG value={url} size={180} includeMargin={false} level="M" />
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                      Students scan or open this link → attendance is marked automatically when inside the radius.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        </TabsContent>

        {/* STUDENTS */}
        <TabsContent value="students">
          <div className="card-lift rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-4 w-4" /> Students ({students.length})</h3>
              <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full max-w-xs" />
            </div>
            {studentRows.length === 0 ? (
              <EmptyState text={`No students yet. Share Class ID ${cls.id} and password ${password}.`} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-2">Name</th><th>Email</th><th>Joined</th><th>%</th><th>Present</th><th>Absent</th><th>Last</th><th></th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                     {studentRows.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => navigate({ to: "/teacher/classes/$classId/student/$studentId", params: { classId, studentId: s.id } })}
                        className="cursor-pointer transition-colors hover:bg-accent/40"
                      >
                        <td className="py-2 font-medium">{s.name}</td>
                        <td className="text-muted-foreground">{s.email}</td>
                        <td>{new Date(s.joined_at).toLocaleDateString()}</td>
                        <td className={s.pct >= 75 ? "font-semibold text-success" : "font-semibold text-destructive"}>{s.pct}%</td>
                        <td>{s.present}</td>
                        <td>{s.absent}</td>
                        <td className="text-xs text-muted-foreground">{s.last ? new Date(s.last.created_at).toLocaleDateString() : "—"}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${s.name}`}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setRemoveStudent({ id: s.id, name: s.name }); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <div className="card-lift rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Radio className={`h-4 w-4 ${cls.active_session ? "animate-pulse text-success" : ""}`} />
                Attendance Records ({records.length})
              </h3>
              {cls.active_session && <span className="text-xs font-semibold text-success">● Live</span>}
            </div>
            {records.length === 0 ? <EmptyState text="No attendance recorded yet." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-2">Student</th><th>Date</th><th>Status</th><th>Time</th><th>Distance</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((r) => {
                      const d = new Date(r.created_at);
                      return (
                        <tr key={r.id} className="animate-in fade-in">
                          <td className="py-2">
                            <p className="font-medium">{r.profile?.name || "Student"}</p>
                            <p className="text-xs text-muted-foreground">{r.profile?.email}</p>
                          </td>
                          <td>{r.attendance_date || d.toLocaleDateString()}</td>
                          <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "present" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{r.status}</span></td>
                          <td>{d.toLocaleTimeString()}</td>
                          <td>{Math.round(r.distance)}m</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* CALENDAR */}
        <TabsContent value="calendar">
          <Calendar
            month={calMonth}
            onPrev={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()-1); setCalMonth(d); setSelectedDay(null); }}
            onNext={() => { const d = new Date(calMonth); d.setMonth(d.getMonth()+1); setCalMonth(d); setSelectedDay(null); }}
            dayMap={dayMap}
            students={students}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        </TabsContent>

        {/* ANALYTICS */}
        <TabsContent value="analytics">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-lift rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Attendance % — last 14 days</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }}/>
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }}/>
                  <Tooltip />
                  <Line type="monotone" dataKey="pct" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card-lift rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Present vs Absent (daily)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }}/>
                  <YAxis tick={{ fontSize: 11 }}/>
                  <Tooltip />
                  <Bar dataKey="present" fill="hsl(var(--primary))" />
                  <Bar dataKey="absent" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card-lift rounded-2xl border border-border bg-card p-5 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Overall Present vs Absent</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={[{ name: "Present", value: overall.present }, { name: "Absent", value: overall.absent }]}
                    dataKey="value" nameKey="name" outerRadius={90} label
                  >
                    <Cell fill="hsl(var(--primary))" />
                    <Cell fill="hsl(var(--destructive))" />
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* ATTENDANCE HISTORY */}
        <TabsContent value="history" className="space-y-4">
          <div className="card-lift rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <History className="h-4 w-4" /> Attendance History
            </h3>
            <AttendanceHistoryPanel students={students} records={records} />
          </div>
        </TabsContent>
      </Tabs>

      <StatDialog
        kind={openStat}
        onClose={() => setOpenStat(null)}
        students={students}
        records={records}
        search={statSearch}
        setSearch={setStatSearch}
        college={statCollege}
        setCollege={setStatCollege}
        sort={statSort}
        setSort={setStatSort}
        page={statPage}
        setPage={setStatPage}
        pctMonth={pctMonth}
        setPctMonth={setPctMonth}
      />
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone, onClick }: any) {
  const toneCls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary";
  const interactive = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`card-lift rounded-2xl border border-border bg-card p-5 text-left transition-all ${interactive ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" : ""}`}
    >
      <div className={`grid h-10 w-10 place-items-center rounded-xl bg-accent ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </button>
  );
}

function Info({ label, value, mono }: any) {
  return (
    <div className="flex gap-2">
      <span className="w-20 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono font-semibold" : "font-semibold"}>{value}</span>
    </div>
  );
}

function CopyRow({ label, value, mono, onCopy, copied }: any) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-0.5 truncate text-base font-bold ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
      <Button size="icon" variant="ghost" onClick={onCopy} aria-label={`Copy ${label}`}>
        {copied ? <Check className="h-4 w-4 text-primary"/> : <Copy className="h-4 w-4"/>}
      </Button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

const PAGE_SIZE = 10;

function StatDialog({
  kind, onClose, students, records,
  search, setSearch, college, setCollege, sort, setSort, page, setPage,
  pctMonth, setPctMonth,
}: any) {
  const open = kind !== null;
  const todayKey = istYmd(new Date());

  const colleges = Array.from(
    new Set((students as any[]).map((s) => (s.college || "").trim()).filter(Boolean)),
  ).sort();

  // Today's present records, latest first
  const todayPresentRecs = (records as any[])
    .filter((r) => r.status === "present" && (r.attendance_date || istYmd(new Date(r.created_at))) === todayKey)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const presentTimeById = new Map<string, string>();
  for (const r of todayPresentRecs) {
    if (!presentTimeById.has(r.student_id)) {
      presentTimeById.set(r.student_id, new Date(r.created_at).toLocaleTimeString());
    }
  }
  const presentIds = new Set(presentTimeById.keys());

  let base: any[] = [];
  if (kind === "total") base = students;
  else if (kind === "present") base = students.filter((s: any) => presentIds.has(s.id));
  else if (kind === "absent") base = students.filter((s: any) => !presentIds.has(s.id));

  const q = search.trim().toLowerCase();
  const filtered = base.filter((s) =>
    (!q || s.name.toLowerCase().includes(q)) &&
    (college === "all" || (s.college || "") === college),
  );
  const sorted = [...filtered].sort((a, b) =>
    sort === "joined"
      ? +new Date(b.joined_at) - +new Date(a.joined_at)
      : a.name.localeCompare(b.name),
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const title =
    kind === "total" ? "All Students"
    : kind === "present" ? "Present Today"
    : kind === "absent" ? "Absent Today"
    : kind === "pct" ? "Monthly Attendance %"
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "total" && `${students.length} enrolled student${students.length === 1 ? "" : "s"}.`}
            {kind === "present" && `${base.length} student${base.length === 1 ? "" : "s"} marked present today.`}
            {kind === "absent" && `${base.length} student${base.length === 1 ? "" : "s"} absent today.`}
            {kind === "pct" && "Daily attendance % for the selected month. Sundays are holidays."}
          </DialogDescription>
        </DialogHeader>

        {kind === "pct" ? (
          <PctMonth month={pctMonth} setMonth={setPctMonth} students={students} records={records} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full max-w-xs"
              />
              {colleges.length > 0 && (
                <Select value={college} onValueChange={(v) => { setCollege(v); setPage(1); }}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="College" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All colleges</SelectItem>
                    {colleges.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {kind === "total" && (
                <Select value={sort} onValueChange={(v: any) => setSort(v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Sort: Name</SelectItem>
                    <SelectItem value="joined">Sort: Joined Date</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {sorted.length === 0 ? (
              <EmptyState text="No students match these filters." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Name</th>
                      <th>Email</th>
                      <th>College</th>
                      {kind === "total" && <th>Joined</th>}
                      <th>Age</th>
                      {kind === "present" && <th>Time</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-2 font-medium">{s.name}</td>
                        <td className="text-muted-foreground">{s.email}</td>
                        <td>{s.college || "—"}</td>
                        {kind === "total" && <td>{new Date(s.joined_at).toLocaleDateString()}</td>}
                        <td>{s.age ?? "—"}</td>
                        {kind === "present" && <td>{presentTimeById.get(s.id) || "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="text-muted-foreground">Page {safePage} of {pageCount}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PctMonth({ month, setMonth, students, records }: any) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const total = (students as any[]).length;
  const todayKey = istYmd(new Date());

  // Group present by IST date
  const presentByDay = new Map<string, Set<string>>();
  for (const r of records as any[]) {
    if (r.status !== "present") continue;
    const key = r.attendance_date || istYmd(new Date(r.created_at));
    if (!presentByDay.has(key)) presentByDay.set(key, new Set());
    presentByDay.get(key)!.add(r.student_id);
  }

  const rows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, m, d);
    const key = ymdKey(year, m, d);
    const isSunday = dt.getDay() === 0;
    const isFuture = key > todayKey;
    const present = presentByDay.get(key)?.size ?? 0;
    const pct = total ? Math.round((present / total) * 100) : 0;
    rows.push({ key, dt, isSunday, isFuture, pct });
  }

  const label = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button variant="ghost" size="icon" onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Date</th><th>Attendance %</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2">
                  {r.dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td>
                  {r.isSunday ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Holiday</span>
                  ) : r.isFuture ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={r.pct >= 75 ? "font-semibold text-success" : "font-semibold text-destructive"}>{r.pct}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceHistoryDialog({
  open, onClose, students, records,
}: { open: boolean; onClose: () => void; students: any[]; records: any[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [monthFilter, setMonthFilter] = useState<string>("all"); // all | current | YYYY-MM
  const [statusFilter, setStatusFilter] = useState<"all" | "present" | "absent">("all");
  const [page, setPage] = useState(1);

  useEffect(() => { if (!open) { setQuery(""); setSelected(null); setMonthFilter("all"); setStatusFilter("all"); setPage(1); } }, [open]);
  useEffect(() => { setPage(1); }, [selected, monthFilter, statusFilter]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? students.filter((s) => s.name.toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q))
    : students;

  // Build attendance rows for selected student
  const studentRecs = selected
    ? records.filter((r) => r.student_id === selected.id)
    : [];
  const present = studentRecs.filter((r) => r.status === "present").length;
  const absent = studentRecs.filter((r) => r.status === "absent").length;
  const total = present + absent;
  const pct = total ? Math.round((present / total) * 100) : 0;

  // Past months derived from records
  const monthsSet = new Set<string>();
  for (const r of studentRecs) {
    const key = r.attendance_date || istYmd(new Date(r.created_at));
    monthsSet.add(key.slice(0, 7));
  }
  const monthOptions = Array.from(monthsSet).sort().reverse();
  const currentMonthKey = istYmd(new Date()).slice(0, 7);

  let filteredRecs = studentRecs;
  if (monthFilter === "current") {
    filteredRecs = filteredRecs.filter((r) => (r.attendance_date || istYmd(new Date(r.created_at))).startsWith(currentMonthKey));
  } else if (monthFilter !== "all") {
    filteredRecs = filteredRecs.filter((r) => (r.attendance_date || istYmd(new Date(r.created_at))).startsWith(monthFilter));
  }
  if (statusFilter !== "all") filteredRecs = filteredRecs.filter((r) => r.status === statusFilter);
  filteredRecs = [...filteredRecs].sort((a, b) => {
    const ad = a.attendance_date || istYmd(new Date(a.created_at));
    const bd = b.attendance_date || istYmd(new Date(b.created_at));
    return bd.localeCompare(ad);
  });

  const pageCount = Math.max(1, Math.ceil(filteredRecs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filteredRecs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attendance History</DialogTitle>
          <DialogDescription>Search for a student to view their complete attendance history.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search student by name or email…"
            className="pl-9"
          />
          {q && !selected && (
            <div className="mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover shadow-md">
              {matches.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No students match.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {matches.slice(0, 20).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => { setSelected(s); setQuery(s.name); }}
                        className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {!selected ? (
          <EmptyState text="Select a student to view attendance history." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.email}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setQuery(""); }}>Change student</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniStat label="Total Classes" value={total} />
              <MiniStat label="Present" value={present} tone="success" />
              <MiniStat label="Absent" value={absent} tone="destructive" />
              <MiniStat label="Attendance %" value={`${pct}%`} tone={pct >= 75 ? "success" : "destructive"} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  <SelectItem value="current">Current Month</SelectItem>
                  {monthOptions.filter((m) => m !== currentMonthKey).map((m) => (
                    <SelectItem key={m} value={m}>
                      {new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredRecs.length === 0 ? (
              <EmptyState text="No attendance records available for this student." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-2">Date</th><th>Day</th><th>Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map((r) => {
                      const ds = r.attendance_date || istYmd(new Date(r.created_at));
                      const d = parseYmdLocal(ds);
                      return (
                        <tr key={r.id}>
                          <td className="p-2">{d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td>
                          <td>{d.toLocaleDateString(undefined, { weekday: "long" })}</td>
                          <td>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "present" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                              {r.status === "present" ? "Present" : "Absent"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Page {safePage} of {pageCount}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: any; tone?: "success" | "destructive" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}

function buildTrend(records: any[], totalStudents: number) {
  const days: { day: string; present: number; absent: number; pct: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = istYmd(d);
    const dayRecs = records.filter((r) => (r.attendance_date || istYmd(new Date(r.created_at))) === key);
    const present = dayRecs.filter((r) => r.status === "present").length;
    const absent = dayRecs.filter((r) => r.status === "absent").length;
    const denom = totalStudents || (present + absent);
    days.push({ day: `${d.getMonth()+1}/${d.getDate()}`, present, absent, pct: denom ? Math.round((present / denom) * 100) : 0 });
  }
  return days;
}

function Calendar({ month, onPrev, onNext, dayMap, students, selectedDay, onSelectDay }: any) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: ({ date: string; day: number } | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: ymdKey(year, m, d), day: d });
  }
  const sel = selectedDay ? dayMap.get(selectedDay) : null;
  const dayPct = selectedDay && students.length
    ? Math.round(((sel?.present?.length ?? 0) / students.length) * 100) : 0;

  const idMap = new Map(students.map((s: any) => [s.id, s]));
  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card-lift rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={onPrev}><ChevronLeft className="h-4 w-4"/></Button>
          <h3 className="text-sm font-semibold">{monthLabel}</h3>
          <Button variant="ghost" size="icon" onClick={onNext}><ChevronRight className="h-4 w-4"/></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} className="py-1 font-semibold">{d}</div>)}
          {cells.map((c, i) => {
            if (!c) return <div key={i} />;
            const data = dayMap.get(c.date);
            const isSel = selectedDay === c.date;
            const has = data && (data.present.length || data.absent.length);
            return (
              <button
                key={i}
                onClick={() => onSelectDay(c.date)}
                className={`relative aspect-square rounded-md text-sm transition-colors ${isSel ? "bg-primary text-primary-foreground" : has ? "bg-accent text-foreground hover:bg-accent/70" : "hover:bg-muted"}`}
              >
                {c.day}
                {has && !isSel && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card-lift rounded-2xl border border-border bg-card p-5">
        {!selectedDay ? (
          <EmptyState text="Select a date to see attendance." />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{parseYmdLocal(selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h3>
              <span className={`text-sm font-bold ${dayPct >= 75 ? "text-success" : "text-destructive"}`}>{dayPct}%</span>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-success">Present ({sel?.present.length ?? 0})</p>
                <ul className="space-y-1">
                  {(sel?.present ?? []).map((r: any) => <li key={r.id}>{(idMap.get(r.student_id) as any)?.name || r.profile?.name || "Student"}</li>)}
                  {!(sel?.present.length) && <li className="text-muted-foreground">None</li>}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-destructive">Absent ({sel?.absent.length ?? 0})</p>
                <ul className="space-y-1">
                  {(sel?.absent ?? []).map((r: any) => <li key={r.id}>{(idMap.get(r.student_id) as any)?.name || r.profile?.name || "Student"}</li>)}
                  {!(sel?.absent.length) && <li className="text-muted-foreground">None</li>}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
