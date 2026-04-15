import { Link, useLocation } from "react-router-dom";
import { Radar, Menu, X, LogOut, User, ChevronDown, Smartphone, ClipboardList, LayoutDashboard, Sun, Moon, Bell } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import NotificationsBell from "@/components/NotificationsBell";

const navLinks = [
  { to: "/", label: "الرئيسية" },
  { to: "/pricing", label: "الباقات" },
  { to: "/jobs", label: "الوظائف" },
  { to: "/visa", label: "دليل التأشيرات" },
  { to: "/contact", label: "اتصل بنا" },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useIsAdmin();

  const handleSignOut = async () => {
    await signOut();
    toast.success("تم تسجيل الخروج");
    navigate("/auth/login");
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

  return (
    <nav className="glass sticky top-0 z-50 border-b border-border/40">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 group">
          <Radar className="w-7 h-7 text-primary transition-transform group-hover:rotate-45" />
          <span className="font-heading text-xl font-bold text-foreground">
            Visa<span className="text-primary">Radar</span>
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === link.to
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
          >
            {theme === "dark" ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>
          <div className="w-px h-6 bg-border mx-1" />
{!loading && user ? (
            <>
              <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors outline-none">
                  <Avatar className="w-7 h-7 border border-primary/30">
                    <AvatarImage src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture} />
                    <AvatarFallback className="bg-secondary text-xs">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">{userName}</span>
                  <Badge variant={isAdmin ? "default" : "secondary"} className={`text-[10px] px-1.5 py-0 h-4 ${isAdmin ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground"}`}>
                    {isAdmin ? "مسؤول" : "مستخدم"}
                  </Badge>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                    <User className="w-4 h-4" />
                    ملفي الشخصي
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/my-requests" className="flex items-center gap-2 cursor-pointer">
                    <ClipboardList className="w-4 h-4" />
                    طلباتي
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/my-devices" className="flex items-center gap-2 cursor-pointer">
                    <Smartphone className="w-4 h-4" />
                    أجهزتي
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/notification-settings" className="flex items-center gap-2 cursor-pointer">
                    <Bell className="w-4 h-4" />
                    إعدادات الإشعارات
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="flex items-center gap-2 cursor-pointer">
                        <LayoutDashboard className="w-4 h-4" />
                        لوحة التحكم
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <>
              <Link
                to="/auth/login"
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                دخول
              </Link>
              <Link
                to="/auth/register"
                className="gradient-primary px-5 py-2 rounded-lg text-sm font-bold text-primary-foreground transition-all hover:opacity-90"
              >
                إنشاء حساب
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-border/40"
          >
            <div className="container py-4 flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={toggleTheme}
                className="px-4 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
              </button>
              <div className="h-px bg-border my-1" />
              {!loading && user ? (
                <>
                  <div className="px-4 py-2">
                    <NotificationsBell />
                  </div>
                  <span className="px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {userName}
                    <Badge variant={isAdmin ? "default" : "secondary"} className={`text-[10px] px-1.5 py-0 h-4 ${isAdmin ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground"}`}>
                      {isAdmin ? "مسؤول" : "مستخدم"}
                    </Badge>
                  </span>
                  <Link to="/profile" onClick={() => setOpen(false)} className="px-4 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                    👤 ملفي الشخصي
                  </Link>
                  <Link to="/my-requests" onClick={() => setOpen(false)} className="px-4 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                    📋 طلباتي
                  </Link>
                  <Link to="/my-devices" onClick={() => setOpen(false)} className="px-4 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                    📱 أجهزتي
                  </Link>
                  <Link to="/notification-settings" onClick={() => setOpen(false)} className="px-4 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                    🔔 إعدادات الإشعارات
                  </Link>
                  {isAdmin && (
                    <Link to="/dashboard" onClick={() => setOpen(false)} className="px-4 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                      <LayoutDashboard className="w-4 h-4" />
                      لوحة التحكم
                    </Link>
                  )}
                  <button
                    onClick={() => { setOpen(false); handleSignOut(); }}
                    className="px-4 py-3 rounded-lg text-sm text-destructive hover:bg-destructive/10 text-right flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    تسجيل الخروج
                  </button>
                </>
              ) : (
                <>
                  <Link to="/auth/login" onClick={() => setOpen(false)} className="px-4 py-3 rounded-lg text-sm text-muted-foreground">
                    تسجيل الدخول
                  </Link>
                  <Link to="/auth/register" onClick={() => setOpen(false)} className="gradient-primary px-4 py-3 rounded-lg text-sm font-bold text-primary-foreground text-center">
                    إنشاء حساب
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
