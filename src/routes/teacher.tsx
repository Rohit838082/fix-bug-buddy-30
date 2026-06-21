import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, PlusCircle, BookOpen, BarChart3, Users, Settings, LogOut, MapPin, Menu, X, Moon, Sun,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDarkMode } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher")({
  component: TeacherLayout,
});

import { CreditCard } from "lucide-react";

const items = [
  { to: "/teacher/dashboard", label: "Main", icon: LayoutDashboard },
  { to: "/teacher/create", label: "Create Class", icon: PlusCircle },
  { to: "/teacher/classes", label: "My Classes", icon: BookOpen },
  { to: "/teacher/reports", label: "Reports", icon: BarChart3 },
  { to: "/teacher/students", label: "Students", icon: Users },
  { to: "/teacher/billing", label: "Billing", icon: CreditCard },
  { to: "/teacher/settings", label: "Settings", icon: Settings },
];

function TeacherLayout() {
  const { user, role, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { dark, toggle } = useDarkMode();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (isAdmin) navigate({ to: "/admin" });
    else if (role && role !== "teacher") navigate({ to: "/student/home" });
    else if (!role) navigate({ to: "/role" });
  }, [user, role, isAdmin, loading, navigate]);

  useEffect(() => setMobileOpen(false), [path]);

  const onLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <SidebarInner items={items} path={path} onLogout={onLogout} dark={dark} toggle={toggle} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="relative flex h-full w-72 flex-col border-r border-border bg-card" onClick={(e) => e.stopPropagation()}>
            <SidebarInner items={items} path={path} onLogout={onLogout} dark={dark} toggle={toggle} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
          <Link to="/teacher/dashboard" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg gradient-hero text-primary-foreground">
              <MapPin className="h-4 w-4" />
            </div>
            <span className="font-bold">GeoPresent</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarInner({ items, path, onLogout, dark, toggle }: any) {
  return (
    <>
      <div className="flex items-center justify-between p-5">
        <Link to="/teacher/dashboard" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-[var(--shadow-soft)]">
            <MapPin className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">GeoPresent</span>
        </Link>
        <Button size="icon" variant="ghost" onClick={toggle} aria-label="Toggle dark mode">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((it: any) => {
          const active = path === it.to || path.startsWith(it.to + "/");
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3">
        <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={onLogout}>
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>
    </>
  );
}
