import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import Navigation from "@/components/Navigation";
import { Trophy, Users, Award, AlertTriangle, Loader2, Link as LinkIcon, Eye, Menu, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    linkedUsers: 0,
    unlinkedUsers: 0,
    totalBadges: 0,
    activeWarnings: 0,
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

      setStats({
        totalUsers: totalProfiles || 0,
        linkedUsers: linked || 0,
        unlinkedUsers: (totalProfiles || 0) - (linked || 0),
        totalBadges: badges || 0,
        activeWarnings: warnings || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAllCourses = async () => {
    setSyncing(true);
    setSyncStatus("Syncing all courses...");
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-learnworlds`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setSyncStatus(`✓ Synced ${result.exams_synced} exams from ${result.courses_processed} courses`);
      toast({
        title: "Sync Complete!",
        description: `Synced ${result.exams_synced} exam results from ${result.courses_processed} courses for ${result.unique_users} users.`,
      });

      // Refresh stats after sync
      await fetchStats();
    } catch (error: any) {
      console.error("Sync error:", error);
      setSyncStatus(`✗ Error: ${error.message}`);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync courses",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
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

          {/* Sync Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                LearnWorlds Szinkronizálás
              </CardTitle>
              <CardDescription>
                Összes kurzus és vizsga eredmény szinkronizálása
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleSyncAllCourses}
                disabled={syncing}
              >
                {syncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Szinkronizálás...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Összes felhasználó frissítése
                  </>
                )}
              </Button>
              {syncStatus && (
                <p className={`text-sm text-center ${syncStatus.startsWith('✓') ? 'text-green-600' : syncStatus.startsWith('✗') ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {syncStatus}
                </p>
              )}
            </CardContent>
          </Card>

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
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
