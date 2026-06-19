import { useState, useEffect } from "react";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZE = 10;

function istYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function parseYmdLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function AttendanceHistoryPanel({ students, records }: { students: any[]; records: any[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "present" | "absent">("all");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [selected, monthFilter, statusFilter]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? students.filter((s) => s.name.toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q))
    : students;

  const studentRecs = selected
    ? records.filter((r) => r.student_id === selected.id)
    : [];
  const present = studentRecs.filter((r) => r.status === "present").length;
  const absent = studentRecs.filter((r) => r.status === "absent").length;
  const total = present + absent;
  const pct = total ? Math.round((present / total) * 100) : 0;

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
    <div className="space-y-4">
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
        <div className="grid place-items-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Select a student to view attendance history.
        </div>
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
            <div className="grid place-items-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No attendance records available for this student.
            </div>
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
    </div>
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
