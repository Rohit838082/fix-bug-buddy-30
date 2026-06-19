import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home, BookOpen, PlusSquare, History, LogOut, MapPin, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDarkMode } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student")({ component: StudentLayout });

const nav = [
  { to: "/student/home", label: "Home", icon: Home },
  { to: "/student/classes", label: "Classes", icon: BookOpen },
  { to: "/student/join", label: "Join", icon: PlusSquare },
  { to: "/student/history", label: "History", icon: History },
];

function StudentLayout() {
  const { user, role, loading, profileCompleted, signOut } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (role && role !== "student") navigate({ to: "/teacher/dashboard" });
    else if (!role) navigate({ to: "/role" });
    else if (profileCompleted === false && path !== "/student/profile") {
      navigate({ to: "/student/profile" });
    }
  }, [user, role, loading, profileCompleted, path, navigate]);

  const onLogout = async () => { await signOut(); navigate({ to: "/" }); };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur">
        <Link to="/student/home" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg gradient-hero text-primary-foreground">
            <MapPin className="h-4 w-4" />
          </div>
          <span className="font-bold">GeoPresent</span>
        </Link>
        <div className="flex gap-1">
          <Link to="/student/profile">
            <Button size="icon" variant="ghost" aria-label="Profile"><User className="h-4 w-4"/></Button>
          </Link>
          <Button size="icon" variant="ghost" onClick={toggle}>{dark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}</Button>
          <Button size="icon" variant="ghost" onClick={onLogout}><LogOut className="h-4 w-4"/></Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">
        <Outlet />
      </main>
      <nav className="glass fixed bottom-0 left-0 right-0 z-40 border-t border-border">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {nav.map((it) => {
            const active = path === it.to || path.startsWith(it.to + "/");
            return (
              <Link key={it.to} to={it.to} className={cn(
                "flex flex-col items-center gap-1 py-3 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}>
                <it.icon className="h-5 w-5" />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
