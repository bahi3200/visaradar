import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, ClipboardList, Users, Briefcase, Bell, Mail, LogOut,
  ChevronRight, Menu, X, Shield, MessageCircle, CreditCard, Activity, Star, Gift, Settings, AlertTriangle, Clock, Bot, Database, Send, Megaphone
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";

type NavItem = {
  path: string;
  label: string;
  icon: any;
  adminOnly?: boolean; // hidden from moderators
};

const navItems: NavItem[] = [
  { path: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard },
  { path: "/dashboard/requests", label: "طلبات الاشتراك", icon: ClipboardList },
  { path: "/dashboard/users", label: "المستخدمين", icon: Users, adminOnly: true },
  { path: "/dashboard/jobs", label: "إدارة الوظائف", icon: Briefcase },
  { path: "/dashboard/notifications", label: "الإشعارات", icon: Bell },
  { path: "/dashboard/email-log", label: "سجل البريد", icon: Mail, adminOnly: true },
  { path: "/dashboard/reminder-log", label: "سجل التذكيرات", icon: Clock, adminOnly: true },
  { path: "/dashboard/chat-conversations", label: "محادثات المساعد", icon: Bot, adminOnly: true },
  { path: "/dashboard/error-log", label: "سجل الأخطاء", icon: AlertTriangle, adminOnly: true },
  { path: "/dashboard/contact-messages", label: "رسائل التواصل", icon: MessageCircle },
  { path: "/dashboard/payment-settings", label: "إعدادات الدفع", icon: CreditCard, adminOnly: true },
  { path: "/dashboard/visa-monitor", label: "مراقبة التأشيرات", icon: Activity },
  { path: "/dashboard/reviews", label: "المراجعات", icon: Star },
  { path: "/dashboard/referrals", label: "الإحالات", icon: Gift, adminOnly: true },
  { path: "/dashboard/site-settings", label: "إعدادات الموقع", icon: Settings, adminOnly: true },
  { path: "/dashboard/telegram-users", label: "مستخدمو Telegram", icon: Send, adminOnly: true },
  { path: "/dashboard/telegram-broadcast", label: "بث Telegram جماعي", icon: Megaphone, adminOnly: true },
  { path: "/dashboard/backup", label: "نسخ احتياطي", icon: Database, adminOnly: true },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    toast.success("تم تسجيل الخروج");
    navigate("/auth/login");
  };

  const fullName = user?.user_metadata?.full_name || user?.email || "مسؤول";

  // Filter nav items based on role
  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="p-5 border-b border-border/30">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-heading font-bold text-sm text-foreground">VisaRadar</p>
            <p className="text-[10px] text-muted-foreground">
              {isAdmin ? "لوحة الإدارة" : "لوحة المشرف"}
            </p>
          </div>
        </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleNav.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? "gradient-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 ${isActive ? "" : "group-hover:text-primary"}`} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* User / Logout */}
      <div className="p-4 border-t border-border/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center">
            <span className="text-accent-foreground font-bold text-xs">
              {fullName[0]?.toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">{fullName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[240px] shrink-0 border-l border-border/30 gradient-card flex-col sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: 100 }}
              animate={{ x: 0 }}
              exit={{ x: 100 }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed top-0 right-0 bottom-0 w-[260px] z-50 gradient-card border-l border-border/30 lg:hidden"
            >
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 left-4 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border/30">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl hover:bg-muted/50 text-muted-foreground"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-heading text-xl lg:text-2xl font-bold text-foreground">{title}</h1>
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
              </div>
            </div>
            <Link
              to="/my-requests"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-colors"
            >
              📋 طلباتي
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
