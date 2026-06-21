import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { adminListSubscriptions, adminSetPlan } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/subscriptions")({
  component: AdminSubscriptions,
});

const PLANS = ["free", "pro", "business"];
const STATUSES = ["active", "trialing", "past_due", "canceled"];

function AdminSubscriptions() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSubscriptions);
  const setPlan = useServerFn(adminSetPlan);
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => list(),
  });

  const update = async (uid: string, plan_id: string, status: any) => {
    try {
      await setPlan({ data: { target_user_id: uid, plan_id, status } });
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = (data ?? []).filter((s) =>
    (filterPlan === "all" || s.plan_id === filterPlan) &&
    (filterStatus === "all" || s.status === filterStatus),
  );

  const paying = (data ?? []).filter((s) => s.plan_id !== "free" && s.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-muted-foreground">
          {data?.length ?? 0} subscriptions · {paying.length} paying teachers.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All plans</option>
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Renews</th>
              <th className="px-4 py-3 text-left">Since</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {filtered.map((s: any) => (
              <tr key={s.user_id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.profile?.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{s.profile?.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select value={s.plan_id} onChange={(e) => update(s.user_id, e.target.value, s.status)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select value={s.status} onChange={(e) => update(s.user_id, s.plan_id, e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                    {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No subscriptions yet. Teachers default to the Free plan on their first action.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
