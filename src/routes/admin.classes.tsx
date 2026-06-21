import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { adminListClasses } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/classes")({
  component: AdminClasses,
});

function AdminClasses() {
  const list = useServerFn(adminListClasses);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-classes"],
    queryFn: () => list(),
  });

  const filtered = (data ?? []).filter((c: any) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name?.toLowerCase().includes(q) ||
      c.id?.toLowerCase().includes(q) ||
      c.teacher?.email?.toLowerCase().includes(q) ||
      c.teacher?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
        <p className="mt-1 text-muted-foreground">{data?.length ?? 0} classes across all teachers.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search class, ID, teacher…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Class</th>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Teacher</th>
              <th className="px-4 py-3 text-left">Students</th>
              <th className="px-4 py-3 text-left">Present today</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {filtered.map((c: any) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{[c.subject, c.section].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{c.id}</td>
                <td className="px-4 py-3">
                  <div>{c.teacher?.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{c.teacher?.email}</div>
                </td>
                <td className="px-4 py-3">{c.students}</td>
                <td className="px-4 py-3">{c.today_present}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No classes match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
