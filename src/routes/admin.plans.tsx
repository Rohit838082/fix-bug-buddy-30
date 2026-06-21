import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/plans")({
  component: AdminPlans,
});

function fmtLimit(n: number) {
  return n < 0 ? "Unlimited" : String(n);
}

function AdminPlans() {
  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
        <p className="mt-1 text-muted-foreground">Read-only catalog. Limits are enforced on every insert by the database.</p>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p: any) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-bold">{p.name}</h3>
              <div>
                <span className="text-3xl font-bold">${(p.price_cents / 100).toFixed(0)}</span>
                <span className="text-sm text-muted-foreground">/{p.interval}</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Active classes</span>
                <span className="font-semibold">{fmtLimit(p.max_classes)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Students / class</span>
                <span className="font-semibold">{fmtLimit(p.max_students_per_class)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Locations / class</span>
                <span className="font-semibold">{fmtLimit(p.max_locations_per_class)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">CSV export</span>
                {p.csv_export ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground" />}
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Priority support</span>
                {p.priority_support ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground" />}
              </li>
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
