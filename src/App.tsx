import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import Index from "./pages/Index";
import Jobs from "./pages/Jobs";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import ManageJobs from "./pages/ManageJobs";
import JobDetails from "./pages/JobDetails";
import Pricing from "./pages/Pricing";
import SendNotification from "./pages/SendNotification";
import SubscribeRequest from "./pages/SubscribeRequest";
import AdminRequests from "./pages/AdminRequests";
import ManageUsers from "./pages/ManageUsers";
import MyRequests from "./pages/MyRequests";
import EmailLog from "./pages/EmailLog";
import ErrorLog from "./pages/ErrorLog";
import MyDevices from "./pages/MyDevices";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ContactUs from "./pages/ContactUs";
import ContactMessages from "./pages/ContactMessages";
import MyMessages from "./pages/MyMessages";
import Profile from "./pages/Profile";
import PaymentSettings from "./pages/PaymentSettings";
import VisaMonitorDashboard from "./pages/VisaMonitorDashboard";
import NotificationSettings from "./pages/NotificationSettings";
import VisaCountries from "./pages/VisaCountries";
import CountryVisa from "./pages/CountryVisa";
import ManageReviews from "./pages/ManageReviews";
import ManageReferrals from "./pages/ManageReferrals";
import SiteSettings from "./pages/SiteSettings";
import ExpiryReminderLog from "./pages/ExpiryReminderLog";
import ChatHistory from "./pages/ChatHistory";
import AdminChatConversations from "./pages/AdminChatConversations";
import Backup from "./pages/Backup";
import TelegramLink from "./pages/TelegramLink";
import Billing from "./pages/Billing";
import BillingEvents from "./pages/BillingEvents";
import AdminTelegramUsers from "./pages/AdminTelegramUsers";
import AdminTelegramBroadcast from "./pages/AdminTelegramBroadcast";
import AdminTelegramLinkLog from "./pages/AdminTelegramLinkLog";
import Install from "./pages/Install";
import ManagePackages from "./pages/ManagePackages";
import VisaProfile from "./pages/VisaProfile";
import ShortcutsHelp from "./pages/help/Shortcuts";
import VisaCalendar from "./pages/VisaCalendar";
import AdminVisaAppointments from "./pages/AdminVisaAppointments";
import AdminVisaOpenings from "./pages/AdminVisaOpenings";
import AdminVisaSignals from "./pages/AdminVisaSignals";
import AdminTelegramSources from "./pages/AdminTelegramSources";
import AdminEnterpriseMonitor from "./pages/AdminEnterpriseMonitor";
import AdminProxyManager from "./pages/AdminProxyManager";
import AdminBrowserVerifications from "./pages/AdminBrowserVerifications";
import AdminAntiFalsePositive from "./pages/AdminAntiFalsePositive";
import AdminSmartBan from "./pages/AdminSmartBan";
import AdminHistoricalIntel from "./pages/AdminHistoricalIntel";
import AdminProxyIntelligence from "./pages/AdminProxyIntelligence";
import AdminDistributedScan from "./pages/AdminDistributedScan";
import AdminAlertDelivery from "./pages/AdminAlertDelivery";
import AdminDetectionReplay from "./pages/AdminDetectionReplay";
import AdminAntiBot from "./pages/AdminAntiBot";
import AdminStealthAnalytics from "./pages/AdminStealthAnalytics";
import AdminVerificationGateway from "./pages/AdminVerificationGateway";
import AdminDeployWorker from "./pages/AdminDeployWorker";
import VerifyChallenge from "./pages/VerifyChallenge";
import SubscriberVisaMonitor from "./pages/SubscriberVisaMonitor";
import SubscriberRoute from "@/components/SubscriberRoute";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
import VisaOpenAlertsBridge from "@/hooks/useVisaOpenAlerts";
import HardReloadButton from "@/components/HardReloadButton";

const queryClient = new QueryClient();

function GlobalShortcuts() {
  useGlobalShortcuts();
  return null;
}

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-center" dir="rtl" />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <GlobalShortcuts />
          <NotificationPermissionBanner />
          <VisaOpenAlertsBridge />
          <HardReloadButton />
          <Routes>
      {/* Public routes */}
      <Route path="/" element={<Index />} />
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/jobs/:id" element={<JobDetails />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/register" element={<Register />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/contact" element={<ContactUs />} />
      <Route path="/visa" element={<VisaCountries />} />
      <Route path="/visa/:slug" element={<CountryVisa />} />
      <Route path="/calendar" element={<VisaCalendar />} />
      <Route path="/install" element={<Install />} />
      <Route path="/help/shortcuts" element={<ShortcutsHelp />} />
      <Route path="/verify/:token" element={<VerifyChallenge />} />

      {/* Protected routes */}
      <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
      <Route path="/dashboard/jobs" element={<AdminRoute><ManageJobs /></AdminRoute>} />
      <Route path="/dashboard/notifications" element={<AdminRoute adminOnly><SendNotification /></AdminRoute>} />
      <Route path="/dashboard/requests" element={<AdminRoute><AdminRequests /></AdminRoute>} />
      <Route path="/dashboard/users" element={<AdminRoute adminOnly><ManageUsers /></AdminRoute>} />
      <Route path="/dashboard/email-log" element={<AdminRoute adminOnly><EmailLog /></AdminRoute>} />
      <Route path="/dashboard/error-log" element={<AdminRoute adminOnly><ErrorLog /></AdminRoute>} />
      <Route path="/dashboard/contact-messages" element={<AdminRoute><ContactMessages /></AdminRoute>} />
      <Route path="/dashboard/payment-settings" element={<AdminRoute adminOnly><PaymentSettings /></AdminRoute>} />
      <Route path="/dashboard/visa-monitor" element={<AdminRoute><VisaMonitorDashboard /></AdminRoute>} />
      <Route path="/dashboard/reviews" element={<AdminRoute><ManageReviews /></AdminRoute>} />
      <Route path="/dashboard/referrals" element={<AdminRoute adminOnly><ManageReferrals /></AdminRoute>} />
      <Route path="/dashboard/site-settings" element={<AdminRoute adminOnly><SiteSettings /></AdminRoute>} />
      <Route path="/dashboard/reminder-log" element={<AdminRoute adminOnly><ExpiryReminderLog /></AdminRoute>} />
      <Route path="/dashboard/chat-conversations" element={<AdminRoute adminOnly><AdminChatConversations /></AdminRoute>} />
      <Route path="/dashboard/backup" element={<AdminRoute adminOnly><Backup /></AdminRoute>} />
      <Route path="/dashboard/telegram-users" element={<AdminRoute adminOnly><AdminTelegramUsers /></AdminRoute>} />
      <Route path="/dashboard/telegram-broadcast" element={<AdminRoute adminOnly><AdminTelegramBroadcast /></AdminRoute>} />
      <Route path="/dashboard/telegram-link-log" element={<AdminRoute adminOnly><AdminTelegramLinkLog /></AdminRoute>} />
      <Route path="/dashboard/telegram-sources" element={<AdminRoute adminOnly><AdminTelegramSources /></AdminRoute>} />
      <Route path="/dashboard/packages" element={<AdminRoute adminOnly><ManagePackages /></AdminRoute>} />
      <Route path="/dashboard/appointments" element={<AdminRoute><AdminVisaAppointments /></AdminRoute>} />
      <Route path="/dashboard/visa-openings" element={<AdminRoute><AdminVisaOpenings /></AdminRoute>} />
      <Route path="/dashboard/visa-signals" element={<AdminRoute><AdminVisaSignals /></AdminRoute>} />
      <Route path="/dashboard/enterprise" element={<AdminRoute adminOnly><AdminEnterpriseMonitor /></AdminRoute>} />
      <Route path="/dashboard/proxies" element={<AdminRoute adminOnly><AdminProxyManager /></AdminRoute>} />
      <Route path="/dashboard/browser-verifications" element={<AdminRoute adminOnly><AdminBrowserVerifications /></AdminRoute>} />
      <Route path="/dashboard/anti-false-positive" element={<AdminRoute adminOnly><AdminAntiFalsePositive /></AdminRoute>} />
      <Route path="/dashboard/smart-ban" element={<AdminRoute adminOnly><AdminSmartBan /></AdminRoute>} />
      <Route path="/dashboard/historical-intelligence" element={<AdminRoute adminOnly><AdminHistoricalIntel /></AdminRoute>} />
      <Route path="/dashboard/proxy-intelligence" element={<AdminRoute adminOnly><AdminProxyIntelligence /></AdminRoute>} />
      <Route path="/dashboard/distributed-scan" element={<AdminRoute adminOnly><AdminDistributedScan /></AdminRoute>} />
      <Route path="/dashboard/alert-delivery" element={<AdminRoute adminOnly><AdminAlertDelivery /></AdminRoute>} />
      <Route path="/dashboard/detection-replay" element={<AdminRoute adminOnly><AdminDetectionReplay /></AdminRoute>} />
      <Route path="/dashboard/anti-bot" element={<AdminRoute adminOnly><AdminAntiBot /></AdminRoute>} />
      <Route path="/dashboard/stealth-analytics" element={<AdminRoute adminOnly><AdminStealthAnalytics /></AdminRoute>} />
      <Route path="/dashboard/verification-gateway" element={<AdminRoute adminOnly><AdminVerificationGateway /></AdminRoute>} />
      <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
      <Route path="/my-messages" element={<ProtectedRoute><MyMessages /></ProtectedRoute>} />
      <Route path="/my-devices" element={<ProtectedRoute><MyDevices /></ProtectedRoute>} />
      <Route path="/subscribe" element={<ProtectedRoute><SubscribeRequest /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/profile/visa" element={<ProtectedRoute><VisaProfile /></ProtectedRoute>} />
      <Route path="/profile/conversations" element={<ProtectedRoute><ChatHistory /></ProtectedRoute>} />
      <Route path="/notification-settings" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
      <Route path="/telegram-link" element={<ProtectedRoute><TelegramLink /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
      <Route path="/billing/events" element={<ProtectedRoute><BillingEvents /></ProtectedRoute>} />
      <Route path="/visa-monitor" element={<SubscriberRoute><SubscriberVisaMonitor /></SubscriberRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
