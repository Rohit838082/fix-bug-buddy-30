import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * 12-hour time picker that reads/writes a 24-hour "HH:MM" or "HH:MM:SS" string.
 * Useful for fields like attendance_end_time stored as Postgres TIME.
 */
export function TimePicker12h({
  value,
  onChange,
  minuteStep = 1,
}: {
  value: string;
  onChange: (val: string) => void;
  minuteStep?: number;
}) {
  // Parse "HH:MM[:SS]" -> { h24, m }
  const parse = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v || "");
    if (!m) return { h24: null as number | null, min: null as number | null };
    return { h24: Number(m[1]), min: Number(m[2]) };
  };
  const { h24, min } = parse(value);

  const period: "AM" | "PM" | "" =
    h24 == null ? "" : h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 == null ? "" : String(((h24 + 11) % 12) + 1);
  const minute = min == null ? "" : String(min).padStart(2, "0");

  const emit = (h12Str: string, mStr: string, p: "AM" | "PM") => {
    if (!h12Str || !mStr || !p) return;
    let h = Number(h12Str) % 12;
    if (p === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${mStr}`);
  };

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) =>
    String(i * minuteStep).padStart(2, "0"),
  );

  return (
    <div className="flex items-center gap-2">
      <Select
        value={hour12}
        onValueChange={(h) => emit(h, minute || "00", (period || "AM") as "AM" | "PM")}
      >
        <SelectTrigger className="w-20"><SelectValue placeholder="HH" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {hours.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select
        value={minute}
        onValueChange={(m) => emit(hour12 || "12", m, (period || "AM") as "AM" | "PM")}
      >
        <SelectTrigger className="w-20"><SelectValue placeholder="MM" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {minutes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={period}
        onValueChange={(p) => emit(hour12 || "12", minute || "00", p as "AM" | "PM")}
      >
        <SelectTrigger className="w-20"><SelectValue placeholder="AM" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Format a 24h "HH:MM[:SS]" string as "h:mm AM/PM" for display. */
export function format12h(value?: string | null): string {
  if (!value) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h24 = Number(m[1]);
  const min = m[2];
  const p = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${min} ${p}`;
}
