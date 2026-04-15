import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
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
import MyDevices from "./pages/MyDevices";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ContactUs from "./pages/ContactUs";
import ContactMessages from "./pages/ContactMessages";
import Profile from "./pages/Profile";
import PaymentSettings from "./pages/PaymentSettings";
import VisaMonitorDashboard from "./pages/VisaMonitorDashboard";
import NotificationSettings from "./pages/NotificationSettings";
import VisaCountries from "./pages/VisaCountries";
import CountryVisa from "./pages/CountryVisa";
import ManageReviews from "./pages/ManageReviews";
import ManageReferrals from "./pages/ManageReferrals";
import SiteSettings from "./pages/SiteSettings";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-center" dir="rtl" />
      <BrowserRouter>
        <AuthProvider>
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

      {/* Protected routes */}
      <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
      <Route path="/dashboard/jobs" element={<AdminRoute><ManageJobs /></AdminRoute>} />
      <Route path="/dashboard/notifications" element={<AdminRoute><SendNotification /></AdminRoute>} />
      <Route path="/dashboard/requests" element={<AdminRoute><AdminRequests /></AdminRoute>} />
      <Route path="/dashboard/users" element={<AdminRoute adminOnly><ManageUsers /></AdminRoute>} />
      <Route path="/dashboard/email-log" element={<AdminRoute adminOnly><EmailLog /></AdminRoute>} />
      <Route path="/dashboard/contact-messages" element={<AdminRoute><ContactMessages /></AdminRoute>} />
      <Route path="/dashboard/payment-settings" element={<AdminRoute adminOnly><PaymentSettings /></AdminRoute>} />
      <Route path="/dashboard/visa-monitor" element={<AdminRoute><VisaMonitorDashboard /></AdminRoute>} />
      <Route path="/dashboard/reviews" element={<AdminRoute><ManageReviews /></AdminRoute>} />
      <Route path="/dashboard/referrals" element={<AdminRoute adminOnly><ManageReferrals /></AdminRoute>} />
      <Route path="/dashboard/site-settings" element={<AdminRoute adminOnly><SiteSettings /></AdminRoute>} />
      <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
      <Route path="/my-devices" element={<ProtectedRoute><MyDevices /></ProtectedRoute>} />
      <Route path="/subscribe" element={<ProtectedRoute><SubscribeRequest /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/notification-settings" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
