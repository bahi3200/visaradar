import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Logical back-navigation map.
 * Key = current path prefix → value = { to, label }
 */
const backRoutes: Record<string, { to: string; label: string }> = {
  // Admin dashboard sub-pages → dashboard
  "/dashboard/jobs": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/notifications": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/requests": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/users": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/email-log": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/contact-messages": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/payment-settings": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/visa-monitor": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/reviews": { to: "/dashboard", label: "لوحة التحكم" },
  "/dashboard/referrals": { to: "/dashboard", label: "لوحة التحكم" },

  // User pages → home
  "/subscribe": { to: "/pricing", label: "الباقات" },
  "/my-requests": { to: "/", label: "الرئيسية" },
  "/my-devices": { to: "/profile", label: "الملف الشخصي" },
  "/profile": { to: "/", label: "الرئيسية" },
  "/notification-settings": { to: "/profile", label: "الملف الشخصي" },

  // Public pages
  "/pricing": { to: "/", label: "الرئيسية" },
  "/contact": { to: "/", label: "الرئيسية" },
  "/privacy": { to: "/", label: "الرئيسية" },
  "/terms": { to: "/", label: "الرئيسية" },
  "/visa": { to: "/", label: "الرئيسية" },
  "/jobs": { to: "/", label: "الرئيسية" },

  // Auth
  "/auth/register": { to: "/auth/login", label: "تسجيل الدخول" },
  "/auth/forgot-password": { to: "/auth/login", label: "تسجيل الدخول" },
  "/reset-password": { to: "/auth/login", label: "تسجيل الدخول" },
};

/** Pages where back button should NOT appear */
const hiddenOnPaths = ["/", "/auth/login", "/dashboard"];

export default function BackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (hiddenOnPaths.includes(pathname)) return null;

  // Find matching route — try exact first, then prefix match for dynamic routes
  let route = backRoutes[pathname];

  if (!route) {
    // Dynamic routes: /jobs/:id → /jobs, /visa/:slug → /visa
    if (pathname.startsWith("/jobs/")) route = { to: "/jobs", label: "الوظائف" };
    else if (pathname.startsWith("/visa/")) route = { to: "/visa", label: "دليل التأشيرات" };
    else return null; // Unknown page, don't show
  }

  return (
    <div className="container pt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(route.to)}
        className="gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        {route.label}
      </Button>
    </div>
  );
}
