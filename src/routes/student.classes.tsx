import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio, PlusSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/student/classes")({ component: SClasses });

function SClasses() {
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: enroll } = await supabase.from("class_students").select("class_id").eq("student_id", user.id);
      const ids = (enroll ?? []).map(e => e.class_id);
      if (!ids.length) return setList([]);
      const { data: cls } = await supabase.from("classes").select("*").in("id", ids);
      const teacherIds = Array.from(new Set((cls ?? []).map(c => c.teacher_id)));
      const { data: profs } = teacherIds.length ? await supabase.from("profiles").select("id,name").in("id", teacherIds) : { data: [] as any[] };
      const profMap = new Map((profs ?? []).map(p => [p.id, p.name]));
      setList((cls ?? []).map(c => ({ ...c, teacher: profMap.get(c.teacher_id) || "Teacher" })));
    })();
  }, [user]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Classes</h1>
      {list.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border p-10 text-center">
          <div className="text-4xl">🎒</div>
          <p className="mt-2 font-semibold">No classes joined</p>
          <Link to="/student/join" className="mt-3"><Button className="gap-2"><PlusSquare className="h-4 w-4"/>Join a class</Button></Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map(c => (
            <li key={c.id}>
              <Link to="/student/class/$classId" params={{ classId: c.id }}>
                <div className="card-lift rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.subject || "—"} · {c.teacher}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${c.active_session ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                      <Radio className={`h-3 w-3 ${c.active_session ? "animate-pulse" : ""}`} /> {c.active_session ? "Live" : "Idle"}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
