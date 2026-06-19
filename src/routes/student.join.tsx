import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/student/join")({ component: Join });

function Join() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classId, setClassId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cid = classId.trim().toUpperCase();
    if (cid.length !== 6) return toast.error("Class ID must be 6 characters.");
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("join_class", {
      _class_id: cid,
      _password: password.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) return toast.error(row?.message ?? "Could not join class.");
    toast.success("Joined class!");
    navigate({ to: "/student/classes" });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Join a Class</h1>
      <form onSubmit={onJoin} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <Label>Class ID</Label>
          <Input
            value={classId}
            onChange={(e) => setClassId(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            className="font-mono text-lg uppercase tracking-widest"
            maxLength={6}
            required
          />
        </div>
        <div>
          <Label>Password</Label>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Joining…" : "Join class"}</Button>
      </form>
    </div>
  );
}
