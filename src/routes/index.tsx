import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MapPin, Shield, BarChart3, Smartphone, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GeoPresent — Smart Attendance Verified by GPS" },
      { name: "description", content: "GPS-verified attendance for schools & colleges. Geofencing, anti-cheat & live analytics." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user && isAdmin) navigate({ to: "/admin" });
    else if (user && role === "teacher") navigate({ to: "/teacher/dashboard" });
    else if (user && role === "student") navigate({ to: "/student/home" });
  }, [user, role, isAdmin, loading, navigate]);

  const features = [
    { icon: MapPin, title: "GPS Geofencing", desc: "Define a precise classroom zone. Students must be inside the radius to mark present." },
    { icon: Shield, title: "Anti-Cheat", desc: "GPS accuracy checks, one-per-session limits and location verification block proxy attendance." },
    { icon: BarChart3, title: "Live Analytics", desc: "Beautiful charts and per-student progress with CSV export for reports." },
    { icon: Smartphone, title: "Mobile-First", desc: "Designed for phones — students mark attendance with a single tap." },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Nav */}
      <header className="glass sticky top-0 z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-[var(--shadow-soft)]">
              <MapPin className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">GeoPresent</span>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/role"><Button variant="default">Dashboard</Button></Link>
            ) : (
              <>
                <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
                <Link to="/auth"><Button>Get Started</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, oklch(0.72 0.18 145 / 0.25), transparent 70%)",
          }}
        />
        <div className="container mx-auto px-4 py-20 text-center md:py-28">
          <div className="animate-fade-up mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary pulse-ring" />
            Trusted by educators worldwide
          </div>
          <h1 className="animate-fade-up mt-6 text-4xl font-extrabold tracking-tight md:text-6xl">
            <span className="gradient-text">GeoPresent</span>
            <br />
            <span className="text-foreground">Smart Attendance Verified by GPS</span>
          </h1>
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
            Tired of proxy attendance? Set a classroom geofence and let your students
            mark themselves present — only when they're truly in the room.
          </p>
          <div className="animate-fade-up mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2 shadow-[var(--shadow-glow)]">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline">Learn more</Button>
            </a>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["No app install", "Free for teachers", "Privacy-first"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 pb-24">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="card-lift rounded-2xl border border-border bg-card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 pb-24">
        <div className="gradient-hero relative overflow-hidden rounded-3xl px-6 py-16 text-center text-primary-foreground shadow-[var(--shadow-glow)]">
          <h2 className="text-3xl font-bold md:text-4xl">Ready to verify attendance?</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">
            Create your first geofenced class in under a minute.
          </p>
          <Link to="/auth">
            <Button size="lg" variant="secondary" className="mt-6 gap-2">
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} GeoPresent · Smart Attendance, Verified by GPS
      </footer>
    </div>
  );
}
