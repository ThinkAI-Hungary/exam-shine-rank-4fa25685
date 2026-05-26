import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useOptenNotifications } from "@/hooks/useOptenNotifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import {
  Trophy,
  Users,
  BarChart3,
  UserCog,
  User,
  LogOut,
  UserCircle,
  Shield,
  Menu,
  GraduationCap,
  Moon,
  Sun,
  BookOpen,
  RefreshCw,
  Building2,
} from "lucide-react";

interface NavTab {
  value: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  adminOnly?: boolean;
}

const NAV_TABS: NavTab[] = [
  {
    value: "leaderboard",
    label: "Ranglista",
    icon: <Trophy className="w-4 h-4" />,
    path: "/",
  },
  {
    value: "students",
    label: "Hallgatók",
    icon: <Users className="w-4 h-4" />,
    path: "/students",
    adminOnly: true,
  },
  {
    value: "dashboard",
    label: "Teljesítmény",
    icon: <BarChart3 className="w-4 h-4" />,
    path: "/performance",
    adminOnly: true,
  },
  {
    value: "management",
    label: "Kezelés",
    icon: <UserCog className="w-4 h-4" />,
    path: "/management",
    adminOnly: true,
  },
  {
    value: "courses",
    label: "Kurzusok",
    icon: <BookOpen className="w-4 h-4" />,
    path: "/courses",
    adminOnly: true,
  },
  {
    value: "groups",
    label: "Csoportok",
    icon: <Users className="w-4 h-4" />,
    path: "/groups",
    adminOnly: true,
  },
  {
    value: "monitoring",
    label: "Cégfigyelés",
    icon: <Building2 className="w-4 h-4" />,
    path: "/monitoring",
    adminOnly: true,
  },
];

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  // Real-time push notifications for OPTEN changes
  useOptenNotifications(isAdmin);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        checkAdminRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    await checkAdminRole(session.user.id);
    setLoading(false);
  };

  const checkAdminRole = async (userId: string) => {
    try {
      const { data } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      setIsAdmin(data || false);
    } catch (error) {
      console.error("Error checking admin role:", error);
      setIsAdmin(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    toast({ title: "Szinkronizálás indítása...", description: "A LearnWorlds adatok frissítése folyamatban." });
    try {
      const { data, error } = await supabase.functions.invoke('sync-learnworlds', {
        body: {},
      });
      if (error) throw error;
      toast({
        title: "✅ Szinkronizálás kész",
        description: `${data?.coursesProcessed || 0} kurzus, ${data?.examResultsSaved || 0} vizsga, ${data?.enrollmentsSynced || 0} beiratkozás, ${data?.certificatesSynced || 0} tanúsítvány (${((data?.durationMs || 0) / 1000).toFixed(1)}s)`,
      });
    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: "❌ Szinkronizálás sikertelen",
        description: err instanceof Error ? err.message : "Ismeretlen hiba",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Determine active tab from current path
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === "/" || path === "/embed") return "leaderboard";
    if (path.startsWith("/students")) return "students";
    if (path.startsWith("/performance")) return "dashboard";
    if (path.startsWith("/management")) return "management";
    if (path.startsWith("/courses")) return "courses";
    if (path.startsWith("/groups")) return "groups";
    if (path.startsWith("/monitoring")) return "monitoring";
    if (path.startsWith("/admin")) return "management";
    return "leaderboard";
  };

  const handleTabChange = (value: string) => {
    const tab = NAV_TABS.find((t) => t.value === value);
    if (tab) {
      navigate(tab.path);
    }
  };

  const visibleTabs = NAV_TABS.filter((tab) => !tab.adminOnly || isAdmin);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-glow rounded-xl flex items-center justify-center shadow-glow animate-pulse">
            <GraduationCap className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Betöltés...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted overflow-hidden">
      {/* Global Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50 glass-header">
        <div className="max-w-full px-4 sm:px-6">
          {/* Top row: Logo + User menu */}
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-glow rounded-xl flex items-center justify-center shadow-glow transition-transform group-hover:scale-105">
                <GraduationCap className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent whitespace-nowrap hidden sm:block">
                Diego Learning Dashboard
              </h1>
            </Link>

            {/* Desktop: Navigation Tabs */}
            <div className="hidden md:flex items-center">
              <Tabs value={getActiveTab()} onValueChange={handleTabChange}>
                <TabsList className="bg-muted/50 h-9">
                  {visibleTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary px-3 transition-all duration-200 hover:bg-background/60 hover:text-foreground relative data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-2 data-[state=active]:after:right-2 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:rounded-full"
                    >
                      {tab.icon}
                      <span className="hidden lg:inline">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Right side: Theme toggle + User menu */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDarkMode(!darkMode)}
                className="w-8 h-8 rounded-lg hover:bg-muted transition-colors"
                title={darkMode ? 'Világos mód' : 'Sötét mód'}
              >
                {darkMode ? (
                  <Sun className="w-4 h-4 text-yellow-500 transition-transform hover:rotate-45" />
                ) : (
                  <Moon className="w-4 h-4 text-muted-foreground transition-transform hover:-rotate-12" />
                )}
              </Button>
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <span className="hidden sm:inline text-sm max-w-[150px] truncate">
                        {user.email}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium truncate">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {isAdmin ? "Adminisztrátor" : "Felhasználó"}
                      </p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/profile" className="cursor-pointer">
                        <UserCircle className="w-4 h-4 mr-2" />
                        Profil
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/dashboard" className="cursor-pointer">
                            <Shield className="w-4 h-4 mr-2" />
                            Admin Vezérlőpult
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/user-linking" className="cursor-pointer">
                            <Users className="w-4 h-4 mr-2" />
                            Felhasználó Összekapcsolás
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSync} disabled={syncing} className="cursor-pointer">
                          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                          {syncing ? 'Szinkronizálás...' : 'LearnWorlds Szinkronizálás'}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                      <LogOut className="w-4 h-4 mr-2" />
                      Kijelentkezés
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Mobile Menu Button */}
              <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <DrawerTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="md:hidden border-2 hover:bg-accent/10"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-h-[85vh]">
                  <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mt-4 mb-2" />
                  <DrawerHeader className="pb-4">
                    <DrawerTitle className="text-xl">Navigáció</DrawerTitle>
                  </DrawerHeader>
                  <div className="flex flex-col gap-2 px-6 pb-8 overflow-y-auto">
                    {visibleTabs.map((tab) => (
                      <Button
                        key={tab.value}
                        variant={getActiveTab() === tab.value ? "default" : "ghost"}
                        className="w-full justify-start gap-3 h-12 text-base"
                        onClick={() => {
                          handleTabChange(tab.value);
                          setMobileMenuOpen(false);
                        }}
                      >
                        {tab.icon}
                        {tab.label}
                      </Button>
                    ))}
                    <div className="border-t my-2" />
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-3 h-12 text-base"
                          onClick={() => {
                            navigate("/admin/dashboard");
                            setMobileMenuOpen(false);
                          }}
                        >
                          <Shield className="w-4 h-4" />
                          Admin Vezérlőpult
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-3 h-12 text-base"
                          onClick={() => {
                            navigate("/admin/badges");
                            setMobileMenuOpen(false);
                          }}
                        >
                          <Trophy className="w-4 h-4" />
                          Jelvények Kezelése
                        </Button>
                      </>
                    )}
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 overflow-y-auto custom-scroll">
        <div key={location.pathname} className="page-enter">
          <Outlet context={{ user, isAdmin }} />
        </div>
      </main>
      <ScrollToTop />
    </div>
  );
};

export default AppLayout;
