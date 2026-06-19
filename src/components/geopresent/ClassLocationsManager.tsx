import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, Plus, Trash2, Locate, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MiniMap } from "@/components/geopresent/MiniMap";

type Loc = { id: string; class_id: string; name: string; lat: number; lng: number; radius: number };
type Draft = { name: string; lat: string; lng: string; radius: number };

export function ClassLocationsManager({ classId }: { classId: string }) {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", lat: "", lng: "", radius: 50 });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("class_locations" as any).select("*").eq("class_id", classId).order("created_at");
    setLocations(((data as any[]) ?? []) as Loc[]);
    setLoading(false);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (l: Loc) => {
    setAdding(false);
    setEditingId(l.id);
    setDraft({ name: l.name, lat: String(l.lat), lng: String(l.lng), radius: l.radius });
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraft({ name: `Location ${locations.length + 1}`, lat: "", lng: "", radius: 50 });
  };

  const cancel = () => { setEditingId(null); setAdding(false); };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation unavailable");
    navigator.geolocation.getCurrentPosition(
      (p) => setDraft((d) => ({ ...d, lat: String(p.coords.latitude), lng: String(p.coords.longitude) })),
      () => toast.error("Could not get location"),
      { enableHighAccuracy: true },
    );
  };

  const save = async () => {
    const lat = parseFloat(draft.lat); const lng = parseFloat(draft.lng);
    if (!draft.name.trim()) return toast.error("Name is required");
    if (isNaN(lat) || isNaN(lng)) return toast.error("Invalid coordinates");
    if (draft.radius < 5 || draft.radius > 5000) return toast.error("Radius must be 5–5000m");
    setBusy(true);
    const payload = { class_id: classId, name: draft.name.trim(), lat, lng, radius: draft.radius };
    if (adding) {
      const { error } = await supabase.from("class_locations" as any).insert(payload);
      if (error) { setBusy(false); return toast.error(error.message); }
      toast.success("Location added");
    } else if (editingId) {
      const { error } = await supabase.from("class_locations" as any).update(payload).eq("id", editingId);
      if (error) { setBusy(false); return toast.error(error.message); }
      toast.success("Location updated");
    }
    setBusy(false);
    cancel();
    load();
  };

  const remove = async (l: Loc) => {
    if (locations.length <= 1) return toast.error("A class must have at least one location.");
    if (!confirm(`Delete location "${l.name}"?`)) return;
    const { error } = await supabase.from("class_locations" as any).delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Location deleted");
    load();
  };

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  const editing = adding || editingId != null;

  return (
    <div className="card-lift rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-primary" /> Approved Locations ({locations.length})
        </h3>
        {!editing && (
          <Button size="sm" variant="outline" className="gap-1" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">Students can mark attendance if they're inside <strong>any one</strong> of these areas.</p>

      <div className="space-y-3">
        {locations.map((l) => (
          editingId === l.id ? (
            <DraftEditor key={l.id} draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} onLocate={useMyLocation} busy={busy} />
          ) : (
            <div key={l.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/30 p-3">
              <MiniMap centerLat={l.lat} centerLng={l.lng} radius={l.radius} size={120} />
              <div className="flex-1 text-sm">
                <p className="font-semibold">{l.name}</p>
                <p className="text-xs text-muted-foreground">{l.lat.toFixed(6)}, {l.lng.toFixed(6)}</p>
                <p className="text-xs text-muted-foreground">Radius: <strong>{l.radius}m</strong></p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => startEdit(l)} disabled={editing}>Edit</Button>
                <Button size="icon" variant="ghost" onClick={() => remove(l)} disabled={editing || locations.length <= 1} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          )
        ))}

        {adding && <DraftEditor draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} onLocate={useMyLocation} busy={busy} />}
      </div>
    </div>
  );
}

function DraftEditor({
  draft, setDraft, onSave, onCancel, onLocate, busy,
}: { draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; onLocate: () => void; busy: boolean; }) {
  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <div>
        <Label>Location name</Label>
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Main Building" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Latitude</Label>
          <Input value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} />
        </div>
        <div>
          <Label>Longitude</Label>
          <Input value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label>Radius</Label>
          <span className="text-xs font-semibold text-primary">{draft.radius}m</span>
        </div>
        <Slider min={10} max={500} step={5} value={[draft.radius]} onValueChange={(v) => setDraft({ ...draft, radius: v[0] })} className="mt-2" />
      </div>
      <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={onLocate}>
        <Locate className="h-3.5 w-3.5" /> Use my current location
      </Button>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={onCancel} disabled={busy}><X className="h-4 w-4" /> Cancel</Button>
        <Button size="sm" className="flex-1 gap-1" onClick={onSave} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </Button>
      </div>
    </div>
  );
}