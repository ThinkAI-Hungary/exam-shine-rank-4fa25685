import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Loader2, Award, ArrowLeft, Menu } from "lucide-react";
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import BadgeDisplay from "@/components/BadgeDisplay";

interface BadgeData {
  id: string;
  user_id: string;
  badge_definitions: {
    badge_name: string;
    badge_type: 'category' | 'monthly_star' | 'progress' | 'aspirant';
    badge_level: string | null;
    description: string;
    icon_name: string;
    color: string;
  };
  awarded_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

interface UserWithBadges {
  user_id: string;
  username: string;
  email: string;
  badges: BadgeData[];
}

const AdminBadges = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [usersWithBadges, setUsersWithBadges] = useState<UserWithBadges[]>([]);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    try {
      const { data: isAdmin } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'admin'
      });

      if (!isAdmin) {
        navigate("/");
        return;
      }

      await fetchBadges();
    } catch (error) {
      console.error("Error checking admin role:", error);
      navigate("/");
    }
  };

  const fetchBadges = async () => {
    try {
      // Fetch all badges with user information
      const { data: badgesData, error: badgesError } = await supabase
        .from('user_badges')
        .select('*, badge_definitions(*)')
        .is('revoked_at', null)
        .order('awarded_at', { ascending: false });

      if (badgesError) throw badgesError;

      // Get unique user IDs
      const userIds = [...new Set((badgesData || []).map((b: any) => b.user_id))];

      // Fetch user information
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('user_id, username, email')
        .in('user_id', userIds);

      if (usersError) throw usersError;

      // Group badges by user
      const userMap = new Map<string, UserWithBadges>();
      
      (usersData || []).forEach((user: any) => {
        userMap.set(user.user_id, {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          badges: []
        });
      });

      (badgesData || []).forEach((badge: any) => {
        const user = userMap.get(badge.user_id);
        if (user) {
          user.badges.push(badge);
        }
      });

      setUsersWithBadges(Array.from(userMap.values()).sort((a, b) => 
        b.badges.length - a.badges.length
      ));
    } catch (error: any) {
      toast.error("Hiba történt a jelvények betöltése során");
      console.error(error);
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Vissza
            </Button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Award className="w-6 h-6" />
              <span className="hidden sm:inline">Összes Jelvény</span>
            </h1>
          </div>
          
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

      <div className="container mx-auto max-w-7xl p-6">

        <Card>
          <CardHeader>
            <CardTitle>Felhasználók és Jelvényeik</CardTitle>
            <CardDescription>
              {usersWithBadges.reduce((sum, u) => sum + u.badges.length, 0)} jelvény összesen, {usersWithBadges.length} felhasználónál
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usersWithBadges.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Award className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Még nincsenek kiosztott jelvények</p>
              </div>
            ) : (
              <div className="space-y-6">
                {usersWithBadges.map((user) => (
                  <div key={user.user_id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{user.username}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant="secondary">
                        {user.badges.length} jelvény
                      </Badge>
                    </div>
                    <BadgeDisplay badges={user.badges} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminBadges;