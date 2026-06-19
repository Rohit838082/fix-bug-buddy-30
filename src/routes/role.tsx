import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { GraduationCap, UserCog, MapPin, ArrowLeft, Clock, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { requestTeacherAccess } from "@/lib/teacher-request.functions";

type ReqStatus = "pending" | "approved" | "rejected" | null;

export const Route = createFileRoute("/role")({
  head: () => ({ meta: [{ title: "Choose your role · GeoPresent" }] }),
  component: RolePage,
});

function RolePage() {
  const { user, role, loading, refreshRole } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"teacher" | "student" | null>(null);
  const [view, setView] = useState<"select" | "teacher-status">("select");
  const [reqStatus, setReqStatus] = useState<ReqStatus>(null);
  const requestTeacher = useServerFn(requestTeacherAccess);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (role === "teacher") navigate({ to: "/teacher/dashboard" });
    else if (role === "student") navigate({ to: "/student/home" });
  }, [user, role, loading, navigate]);

  const loadStatus = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("teacher_requests")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setReqStatus(data.status as ReqStatus);
      setView("teacher-status");
      if (data.status === "approved") {
        await refreshRole();
        navigate({ to: "/teacher/dashboard" });
      }
    }
  }, [user, refreshRole, navigate]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const pickStudent = async () => {
    if (!user) return;
    setBusy("student");
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role: "student" });
    if (error) {
      setBusy(null);
      return toast.error(error.message);
    }
    await refreshRole();
    toast.success("Welcome, student!");
    navigate({ to: "/student/home" });
  };

  const pickTeacher = async () => {
    if (!user) return;
    setBusy("teacher");
    try {
      const result = await requestTeacher();
      setReqStatus(result.status);
      setView("teacher-status");
      if (result.status === "approved") {
        await refreshRole();
        navigate({ to: "/teacher/dashboard" });
      } else {
        toast.success("Request submitted for admin approval");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit request");
    } finally {
      setBusy(null);
    }
  };

  if (view === "teacher-status") {
    return (
      <TeacherStatusView
        status={reqStatus}
        onBack={() => setView("select")}
        onRefresh={loadStatus}
      />
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-hero text-primary-foreground shadow-[var(--shadow-soft)]">
            <MapPin className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">How will you use GeoPresent?</h1>
          <p className="mt-2 text-muted-foreground">
            Pick a role to get started. Teacher access needs admin approval.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <RoleCard
            icon={UserCog}
            title="Teacher"
            desc="Create geofenced classes, run sessions and view analytics. Requires admin approval."
            onClick={pickTeacher}
            busy={busy === "teacher"}
            cta="Request Teacher Access"
          />
          <RoleCard
            icon={GraduationCap}
            title="Student"
            desc="Join classes with a code and mark your attendance in seconds."
            onClick={pickStudent}
            busy={busy === "student"}
            cta="Continue as Student"
          />
        </div>
      </div>
    </div>
  );
}

function TeacherStatusView({
  status,
  onBack,
  onRefresh,
}: {
  status: ReqStatus;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const isPending = status === "pending";
  const isRejected = status === "rejected";
  const Icon = isRejected ? XCircle : Clock;
  const color = isRejected ? "text-destructive" : "text-primary";
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-soft)]">
        <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent ${color}`}>
          <Icon className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-bold">
          {isPending && "Awaiting Admin Approval"}
          {isRejected && "Request Rejected"}
          {!isPending && !isRejected && "Teacher Access"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isPending &&
            "Your teacher access request is pending approval. You'll get access once the admin approves it."}
          {isRejected &&
            "Your teacher access request was rejected. You can choose to continue as a student."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onRefresh} variant="outline" className="w-full">
            <RefreshCw className="h-4 w-4" /> Check status
          </Button>
          <Button onClick={onBack} variant="ghost" className="w-full">
            <ArrowLeft className="h-4 w-4" /> Go back / Choose Student instead
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  icon: Icon,
  title,
  desc,
  onClick,
  busy,
  cta,
}: any) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="card-lift group rounded-2xl border border-border bg-card p-6 text-left transition disabled:opacity-60"
    >
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-primary group-hover:bg-primary group-hover:text-primary-foreground transition">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <Button className="mt-4 w-full" variant="outline">
        {busy ? "Working…" : cta}
      </Button>
    </button>
  );
}
