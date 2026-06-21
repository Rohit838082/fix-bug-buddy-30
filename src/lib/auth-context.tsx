import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "teacher" | "student" | "admin" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  isAdmin: boolean;
  loading: boolean;
  profileCompleted: boolean | null;
  refreshRole: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = async (uid: string | undefined) => {
    if (!uid) {
      setRole(null);
      setIsAdmin(false);
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    const roles = (data ?? []).map((r) => r.role as string);
    setIsAdmin(roles.includes("admin"));
    // Prefer admin → teacher → student for primary role used for redirects
    const primary =
      (roles.includes("admin") && "admin") ||
      (roles.includes("teacher") && "teacher") ||
      (roles.includes("student") && "student") ||
      null;
    setRole(primary as Role);
  };

  const loadProfile = async (uid: string | undefined) => {
    if (!uid) { setProfileCompleted(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("profile_completed" as any)
      .eq("id", uid)
      .maybeSingle();
    setProfileCompleted(Boolean((data as any)?.profile_completed));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setTimeout(() => { loadRole(s?.user?.id); loadProfile(s?.user?.id); }, 0);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      await Promise.all([loadRole(data.session?.user?.id), loadProfile(data.session?.user?.id)]);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshRole = async () => loadRole(user?.id);
  const refreshProfile = async () => loadProfile(user?.id);
  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setIsAdmin(false);
    setProfileCompleted(null);
  };

  return (
    <Ctx.Provider value={{ user, session, role, isAdmin, loading, profileCompleted, refreshRole, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
