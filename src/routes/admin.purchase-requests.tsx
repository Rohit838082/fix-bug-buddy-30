import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { adminListPurchaseRequests, adminDecidePurchaseRequest } from "@/lib/purchase.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/purchase-requests")({
  component: AdminPurchaseRequests,
});

const SYM: Record<string, string> = { usd: "$", inr: "₹", eur: "€", gbp: "£" };

function AdminPurchaseRequests() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPurchaseRequests);
  const decide = useServerFn(adminDecidePurchaseRequest);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [decideFor, setDecideFor] = useState<{ req: any; action: "approved" | "rejected" } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-purchase-requests"],
    queryFn: () => list(),
  });

  const rows = (data ?? []).filter((r: any) => (filter === "all" ? true : r.status === "pending"));

  const submitDecision = async () => {
    if (!decideFor) return;
    setBusy(true);
    try {
      await decide({
        data: { request_id: decideFor.req.id, decision: decideFor.action, notes: notes || undefined },
      });
      toast.success(`Request ${decideFor.action}`);
      setDecideFor(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["admin-purchase-requests"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase requests</h1>
          <p className="mt-1 text-muted-foreground">
            Review payment screenshots from teachers and approve or reject their plan purchase.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setFilter("pending")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              filter === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              filter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No {filter === "pending" ? "pending" : ""} requests.
        </div>
      )}

      <div className="grid gap-4">
        {rows.map((r: any) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold">{r.profile?.name ?? "Unknown"}</div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-sm text-muted-foreground">{r.profile?.email}</div>
                <div className="text-sm">
                  Wants <b>{r.plan?.name ?? r.plan_id}</b> · {r.billing_interval}ly ·{" "}
                  <b>{SYM[r.currency] ?? "$"}{(r.amount_cents / 100).toFixed(2)}</b>
                </div>
                <div className="text-xs text-muted-foreground">
                  Submitted {new Date(r.created_at).toLocaleString()}
                  {r.decided_at && <> · Decided {new Date(r.decided_at).toLocaleString()}</>}
                </div>
                {r.admin_notes && (
                  <div className="text-xs text-muted-foreground">Notes: {r.admin_notes}</div>
                )}
              </div>
              {r.screenshot_signed_url && (
                <a href={r.screenshot_signed_url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={r.screenshot_signed_url}
                    alt="Payment screenshot"
                    className="h-28 w-28 rounded-md border border-border object-cover hover:opacity-80"
                  />
                </a>
              )}
            </div>
            {r.status === "pending" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => { setDecideFor({ req: r, action: "approved" }); setNotes(""); }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setDecideFor({ req: r, action: "rejected" }); setNotes(""); }}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
                {r.screenshot_signed_url && (
                  <Button variant="ghost" asChild>
                    <a href={r.screenshot_signed_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" /> Open screenshot
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!decideFor} onOpenChange={(o) => !o && setDecideFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideFor?.action === "approved" ? "Approve purchase" : "Reject purchase"}
            </DialogTitle>
            <DialogDescription>
              {decideFor?.action === "approved"
                ? "The user will immediately get access to this plan's benefits."
                : "The user will be notified the request was rejected."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Optional notes for the user…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideFor(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitDecision} disabled={busy}>
              {busy ? "Saving…" : (decideFor?.action === "approved" ? "Approve" : "Reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
  if (status === "rejected")
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-600"><XCircle className="h-3 w-3" /> Rejected</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600"><Clock className="h-3 w-3" /> Pending</span>;
}
