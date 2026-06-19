import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "teacher" | "student" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
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
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = async (uid: string | undefined) => {
    if (!uid) {
      setRole(null);
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .maybeSingle();
    setRole((data?.role as Role) ?? null);
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
      // defer role lookup
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
    setProfileCompleted(null);
  };

  return (
    <Ctx.Provider value={{ user, session, role, loading, profileCompleted, refreshRole, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}