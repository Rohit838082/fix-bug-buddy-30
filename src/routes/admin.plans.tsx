import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/plans")({
  component: AdminPlans,
});

const CURRENCIES: Record<string, { symbol: string; label: string }> = {
  usd: { symbol: "$", label: "USD ($)" },
  inr: { symbol: "₹", label: "INR (₹)" },
  eur: { symbol: "€", label: "EUR (€)" },
  gbp: { symbol: "£", label: "GBP (£)" },
};

function symbolOf(cur: string) {
  return CURRENCIES[cur?.toLowerCase()]?.symbol ?? "$";
}

function fmtLimit(n: number) {
  return n < 0 ? "Unlimited" : String(n);
}

function AdminPlans() {
  const qc = useQueryClient();
  const [billing, setBilling] = useState<"month" | "year">("month");
  const [editing, setEditing] = useState<any | null>(null);

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
      <PaymentQrSettings />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
          <p className="mt-1 text-muted-foreground">
            Edit pricing, currency, and limits. Limits are enforced by the database.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setBilling("month")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              billing === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("year")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              billing === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p: any) => {
          const sym = symbolOf(p.currency);
          const cents = billing === "year" ? p.price_cents_yearly ?? 0 : p.price_cents;
          return (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="text-right">
                  <span className="text-3xl font-bold">{sym}{(cents / 100).toFixed(0)}</span>
                  <span className="text-sm text-muted-foreground">/{billing}</span>
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
              <Button
                variant="outline"
                className="mt-5 w-full"
                onClick={() => setEditing(p)}
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit plan
              </Button>
            </div>
          );
        })}
      </div>

      <EditPlanDialog
        plan={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["plans"] });
        }}
      />
    </div>
  );
}

function EditPlanDialog({
  plan,
  onClose,
  onSaved,
}: {
  plan: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Reset form when plan changes
  if (plan && (!form || form.id !== plan.id)) {
    setForm({
      id: plan.id,
      name: plan.name,
      description: plan.description ?? "",
      currency: plan.currency ?? "usd",
      price_monthly: ((plan.price_cents ?? 0) / 100).toString(),
      price_yearly: ((plan.price_cents_yearly ?? 0) / 100).toString(),
      max_classes: String(plan.max_classes),
      max_students_per_class: String(plan.max_students_per_class),
      max_locations_per_class: String(plan.max_locations_per_class),
      csv_export: !!plan.csv_export,
      priority_support: !!plan.priority_support,
    });
  }

  if (!plan || !form) {
    return (
      <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("subscription_plans")
      .update({
        name: form.name,
        description: form.description,
        currency: form.currency,
        price_cents: Math.round(parseFloat(form.price_monthly || "0") * 100),
        price_cents_yearly: Math.round(parseFloat(form.price_yearly || "0") * 100),
        max_classes: parseInt(form.max_classes, 10),
        max_students_per_class: parseInt(form.max_students_per_class, 10),
        max_locations_per_class: parseInt(form.max_locations_per_class, 10),
        csv_export: form.csv_export,
        priority_support: form.priority_support,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plan updated");
    setForm(null);
    onSaved();
  };

  return (
    <Dialog
      open={!!plan}
      onOpenChange={(o) => {
        if (!o) {
          setForm(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {plan.name} plan</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Monthly ({symbolOf(form.currency)})</Label>
              <Input
                type="number" min="0" step="0.01"
                value={form.price_monthly}
                onChange={(e) => set("price_monthly", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Yearly ({symbolOf(form.currency)})</Label>
              <Input
                type="number" min="0" step="0.01"
                value={form.price_yearly}
                onChange={(e) => set("price_yearly", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Max classes</Label>
              <Input type="number" value={form.max_classes} onChange={(e) => set("max_classes", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Students / class</Label>
              <Input type="number" value={form.max_students_per_class} onChange={(e) => set("max_students_per_class", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Locations / class</Label>
              <Input type="number" value={form.max_locations_per_class} onChange={(e) => set("max_locations_per_class", e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Tip: use -1 for unlimited.</p>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label>CSV export</Label>
            <Switch checked={form.csv_export} onCheckedChange={(v) => set("csv_export", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label>Priority support</Label>
            <Switch checked={form.priority_support} onCheckedChange={(v) => set("priority_support", v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setForm(null); onClose(); }}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentQrSettings() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [instructions, setInstructions] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings" as any).select("*").eq("id", 1).maybeSingle();
      const s = data as any;
      setInstructions(s?.payment_instructions ?? "");
      return s;
    },
  });
  const { data: qrSignedUrl } = useQuery({
    queryKey: ["qr-signed", settings?.payment_qr_url],
    enabled: !!settings?.payment_qr_url,
    queryFn: async () => {
      const path = settings.payment_qr_url as string;
      // path may already be a public/signed URL (legacy); only sign if it looks like a storage path
      if (path.startsWith("http")) return path;
      const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60 * 60 * 24);
      return data?.signedUrl ?? null;
    },
  });

  const uploadQr = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `admin/qr-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("payment-proofs").upload(path, file, {
        contentType: file.type, upsert: true,
      });
      if (error) throw error;
      const { error: uerr } = await supabase
        .from("app_settings" as any)
        .update({ payment_qr_url: path, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (uerr) throw uerr;
      toast.success("QR updated");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveInstructions = async () => {
    const { error } = await supabase
      .from("app_settings" as any)
      .update({ payment_instructions: instructions, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Instructions saved");
    qc.invalidateQueries({ queryKey: ["app-settings"] });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-lg font-bold">Payment QR</h2>
      <p className="text-sm text-muted-foreground">
        Shown to teachers when they click Purchase. Upload your UPI/PayPal QR image and optional instructions.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-[200px,1fr]">
        <div className="flex flex-col items-center gap-2">
          {qrSignedUrl ? (
            <img src={qrSignedUrl} alt="Payment QR" className="h-44 w-44 rounded-md border border-border bg-white object-contain p-2" />
          ) : (
            <div className="grid h-44 w-44 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
              No QR uploaded
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadQr(f);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : qrSignedUrl ? "Replace QR" : "Upload QR"}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Payment instructions (optional)</Label>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-background p-2 text-sm"
            placeholder="e.g. Pay using UPI ID xyz@oksbi, then upload the screenshot below."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <div>
            <Button onClick={saveInstructions} size="sm">Save instructions</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
