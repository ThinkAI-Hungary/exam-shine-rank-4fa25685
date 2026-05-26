import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import Navigation from "@/components/Navigation";
import { Trophy, Users, Award, AlertTriangle, Loader2, Link as LinkIcon, Eye, Menu, Building2, Activity, TrendingUp, TrendingDown } from "lucide-react";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    linkedUsers: 0,
    unlinkedUsers: 0,
    totalBadges: 0,
    activeWarnings: 0,
    monitoredCompanies: 0,
    companiesWithChanges: 0,
    totalEmployees: 0,
    lastOptenCheck: null as string | null,
    recentChanges: [] as Array<{ company_name: string; current_employee_count: number; previous_employee_count: number | null }>,
  });

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: session.user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      navigate("/");
      return;
    }

    await fetchStats();
  };

  const fetchStats = async () => {
    try {
      // Get total profiles
      const { count: totalProfiles } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Get linked users
      const { count: linked } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("link_verified", true);

      // Get total badges
      const { count: badges } = await supabase
        .from("user_badges")
        .select("*", { count: "exact", head: true })
        .is("revoked_at", null);

      // Get active warnings
      const { count: warnings } = await supabase
        .from("performance_warnings")
        .select("*", { count: "exact", head: true })
        .eq("resolved", false);

      // Get OPTEN company monitoring stats
      const { data: companies } = await supabase
        .from("company_monitoring")
        .select("company_name, current_employee_count, previous_employee_count, last_checked_at")
        .eq("is_active", true);

      const monitoredCompanies = companies?.length || 0;
      const companiesWithChanges = (companies || []).filter(
        (c: any) => c.previous_employee_count !== null && c.current_employee_count !== c.previous_employee_count
      ).length;
      const totalEmployees = (companies || []).reduce(
        (sum: number, c: any) => sum + (c.current_employee_count || 0), 0
      );
      const lastOptenCheck = (companies || []).reduce(
        (latest: string | null, c: any) => {
          if (!c.last_checked_at) return latest;
          return !latest || c.last_checked_at > latest ? c.last_checked_at : latest;
        }, null
      );
      const recentChanges = (companies || []).filter(
        (c: any) => c.previous_employee_count !== null && c.current_employee_count !== c.previous_employee_count
      ).slice(0, 3);

      setStats({
        totalUsers: totalProfiles || 0,
        linkedUsers: linked || 0,
        unlinkedUsers: (totalProfiles || 0) - (linked || 0),
        totalBadges: badges || 0,
        activeWarnings: warnings || 0,
        monitoredCompanies,
        companiesWithChanges,
        totalEmployees,
        lastOptenCheck,
        recentChanges,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Vezérlőpult</h1>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:block">
            <Navigation />
          </div>

          {/* Mobile Menu */}
          <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <DrawerTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="lg:hidden border-2 hover:bg-accent"
              >
                <Menu className="w-6 h-6" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh]">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mt-4 mb-2" />
              <DrawerHeader className="pb-4">
                <DrawerTitle className="text-xl">Menü</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-6 px-6 pb-8 overflow-y-auto">
                <Navigation />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Összes Felhasználó</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                <p className="text-xs text-muted-foreground">
                  Regisztrált profilok
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Összekapcsolt</CardTitle>
                <LinkIcon className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">{stats.linkedUsers}</div>
                <p className="text-xs text-muted-foreground">
                  LearnWorlds fiókkal összekapcsolva
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aktív Jelvények</CardTitle>
                <Award className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalBadges}</div>
                <p className="text-xs text-muted-foreground">
                  Jelenleg odaítélve
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Figyelmeztetések</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{stats.activeWarnings}</div>
                <p className="text-xs text-muted-foreground">
                  Megoldásra vár
                </p>
              </CardContent>
            </Card>
          </div>

          {/* OPTEN Monitoring Row */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monitorozott Cégek</CardTitle>
                <Building2 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{stats.monitoredCompanies}</div>
                <p className="text-xs text-muted-foreground">
                  Összesen {stats.totalEmployees} alkalmazott
                </p>
              </CardContent>
            </Card>

            <Card className={stats.companiesWithChanges > 0 ? "border-amber-500/20 bg-amber-500/[0.02]" : ""}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Létszámváltozások</CardTitle>
                <Activity className={`h-4 w-4 ${stats.companiesWithChanges > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stats.companiesWithChanges > 0 ? "text-amber-600" : ""}`}>{stats.companiesWithChanges}</div>
                <p className="text-xs text-muted-foreground">
                  Cég létszáma változott
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Utolsó OPTEN Ellenőrzés</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">
                  {stats.lastOptenCheck
                    ? new Date(stats.lastOptenCheck).toLocaleDateString("hu-HU", { month: "short", day: "numeric" })
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  OPTEN API lekérdezés
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Gyors Műveletek</CardTitle>
                <CardDescription>Gyakran használt admin funkciók</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  className="w-full justify-start" 
                  variant="outline"
                  onClick={() => navigate("/admin/user-linking")}
                >
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Felhasználó Összekapcsolás Kezelése
                </Button>
                <Button 
                  className="w-full justify-start" 
                  variant="outline"
                  onClick={() => navigate("/admin/badges")}
                >
                  <Award className="mr-2 h-4 w-4" />
                  Összes Jelvény Megtekintése
                </Button>
                <Button 
                  className="w-full justify-start" 
                  variant="outline"
                  onClick={() => navigate("/")}
                >
                  <Trophy className="mr-2 h-4 w-4" />
                  Ranglista Megtekintése
                </Button>
                <Button 
                  className="w-full justify-start" 
                  variant="outline"
                  onClick={() => navigate("/monitoring")}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  OPTEN Cégfigyelés
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Állapot Összefoglaló</CardTitle>
                <CardDescription>Rendszer áttekintés</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Összekapcsolási arány</span>
                  <span className="text-sm font-medium">
                    {stats.totalUsers > 0 
                      ? Math.round((stats.linkedUsers / stats.totalUsers) * 100) 
                      : 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Nem összekapcsolt</span>
                  <span className="text-sm font-medium">{stats.unlinkedUsers}</span>
                </div>
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">OPTEN Változások</p>
                  {stats.recentChanges.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nincs aktuális változás</p>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.recentChanges.map((c: any, i: number) => {
                        const diff = c.current_employee_count - (c.previous_employee_count || 0);
                        return (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="truncate mr-2">{c.company_name}</span>
                            <span className={`font-medium flex items-center gap-1 ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                              {diff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {diff > 0 ? "+" : ""}{diff}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
