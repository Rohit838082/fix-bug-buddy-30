import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Sparkles, X, Upload, Clock, QrCode } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { myPlan } from "@/lib/admin.functions";
import { getMyScreenshotUrl } from "@/lib/purchase.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/billing")({
  head: () => ({ meta: [{ title: "Billing · GeoPresent" }] }),
  component: TeacherBilling,
});

const CURRENCY_SYMBOL: Record<string, string> = {
  usd: "$", inr: "₹", eur: "€", gbp: "£",
};
const sym = (c?: string) => CURRENCY_SYMBOL[(c ?? "usd").toLowerCase()] ?? "$";

function fmtLimit(n: number) {
  return n < 0 ? "Unlimited" : String(n);
}

function TeacherBilling() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const run = useServerFn(myPlan);
  const [billing, setBilling] = useState<"month" | "year">("month");
  const [purchasing, setPurchasing] = useState<{ plan: any; interval: "month" | "year" } | null>(null);

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
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings" as any).select("*").eq("id", 1).maybeSingle();
      return data as any;
    },
  });
  const { data: myRequests } = useQuery({
    queryKey: ["my-purchase-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const currentId = data?.plan?.id ?? "free";
  const pendingByPlan = new Map<string, any>();
  for (const r of myRequests ?? []) {
    if (r.status === "pending" && !pendingByPlan.has(r.plan_id)) pendingByPlan.set(r.plan_id, r);
  }
  const latestPending = (myRequests ?? []).find((r: any) => r.status === "pending");

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
          {latestPending && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Waiting for admin approval</div>
                <div className="text-xs">
                  Your purchase request for{" "}
                  <b>{(plans ?? []).find((p: any) => p.id === latestPending.plan_id)?.name ?? latestPending.plan_id}</b>{" "}
                  ({latestPending.billing_interval}ly) was submitted on{" "}
                  {new Date(latestPending.created_at).toLocaleString()}.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setBilling("month")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              billing === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("year")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              billing === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p: any) => {
          const isCurrent = p.id === currentId;
          const cents = billing === "year" ? p.price_cents_yearly ?? 0 : p.price_cents;
          const pending = pendingByPlan.get(p.id);
          const isFree = (p.price_cents ?? 0) === 0 && (p.price_cents_yearly ?? 0) === 0;
          return (
            <div key={p.id} className={`flex flex-col rounded-2xl border p-6 shadow-[var(--shadow-card)] ${
              isCurrent ? "border-primary bg-card ring-2 ring-primary/40" : "border-border bg-card"
            }`}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div>
                  <span className="text-3xl font-bold">{sym(p.currency)}{(cents / 100).toFixed(0)}</span>
                  <span className="text-sm text-muted-foreground">/{billing}</span>
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
              <div className="mt-5 flex-1" />
              {isCurrent ? (
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4" /> Your current plan
                </div>
              ) : pending ? (
                <Button variant="outline" className="mt-5 w-full" disabled>
                  <Clock className="mr-2 h-4 w-4" /> Awaiting approval
                </Button>
              ) : isFree ? null : (
                <Button
                  className="mt-5 w-full"
                  onClick={() => setPurchasing({ plan: p, interval: billing })}
                >
                  Purchase
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <PurchaseDialog
        info={purchasing}
        qrUrl={settings?.payment_qr_url}
        instructions={settings?.payment_instructions}
        onClose={() => setPurchasing(null)}
        onSubmitted={() => {
          setPurchasing(null);
          qc.invalidateQueries({ queryKey: ["my-purchase-requests"] });
        }}
      />
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

function PurchaseDialog({
  info,
  qrUrl,
  instructions,
  onClose,
  onSubmitted,
}: {
  info: { plan: any; interval: "month" | "year" } | null;
  qrUrl?: string | null;
  instructions?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = !!info;
  const plan = info?.plan;
  const interval = info?.interval ?? "month";
  const cents = plan
    ? interval === "year"
      ? plan.price_cents_yearly ?? 0
      : plan.price_cents
    : 0;

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = (f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("File too large. Max 5MB.");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!user || !plan || !file) return;
    setSubmitting(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("purchase_requests" as any).insert({
        user_id: user.id,
        plan_id: plan.id,
        billing_interval: interval,
        amount_cents: cents,
        currency: plan.currency ?? "usd",
        screenshot_url: path,
        status: "pending",
      });
      if (insErr) throw insErr;
      toast.success("Request submitted — waiting for admin approval.");
      reset();
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message ?? "Could not submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Purchase {plan?.name} ({interval}ly)</DialogTitle>
          <DialogDescription>
            Pay <b>{sym(plan?.currency)}{(cents / 100).toFixed(2)}</b> using the QR
            below, then upload a screenshot of the payment for admin approval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="Payment QR"
                className="mx-auto h-48 w-48 rounded-md object-contain bg-white p-2"
              />
            ) : (
              <div className="mx-auto flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-muted-foreground">
                <QrCode className="h-10 w-10" />
                <span className="text-xs">QR not configured yet. Contact admin.</span>
              </div>
            )}
            {instructions && (
              <p className="mt-3 text-xs text-muted-foreground whitespace-pre-line">{instructions}</p>
            )}
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {previewUrl ? (
              <div className="space-y-2">
                <img src={previewUrl} alt="Screenshot preview" className="mx-auto max-h-56 rounded-md border border-border" />
                <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Change screenshot
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Upload payment screenshot
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!file || submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
