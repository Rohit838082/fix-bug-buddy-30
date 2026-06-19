import { useEffect, useRef } from "react";

interface Props {
  centerLat: number;
  centerLng: number;
  radius: number;
  studentLat?: number | null;
  studentLng?: number | null;
  inside?: boolean;
  size?: number;
}

// Simple canvas mini-map showing geofence circle + student dot.
// Scales so radius * 1.8 fits within canvas.
export function MiniMap({
  centerLat,
  centerLng,
  radius,
  studentLat,
  studentLng,
  inside = true,
  size = 280,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // bg grid
    ctx.fillStyle = "rgba(22,163,74,0.04)";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(22,163,74,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, size);
      ctx.moveTo(0, i); ctx.lineTo(size, i);
      ctx.stroke();
    }

    const cx = size / 2;
    const cy = size / 2;
    // World view spans radius * 2 meters across half the canvas
    const metersToPx = (m: number) => (m / (radius * 1.8)) * (size / 2);

    // Geofence circle
    ctx.beginPath();
    ctx.fillStyle = "rgba(22,163,74,0.15)";
    ctx.strokeStyle = "rgba(22,163,74,0.9)";
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, metersToPx(radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Center marker (classroom)
    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.font = "11px DM Sans, sans-serif";
    ctx.fillText("Classroom", cx + 10, cy - 6);

    // Student marker
    if (studentLat != null && studentLng != null) {
      // Approx meters per degree
      const metersPerDegLat = 111_111;
      const metersPerDegLng = 111_111 * Math.cos((centerLat * Math.PI) / 180);
      const dxM = (studentLng - centerLng) * metersPerDegLng;
      const dyM = (studentLat - centerLat) * metersPerDegLat;
      let sx = cx + metersToPx(dxM);
      let sy = cy - metersToPx(dyM);
      // clamp inside canvas
      sx = Math.max(8, Math.min(size - 8, sx));
      sy = Math.max(8, Math.min(size - 8, sy));
      ctx.fillStyle = inside ? "#2563eb" : "#dc2626";
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [centerLat, centerLng, radius, studentLat, studentLng, inside, size]);

  return (
    <canvas
      ref={ref}
      className="rounded-xl border border-border bg-muted/30"
      aria-label="Classroom geofence map"
    />
  );
}