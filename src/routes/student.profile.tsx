import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, UserCircle2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/student/profile")({
  head: () => ({ meta: [{ title: "Your Profile · GeoPresent" }] }),
  component: StudentProfile,
});

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function StudentProfile() {
  const { user, profileCompleted, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", dob: "", college: "" });

  const isSetup = profileCompleted === false;

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("name,email,dob,college" as any)
        .eq("id", user.id)
        .maybeSingle();
      const p = (data as any) ?? {};
      setForm({
        name: p.name || user.user_metadata?.name || user.email?.split("@")[0] || "",
        email: p.email || user.email || "",
        dob: p.dob || "",
        college: p.college || "",
      });
      setLoading(false);
    })();
  }, [user]);

  const age = calcAge(form.dob);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name.trim()) return toast.error("Full name is required");
    if (!form.dob) return toast.error("Date of birth is required");
    if (age == null) return toast.error("Invalid date of birth");
    if (!form.college.trim()) return toast.error("College name is required");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: form.name.trim(),
        dob: form.dob,
        age,
        college: form.college.trim(),
        profile_completed: true,
      } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    toast.success("Profile saved");
    if (isSetup) navigate({ to: "/student/home" });
  };

  if (loading) return <div className="h-48 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-hero text-primary-foreground">
          <UserCircle2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {isSetup ? "Complete your profile" : "Your Profile"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSetup
              ? "We need a few details before you can access your dashboard."
              : "Update your personal and education details."}
          </p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal Information</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input value={form.email} disabled className="opacity-70" />
            </div>
            <div>
              <Label>Date of Birth *</Label>
              <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required max={new Date().toISOString().slice(0,10)} />
            </div>
            <div>
              <Label>Age</Label>
              <Input value={age != null ? `${age} years` : ""} disabled className="opacity-70" placeholder="Auto-calculated" />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Education Information</p>
          <div>
            <Label>College Name *</Label>
            <Input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} required placeholder="e.g. Delhi Technological University" />
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full gap-2" size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSetup ? "Save & Continue" : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}