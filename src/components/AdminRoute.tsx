import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean; // If true, only admin (not moderator) can access
}

export default function AdminRoute({ children, adminOnly = false }: Props) {
  const { user, loading } = useAuth();
  const { isAdmin, isPrivileged, isLoading: roleLoading } = useIsAdmin();

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (!adminOnly && !isPrivileged) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
