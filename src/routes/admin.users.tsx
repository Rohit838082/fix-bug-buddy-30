import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Search, MoreVertical, ShieldOff, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminListUsers, adminSetUserRole, adminSetUserStatus, adminDeleteUser, adminSetPlan,
} from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

const ROLES = ["student", "teacher", "admin"] as const;
const PLANS = ["free", "pro", "business"];

function AdminUsers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(adminListUsers);
  const setRole = useServerFn(adminSetUserRole);
  const setStatus = useServerFn(adminSetUserStatus);
  const setPlan = useServerFn(adminSetPlan);
  const delUser = useServerFn(adminDeleteUser);

  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => list({ data: { search } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const toggleRole = async (uid: string, role: (typeof ROLES)[number], has: boolean) => {
    try {
      await setRole({ data: { target_user_id: uid, role, add: !has } });
      toast.success(`Role ${has ? "removed" : "added"}`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleStatus = async (uid: string, current: string) => {
    const next = current === "suspended" ? "active" : "suspended";
    try {
      await setStatus({ data: { target_user_id: uid, status: next } });
      toast.success(`User ${next}`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const changePlan = async (uid: string, plan_id: string) => {
    try {
      await setPlan({ data: { target_user_id: uid, plan_id, status: "active" } });
      toast.success(`Plan changed to ${plan_id}`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await delUser({ data: { target_user_id: pendingDelete } });
      toast.success("User deleted");
      setPendingDelete(null);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-muted-foreground">{users?.length ?? 0} users · search, change role, change plan, suspend or delete.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Roles</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && <span className="text-xs text-muted-foreground">No role</span>}
                    {u.roles.map((r) => (
                      <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.plan_id}
                    onChange={(e) => changePlan(u.id, e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.account_status === "suspended"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {u.account_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Roles</DropdownMenuLabel>
                      {ROLES.map((r) => {
                        const has = u.roles.includes(r);
                        return (
                          <DropdownMenuItem key={r} onClick={() => toggleRole(u.id, r, has)}>
                            <UserCog className="h-4 w-4" />
                            {has ? `Remove ${r}` : `Make ${r}`}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toggleStatus(u.id, u.account_status)}>
                        {u.account_status === "suspended"
                          ? <><ShieldCheck className="h-4 w-4" /> Unsuspend</>
                          : <><ShieldOff className="h-4 w-4" /> Suspend</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={u.id === user?.id}
                        onClick={() => setPendingDelete(u.id)}
                      >
                        <Trash2 className="h-4 w-4" /> Delete user
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {users?.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their account, profile, classes they own, and all attendance data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
