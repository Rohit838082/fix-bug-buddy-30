import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { myPlan } from "@/lib/admin.functions";

export const Route = createFileRoute("/teacher/billing")({
  head: () => ({ meta: [{ title: "Billing · GeoPresent" }] }),
  component: TeacherBilling,
});

function fmtLimit(n: number) {
  return n < 0 ? "Unlimited" : String(n);
}

function TeacherBilling() {
  const run = useServerFn(myPlan);
  const { data, isLoading } = useQuery({
    queryKey: ["my-plan"],
    queryFn: () => run(),
  });
  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const currentId = data?.plan?.id ?? "free";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & plan</h1>
        <p className="mt-1 text-muted-foreground">Your current plan, usage, and what each tier includes.</p>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}

      {data && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</div>
              <div className="mt-1 text-2xl font-bold">{data.plan?.name ?? "Free"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Classes used</div>
              <div className="mt-1 text-2xl font-bold">
                {data.usage.classes} / {fmtLimit(data.plan?.max_classes ?? 0)}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            To upgrade or downgrade, contact your admin. Online checkout is coming soon.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p: any) => {
          const isCurrent = p.id === currentId;
          return (
            <div key={p.id} className={`rounded-2xl border p-6 shadow-[var(--shadow-card)] ${
              isCurrent ? "border-primary bg-card ring-2 ring-primary/40" : "border-border bg-card"
            }`}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div>
                  <span className="text-3xl font-bold">${(p.price_cents / 100).toFixed(0)}</span>
                  <span className="text-sm text-muted-foreground">/{p.interval}</span>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              <ul className="mt-5 space-y-2 text-sm">
                <Row label="Active classes" value={fmtLimit(p.max_classes)} />
                <Row label="Students / class" value={fmtLimit(p.max_students_per_class)} />
                <Row label="Locations / class" value={fmtLimit(p.max_locations_per_class)} />
                <Row label="CSV export" bool={p.csv_export} />
                <Row label="Priority support" bool={p.priority_support} />
              </ul>
              {isCurrent && (
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4" /> Your current plan
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value, bool }: { label: string; value?: string; bool?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {value !== undefined
        ? <span className="font-semibold">{value}</span>
        : bool ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground" />}
    </li>
  );
}
