import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Radio, MapPin, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { MiniMap } from "@/components/geopresent/MiniMap";
import { haversine } from "@/lib/distance";

export const Route = createFileRoute("/student/class/$classId")({ component: Mark });

// Today's date in IST (YYYY-MM-DD) — uses Intl so it works regardless of the browser timezone.
// Must match the server default `((now() AT TIME ZONE 'Asia/Kolkata'))::date`.
function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Current time in IST as minutes since midnight (with fractional seconds)
function nowISTMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let h = get("hour");
  if (h === 24) h = 0; // some locales emit "24" at midnight
  return h * 60 + get("minute") + get("second") / 60;
}

function parseHHMM(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function formatHHMMto12(t?: string | null): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return "00h 00m 00s";
  const totalSec = Math.max(0, Math.floor(mins * 60));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function Mark() {
  const { classId } = useParams({ from: "/student/class/$classId" });
  const { user } = useAuth();
  const [cls, setCls] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [markedRecord, setMarkedRecord] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [, setTick] = useState(0);

  // Tick every second for countdown
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // Load class and watch updates in realtime
  useEffect(() => {
    let mounted = true;
    supabase.from("classes").select("*").eq("id", classId).maybeSingle().then(({ data }) => {
      if (mounted) setCls(data);
    });
    const ch = supabase
      .channel(`class-${classId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "classes", filter: `id=eq.${classId}` },
        (payload) => setCls(payload.new))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [classId]);

  // Load approved attendance locations
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.from("class_locations" as any).select("*").eq("class_id", classId);
      if (mounted) setLocations(((data as any[]) ?? []));
    };
    load();
    const ch = supabase
      .channel(`class-locations-${classId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_locations", filter: `class_id=eq.${classId}` }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [classId]);

  // Load latest active session
  const loadSession = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_sessions")
      .select("*")
      .eq("class_id", classId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSession(data);
  }, [classId]);

  useEffect(() => {
    loadSession();
    const ch = supabase
      .channel(`sessions-${classId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_sessions", filter: `class_id=eq.${classId}` },
        () => loadSession())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [classId, loadSession]);

  // Check if already marked this session
  useEffect(() => {
    if (!user) { setMarkedRecord(null); return; }
    supabase.from("attendance_records")
      .select("*")
      .eq("student_id", user.id)
      .eq("class_id", classId)
      .eq("attendance_date", todayIST())
      .maybeSingle()
      .then(({ data }) => setMarkedRecord(data));
  }, [user, classId, session?.id]);

  // GPS watch
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported by this browser.");
      return null;
    }
    setGpsError(null);
    return navigator.geolocation.watchPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setGpsError(null); },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGpsError("Location permission required for attendance. Please enable it in browser settings.");
        else if (err.code === err.POSITION_UNAVAILABLE) setGpsError("Please enable device location.");
        else setGpsError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, []);

  useEffect(() => {
    const id = requestLocation();
    return () => { if (id != null) navigator.geolocation.clearWatch(id); };
  }, [requestLocation]);

  // Evaluate against ALL approved locations; find nearest; inside if within ANY radius.
  const effectiveLocations = locations.length
    ? locations
    : cls ? [{ id: "primary", name: "Classroom", lat: cls.lat, lng: cls.lng, radius: cls.radius }] : [];
  const nearest = coords && effectiveLocations.length
    ? effectiveLocations
        .map((l) => ({ loc: l, distance: haversine(l.lat, l.lng, coords.lat, coords.lng) }))
        .sort((a, b) => a.distance - b.distance)[0]
    : null;
  const distance = nearest?.distance ?? null;
  const inside = nearest ? nearest.distance <= nearest.loc.radius : false;
  const sessionActive = cls?.active_session && session && !session.ended_at;

  const deadlineMin = parseHHMM(cls?.attendance_end_time);
  const remainingMin = deadlineMin != null ? deadlineMin - nowISTMinutes() : null;
  const isLate = remainingMin != null && remainingMin <= 0;

  // Debug logging to diagnose disabled button
  useEffect(() => {
    if (cls && coords) {
      console.log("[Attendance Debug]", {
        classroom: { lat: cls.lat, lng: cls.lng, radius: cls.radius },
        student: coords,
        distance: distance != null ? Math.round(distance) + "m" : null,
        inside,
        sessionActive,
        alreadyMarked: !!markedRecord,
      });
    }
  }, [cls, coords, distance, inside, sessionActive, markedRecord]);

  // ZERO-CLICK: Auto-mark attendance as soon as ALL conditions are valid.
  // Continues to listen via the existing GPS watchPosition; this effect re-runs
  // on each coords/session/cls change until success.
  useEffect(() => {
    if (busy) return;
    if (markedRecord) return;
    if (!user || !cls || !coords) return;
    if (!sessionActive) return;
    if (isLate) return;
    if (!inside) return;
    if (coords.acc > 100) return;
    // fire-and-forget; mark() guards itself too
    mark();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cls, coords, sessionActive, isLate, inside, markedRecord, busy]);

  const mark = async () => {
    if (!user || !cls) return;
    if (markedRecord) return toast.info("Attendance already marked today.");
    if (!coords) return toast.error("Waiting for GPS…");
    if (coords.acc > 100) return toast.error(`GPS accuracy too low (±${Math.round(coords.acc)}m). Move outdoors and retry.`);
    if (!nearest) return toast.error("No approved locations set for this class.");
    const dist = nearest.distance;
    if (dist > nearest.loc.radius) return toast.error(`Outside approved area (${Math.round(dist)}m from nearest: ${nearest.loc.name}).`);
    if (isLate) return toast.error(`Attendance closed at ${formatHHMMto12(cls.attendance_end_time)} IST. Current IST time: ${formatHHMMto12(`${String(Math.floor(nowISTMinutes()/60)).padStart(2,"0")}:${String(Math.floor(nowISTMinutes()%60)).padStart(2,"0")}`)}.`);
    if (!sessionActive || !session?.id) {
      return toast.error("Teacher hasn't started an attendance session yet. Ask them to open one.");
    }

    // Detailed pre-insert diagnostics
    console.log("[Attendance Mark Attempt]", {
      clientTime: new Date().toISOString(),
      todayIST: todayIST(),
      nowISTMinutes: nowISTMinutes(),
      attendance_end_time: cls.attendance_end_time,
      deadlineMin,
      remainingMin,
      isLate,
      distance_m: Math.round(dist),
      allowed_radius_m: nearest.loc.radius,
      inside,
      session_id: session?.id ?? null,
      sessionActive,
    });

    setBusy(true);
    // Do NOT send attendance_date — let the server default
    // `((now() AT TIME ZONE 'Asia/Kolkata'))::date` fill it, so client/server can never
    // disagree on what "today" is.
    const attendancePayload = {
      class_id: classId,
      student_id: user.id,
      session_id: session.id,
      status: "present",
      distance: dist,
      student_lat: coords.lat,
      student_lng: coords.lng,
    };
    console.log("[Attendance Payload]", attendancePayload, { authUid: user.id });
    const { data, error } = await supabase
      .from("attendance_records")
      .insert(attendancePayload)
      .select()
      .maybeSingle();
    setBusy(false);
    if (error) {
      console.error("[Attendance Insert Error]", { code: (error as any).code, message: error.message, details: (error as any).details, hint: (error as any).hint });
      if ((error as any).code === "23505") {
        toast.info("Attendance already marked today.");
        // refresh record
        const { data: existing } = await supabase.from("attendance_records").select("*")
          .eq("student_id", user.id).eq("class_id", classId).eq("attendance_date", todayIST()).maybeSingle();
        setMarkedRecord(existing);
        return;
      }
      if ((error as any).code === "42501") {
        return toast.error("Attendance session is not open. Ask your teacher to start the session and try again.");
      }
      // Surface the real server reason. The trigger raises explicit messages like
      // "Attendance cannot be marked. You are late." or "Outside approved attendance area."
      return toast.error(error.message || "Could not mark attendance.");
    }
    setMarkedRecord(data);
    toast.success(`✅ Marked present! (${Math.round(dist)}m from classroom)`);
  };

  if (!cls) return <div className="h-40 animate-pulse rounded-2xl bg-muted"/>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{cls.name}</h1>
        <p className="text-sm text-muted-foreground">{cls.subject || "—"} · {cls.section || "—"}</p>
      </div>

      {cls.attendance_end_time && (
        <div className={`rounded-xl border p-3 text-sm ${isLate ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-foreground"}`}>
          {isLate ? (
            <>
              <p className="font-semibold">Attendance cannot be marked. You are late.</p>
              <p className="mt-1 text-xs opacity-90">Class attendance time was: {formatHHMMto12(cls.attendance_end_time)}</p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Attendance closes at {cls.attendance_end_time} IST</p>
              <p className="mt-0.5 font-mono text-lg font-bold">{formatCountdown(remainingMin ?? 0)}</p>
            </>
          )}
        </div>
      )}

      <div className={`flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium ${markedRecord ? "bg-success/10 text-success" : inside ? "bg-success/10 text-success" : coords ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
        <Radio className={`h-4 w-4 ${inside && !markedRecord ? "animate-pulse" : ""}`}/>
        {markedRecord ? "Attendance is marked for today" :
          !coords ? "Waiting for GPS…" :
          inside ? (sessionActive && !isLate ? `Inside approved area — marking automatically…` : `Inside approved area: ${nearest!.loc.name}`) :
          `Outside approved area (nearest: ${nearest?.loc.name} · ${Math.round(distance!)}m away)`}
      </div>

      {effectiveLocations.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs">
          <p className="mb-2 font-semibold text-muted-foreground">Approved Locations ({effectiveLocations.length})</p>
          <ul className="space-y-1">
            {effectiveLocations.map((l) => {
              const d = coords ? haversine(l.lat, l.lng, coords.lat, coords.lng) : null;
              const ok = d != null && d <= l.radius;
              return (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span className="font-medium">{l.name}</span>
                  <span className={ok ? "text-success" : "text-muted-foreground"}>
                    {d != null ? `${Math.round(d)}m` : "—"} · radius {l.radius}m {ok ? "✓" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {gpsError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
          <div className="flex-1">
            <p>{gpsError}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={requestLocation}>Retry location</Button>
          </div>
        </div>
      )}

      <div className="grid place-items-center rounded-2xl border border-border bg-card p-5">
        <MiniMap
          centerLat={nearest?.loc.lat ?? cls.lat} centerLng={nearest?.loc.lng ?? cls.lng} radius={nearest?.loc.radius ?? cls.radius}
          studentLat={coords?.lat} studentLng={coords?.lng} inside={inside}
        />
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {coords ? (
            <>
              <span><MapPin className="inline h-3 w-3"/> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
              <span>±{Math.round(coords.acc)}m accuracy</span>
              {distance != null && nearest && (
                <span className={inside ? "text-success" : "text-destructive"}>
                  {Math.round(distance)}m from {nearest.loc.name} (radius {nearest.loc.radius}m)
                </span>
              )}
            </>
          ) : !gpsError ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Acquiring GPS…</span> : <span>GPS unavailable</span>}
        </div>
      </div>

      <Button
        onClick={mark}
        disabled={busy || !!markedRecord || !inside || !coords || isLate || !sessionActive}
        variant={markedRecord ? "secondary" : isLate ? "destructive" : inside && sessionActive ? "default" : "destructive"}
        className={`w-full ${!markedRecord && inside && !isLate && sessionActive ? "pulse-ring" : ""}`}
        size="lg"
      >
        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Submitting…</> :
          markedRecord ? <><CheckCircle2 className="mr-2 h-4 w-4"/> Attendance already marked today</> :
          isLate ? "Attendance Closed — You are late" :
          !coords ? "Waiting for GPS…" :
          !inside ? "Outside Approved Area" :
          !sessionActive ? "Waiting for teacher to start session" :
          "Mark Attendance"}
      </Button>

      {markedRecord && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
          <p className="font-semibold">You're marked present ✓</p>
          <p className="opacity-80">{new Date(markedRecord.created_at).toLocaleString()} · {Math.round(markedRecord.distance)}m from classroom</p>
        </div>
      )}
    </div>
  );
}
