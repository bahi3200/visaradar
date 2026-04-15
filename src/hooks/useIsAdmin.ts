import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shared hook to check if the current user is an admin or moderator.
 * Uses a single queryKey so React Query deduplicates across all components.
 */
export function useIsAdmin() {
  const { user } = useAuth();

  const { data: roleData, isLoading } = useQuery({
    queryKey: ["user-is-admin", user?.id],
    queryFn: async () => {
      if (!user) return { isAdmin: false, isPrivileged: false };
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const roles = (data || []).map((r) => r.role);
      return {
        isAdmin: roles.includes("admin"),
        isPrivileged: roles.includes("admin") || roles.includes("moderator"),
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return {
    isAdmin: roleData?.isAdmin ?? false,
    isPrivileged: roleData?.isPrivileged ?? false,
    isLoading,
  };
}
