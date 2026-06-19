import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlusCircle, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/teacher/classes/")({
  component: ClassesList,
});

function ClassesList() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("classes").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { setClasses(data ?? []); setLoading(false); });
  }, [user]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Classes</h1>
          <p className="mt-1 text-muted-foreground">Manage and run sessions for your classes.</p>
        </div>
        <Link to="/teacher/create"><Button className="gap-2"><PlusCircle className="h-4 w-4" /> New class</Button></Link>
      </div>

      {loading ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : classes.length === 0 ? (
        <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-border p-16 text-center">
          <div className="text-5xl">🎓</div>
          <p className="mt-3 text-lg font-semibold">No classes yet</p>
          <p className="text-sm text-muted-foreground">Create your first geofenced class.</p>
          <Link to="/teacher/create" className="mt-4">
            <Button className="gap-2"><PlusCircle className="h-4 w-4" /> Create class</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} to="/teacher/classes/$classId" params={{ classId: c.id }}>
              <div className="card-lift h-full rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">ID · {c.id}</p>
                    <h3 className="mt-1 text-lg font-bold">{c.name}</h3>
                    <p className="text-sm text-muted-foreground">{c.subject || "—"} · {c.section || "—"}</p>
                  </div>
                  {c.active_session && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-[10px] font-bold uppercase text-success">
                      <Radio className="h-3 w-3 animate-pulse" /> Live
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Radius {c.radius}m</span>
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
