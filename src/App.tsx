import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Embed from "./pages/Embed";
import EmbedBadges from "./pages/EmbedBadges";
import Auth from "./pages/Auth";
import UserProfile from "./pages/UserProfile";
import Profile from "./pages/Profile";
import AdminUserLinking from "./pages/AdminUserLinking";
import AdminDashboard from "./pages/AdminDashboard";
import AdminBadges from "./pages/AdminBadges";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/embed" element={<Embed />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/profile/:userId" element={<UserProfile />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin/user-linking" element={<AdminUserLinking />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/badges" element={<AdminBadges />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
