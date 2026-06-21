import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adminListTeacherRequests, adminDecideTeacherRequest } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/teacher-requests")({
  component: AdminTeacherRequests,
});

function AdminTeacherRequests() {
  const qc = useQueryClient();
  const list = useServerFn(adminListTeacherRequests);
  const decide = useServerFn(adminDecideTeacherRequest);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-teacher-requests"],
    queryFn: () => list(),
  });

  const onDecide = async (id: string, decision: "approved" | "rejected") => {
    try {
      await decide({ data: { request_id: id, decision } });
      toast.success(`Request ${decision}`);
      qc.invalidateQueries({ queryKey: ["admin-teacher-requests"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = (data ?? []).filter((r) => r.status === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teacher requests</h1>
        <p className="mt-1 text-muted-foreground">Approve or reject teacher access requests in one click.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({(data ?? []).filter((r) => r.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Requested</th>
                  <th className="px-4 py-3 text-left">Decided</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{r.user_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.user_email}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.decided_at ? new Date(r.decided_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="gap-1" onClick={() => onDecide(r.id, "approved")}>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => onDecide(r.id, "rejected")}>
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className={`text-xs font-medium ${
                          r.status === "approved" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                        }`}>{r.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nothing here.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
