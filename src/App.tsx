import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Index from "./pages/Index";
import Embed from "./pages/Embed";
import EmbedFull from "./pages/EmbedFull";
import EmbedBadges from "./pages/EmbedBadges";
import Auth from "./pages/Auth";
import UserProfile from "./pages/UserProfile";
import Profile from "./pages/Profile";
import AdminUserLinking from "./pages/AdminUserLinking";
import AdminDashboard from "./pages/AdminDashboard";
import AdminBadges from "./pages/AdminBadges";
import Students from "./pages/Students";
import StudentDashboard from "./pages/StudentDashboard";
import PerformanceOverview from "./pages/PerformanceOverview";
import UserManagement from "./pages/UserManagement";
import Courses from "./pages/Courses";
import Groups from "./pages/Groups";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Auth page - no layout */}
          <Route path="/auth" element={<Auth />} />
          
          {/* Embed pages - standalone, no layout */}
          <Route path="/embed" element={<Embed />} />
          <Route path="/embed/badges" element={<EmbedBadges />} />

          {/* All pages under the shared AppLayout */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/students" element={<Students />} />
            <Route path="/performance/:userId" element={<StudentDashboard />} />
            <Route path="/performance" element={<PerformanceOverview />} />
            <Route path="/management" element={<UserManagement />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/profile/:userId" element={<UserProfile />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/user-linking" element={<AdminUserLinking />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/badges" element={<AdminBadges />} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
