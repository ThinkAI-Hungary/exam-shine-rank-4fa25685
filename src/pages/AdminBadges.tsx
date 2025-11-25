import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Award, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-6">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => navigate("/admin/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Vissza
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Award className="w-8 h-8" />
              Összes Jelvény
            </h1>
            <p className="text-muted-foreground">Jelvények és tulajdonosaik áttekintése</p>
          </div>
        </div>

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