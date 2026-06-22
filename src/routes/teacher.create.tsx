import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Locate, Copy, Check, Info, ArrowRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { generateClassId, generatePassword } from "@/lib/distance";
import { TimePicker12h } from "@/components/time-picker-12h";

export const Route = createFileRoute("/teacher/create")({
  component: CreateClass,
});

type LocationDraft = { name: string; lat: string; lng: string; radius: number };

const blankLocation = (n = 1): LocationDraft => ({ name: `Location ${n}`, lat: "", lng: "", radius: 50 });

function CreateClass() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", subject: "", section: "", semester: "",
    attendance_end_time: "",
  });
  const [locations, setLocations] = useState<LocationDraft[]>([blankLocation(1)]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; password: string } | null>(null);
  const [copied, setCopied] = useState<"id" | "pw" | null>(null);

  const autoDetect = (idx: number) => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported.");
    toast.info("Detecting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocations((ls) => ls.map((l, i) => i === idx ? { ...l, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) } : l));
        toast.success(`Location set (accuracy ±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => toast.error(err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const updateLocation = (idx: number, patch: Partial<LocationDraft>) =>
    setLocations((ls) => ls.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const addLocation = () => setLocations((ls) => [...ls, blankLocation(ls.length + 1)]);
  const removeLocation = (idx: number) => setLocations((ls) => ls.length === 1 ? ls : ls.filter((_, i) => i !== idx));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name) return toast.error("Class name is required.");
    if (!form.attendance_end_time) return toast.error("Please set an attendance end time.");
    const parsed = locations.map((l) => ({ ...l, latN: parseFloat(l.lat), lngN: parseFloat(l.lng) }));
    for (const [i, l] of parsed.entries()) {
      if (!l.name.trim()) return toast.error(`Location ${i + 1}: name is required.`);
      if (isNaN(l.latN) || isNaN(l.lngN)) return toast.error(`Location ${i + 1}: set valid coordinates.`);
      if (l.radius < 5 || l.radius > 5000) return toast.error(`Location ${i + 1}: radius must be 5–5000m.`);
    }
    setBusy(true);
    const id = generateClassId();
    const password = generatePassword();
    const primary = parsed[0];
    const { error } = await supabase.from("classes").insert({
      id, password, teacher_id: user.id,
      name: form.name, subject: form.subject, section: form.section, semester: form.semester,
      lat: primary.latN, lng: primary.lngN, radius: primary.radius,
      attendance_end_time: form.attendance_end_time,
    });
    if (error) { setBusy(false); return toast.error(error.message); }
    const { error: locErr } = await supabase.from("class_locations" as any).insert(
      parsed.map((l) => ({ class_id: id, name: l.name.trim(), lat: l.latN, lng: l.lngN, radius: l.radius })),
    );
    setBusy(false);
    if (locErr) return toast.error(locErr.message);
    setCreated({ id, password });
    toast.success("Class created!");
  };

  const copy = async (txt: string, key: "id" | "pw") => {
    await navigator.clipboard.writeText(txt);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  if (created) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card-lift rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl gradient-hero text-primary-foreground shadow-[var(--shadow-glow)]">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-2xl font-bold">Class created 🎉</h2>
          <p className="mt-1 text-sm text-muted-foreground">Share these credentials with your students.</p>

          <div className="mt-6 space-y-3 text-left">
            <CredField label="Class Name" value={form.name} />
            <CredField label="Class ID" value={created.id} copied={copied === "id"} onCopy={() => copy(created.id, "id")} mono />
            <CredField label="Password" value={created.password} copied={copied === "pw"} onCopy={() => copy(created.password, "pw")} mono />
            <div className="grid grid-cols-2 gap-3">
              <CredField label="Created" value={new Date().toLocaleDateString()} />
              <CredField label="Locations" value={`${locations.length}`} />
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <Button variant="outline" onClick={() => copy(created.id, "id")} className="gap-2">
              {copied === "id" ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>} Copy ID
            </Button>
            <Button variant="outline" onClick={() => copy(created.password, "pw")} className="gap-2">
              {copied === "pw" ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>} Copy Password
            </Button>
            <Button className="gap-2" onClick={() => navigate({ to: "/teacher/classes/$classId", params: { classId: created.id } })}>
              Go To Dashboard <ArrowRight className="h-4 w-4"/>
            </Button>
          </div>
          <button
            className="mt-4 text-xs text-muted-foreground underline"
            onClick={() => { setCreated(null); setForm({ name: "", subject: "", section: "", semester: "", attendance_end_time: "" }); setLocations([blankLocation(1)]); }}
          >
            Create another class
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Create Class</h1>
      <p className="mt-1 text-muted-foreground">Set up a new geofenced class in seconds.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Class name *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Operating Systems" />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="CS-301" />
          </div>
          <div>
            <Label>Section</Label>
            <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="A" />
          </div>
          <div>
            <Label>Semester</Label>
            <Input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} placeholder="Fall 2026" />
          </div>
        </div>

        <div>
          <Label>Attendance end time (IST) *</Label>
          <Input
            type="time"
            required
            value={form.attendance_end_time}
            onChange={(e) => setForm({ ...form, attendance_end_time: e.target.value })}
            className="mt-2"
          />
          <p className="mt-1 text-xs text-muted-foreground">After this time, students cannot mark attendance and will be marked absent.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Approved attendance locations *</Label>
              <p className="text-xs text-muted-foreground">Students can mark attendance if they're inside <strong>any</strong> of these areas.</p>
            </div>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addLocation}>
              <Plus className="h-3.5 w-3.5" /> Add location
            </Button>
          </div>

          {locations.map((loc, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={loc.name}
                  onChange={(e) => updateLocation(i, { name: e.target.value })}
                  placeholder={`Location ${i + 1} name (e.g. Main Building)`}
                  className="font-semibold"
                />
                {locations.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeLocation(i)} aria-label="Remove location">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={loc.lat} onChange={(e) => updateLocation(i, { lat: e.target.value })} placeholder="Latitude e.g. 28.704060" />
                <Input value={loc.lng} onChange={(e) => updateLocation(i, { lng: e.target.value })} placeholder="Longitude e.g. 77.102493" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Radius</Label>
                  <span className="text-xs font-semibold text-primary">{loc.radius}m</span>
                </div>
                <Slider min={10} max={500} step={5} value={[loc.radius]} onValueChange={(v) => updateLocation(i, { radius: v[0] })} className="mt-2" />
              </div>
              <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => autoDetect(i)}>
                <Locate className="h-3.5 w-3.5" /> Use my current location
              </Button>
            </div>
          ))}

          <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 text-info" />
            <p>Tip: Find coordinates at <span className="font-mono">latlong.net</span> or right-click on Google Maps and copy the lat/long.</p>
          </div>
        </div>

        <Button type="submit" disabled={busy} className="w-full gap-2">
          <MapPin className="h-4 w-4" /> {busy ? "Creating…" : "Create class"}
        </Button>
      </form>
    </div>
  );
}

function CredField({ label, value, copied, onCopy, mono }: any) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-lg font-bold ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
      {onCopy && (
        <Button size="icon" variant="ghost" onClick={onCopy} aria-label="Copy">
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
