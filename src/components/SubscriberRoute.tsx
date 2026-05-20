import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Guard that allows access only to users with an active subscription
 * (or admins/moderators). Used to gate the subscriber visa monitor page.
 */
export default function SubscriberRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isPrivileged, isLoading: roleLoading } = useIsAdmin();
  const [hasSub, setHasSub] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setHasSub(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (!cancelled) setHasSub((data?.length ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || roleLoading || hasSub === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth/login" replace />;
  if (!isPrivileged && !hasSub) return <Navigate to="/pricing" replace />;

  return <>{children}</>;
}
