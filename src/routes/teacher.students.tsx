import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/teacher/students")({ component: Students });

function Students() {
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: cls } = await supabase.from("classes").select("id").eq("teacher_id", user.id);
      const ids = (cls ?? []).map((c) => c.id);
      if (!ids.length) return setList([]);
      const { data: enroll } = await supabase.from("class_students").select("student_id, class_id").in("class_id", ids);
      const counts = new Map<string, number>();
      (enroll ?? []).forEach((e) => counts.set(e.student_id, (counts.get(e.student_id) ?? 0) + 1));
      const sids = Array.from(counts.keys());
      if (!sids.length) return setList([]);
      const { data: profs } = await supabase.from("profiles").select("id,name,email").in("id", sids);
      setList((profs ?? []).map((p) => ({ ...p, classes: counts.get(p.id) ?? 0 })));
    })();
  }, [user]);

  const filtered = list.filter((s) =>
    s.name?.toLowerCase().includes(q.toLowerCase()) || s.email?.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Students</h1>
        <p className="mt-1 text-muted-foreground">All students across your classes.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or email" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="text-4xl">👥</div>
          <p className="mt-3 font-semibold">No students yet</p>
          <p className="text-sm text-muted-foreground">Share your class IDs to get started.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {filtered.map((s) => (
              <li key={s.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.email}</p>
                </div>
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">
                  {s.classes} class{s.classes === 1 ? "" : "es"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
