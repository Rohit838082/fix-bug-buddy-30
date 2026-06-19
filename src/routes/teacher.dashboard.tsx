import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, BookOpen, CalendarCheck, TrendingUp, Sparkles, PlusCircle } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/teacher/dashboard")({
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ classes: 0, students: 0, todayPresent: 0, avgPct: 0 });
  const [weekly, setWeekly] = useState<{ day: string; present: number }[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: cls } = await supabase.from("classes").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });
      const classList = cls ?? [];
      setClasses(classList);
      const classIds = classList.map((c) => c.id);
      let studentCount = 0;
      let todayPresent = 0;
      let avgPct = 0;
      let weekData: { day: string; present: number }[] = [];

      if (classIds.length) {
        const { count: scount } = await supabase
          .from("class_students")
          .select("student_id", { count: "exact", head: true })
          .in("class_id", classIds);
        studentCount = scount ?? 0;

        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const { count: tp } = await supabase
          .from("attendance_records")
          .select("id", { count: "exact", head: true })
          .in("class_id", classIds)
          .eq("status", "present")
          .gte("created_at", startOfToday.toISOString());
        todayPresent = tp ?? 0;

        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0, 0, 0, 0);
        const { data: recs } = await supabase
          .from("attendance_records")
          .select("status,created_at")
          .in("class_id", classIds)
          .gte("created_at", weekAgo.toISOString());
        const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        const counts: Record<string, number> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          counts[d.toDateString()] = 0;
        }
        recs?.forEach((r) => {
          if (r.status !== "present") return;
          const k = new Date(r.created_at).toDateString();
          if (k in counts) counts[k]++;
        });
        weekData = Object.entries(counts).map(([k, v]) => ({
          day: days[new Date(k).getDay()],
          present: v,
        }));

        const totalPresent = (recs ?? []).filter((r) => r.status === "present").length;
        const total = recs?.length ?? 0;
        avgPct = total > 0 ? Math.round((totalPresent / total) * 100) : 0;
      }

      setStats({ classes: classList.length, students: studentCount, todayPresent, avgPct });
      setWeekly(weekData);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Main</h1>
          <p className="mt-1 text-muted-foreground">Quick snapshot of your classes today.</p>
        </div>
        <Link to="/teacher/create">
          <Button className="gap-2"><PlusCircle className="h-4 w-4" /> Create class</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={BookOpen} label="Total Classes" value={stats.classes} />
        <StatCard icon={Users} label="Total Students" value={stats.students} />
        <StatCard icon={CalendarCheck} label="Today's Attendance" value={stats.todayPresent} />
        <StatCard icon={TrendingUp} label="Avg Attendance %" value={`${stats.avgPct}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-lift rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold">Weekly Attendance</h3>
          <p className="text-sm text-muted-foreground">Present check-ins for the last 7 days.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="present" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-lift rounded-2xl border border-border gradient-hero p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider opacity-90">AI Insights</span>
          </div>
          <h3 className="mt-3 text-xl font-bold">Coming soon</h3>
          <p className="mt-2 text-sm opacity-90">
            Smart insights will surface trends, at-risk students and weekly summaries automatically.
          </p>
        </div>
      </div>

      <div className="card-lift rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Active Classes</h3>
          <Link to="/teacher/classes"><Button variant="ghost" size="sm">View all</Button></Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : classes.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-border">
            {classes.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.subject} · {c.section || "—"} · ID: {c.id}</p>
                </div>
                <Link to="/teacher/classes/$classId" params={{ classId: c.id }}>
                  <Button variant="outline" size="sm">Open</Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: any) {
  return (
    <div className="card-lift rounded-2xl border border-border bg-card p-5">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Empty() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border p-10 text-center">
      <div className="text-4xl">📚</div>
      <p className="mt-2 font-medium">No classes yet</p>
      <p className="text-sm text-muted-foreground">Create your first class to start tracking attendance.</p>
      <Link to="/teacher/create" className="mt-4">
        <Button className="gap-2"><PlusCircle className="h-4 w-4" /> Create class</Button>
      </Link>
    </div>
  );
}
