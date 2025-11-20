import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Trophy, TrendingUp, Target } from "lucide-react";
import { toast } from "sonner";
import BadgeDisplay from "@/components/BadgeDisplay";

interface UserData {
  user_id: string;
  username: string;
  email: string | null;
  current_category: string | null;
  category_achieved_at: string | null;
  start_of_empl: string | null;
  tags: string[];
}

interface PerformanceMetrics {
  exam_performance_pct: number;
  training_activity_pct: number;
  overall_performance_pct: number;
  successful_exams_count: number;
  total_exams_count: number;
  years_of_service: number;
}

interface BadgeData {
  id: string;
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

const UserProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [badges, setBadges] = useState<BadgeData[]>([]);

  useEffect(() => {
    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);

      // Fetch user data
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (userError) throw userError;
      setUserData(user);

      // Fetch current month metrics
      const { data: metricsData, error: metricsError } = await supabase
        .from('user_performance_metrics')
        .select('*')
        .eq('user_id', userId)
        .eq('evaluation_period', 'current_month')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (metricsError) console.error('Error fetching metrics:', metricsError);
      setMetrics(metricsData);

      // Fetch badges
      const { data: badgesData, error: badgesError } = await supabase
        .from('user_badges')
        .select('*, badge_definitions(*)')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('awarded_at', { ascending: false });

      if (badgesError) throw badgesError;
      setBadges(badgesData || []);

    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-6xl mx-auto">
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Vissza a ranglistához
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Felhasználó nem található</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const yearsOfService = metrics?.years_of_service || 0;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Vissza a ranglistához
        </Button>

        {/* User Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-3xl">{userData.username}</CardTitle>
                {userData.email && (
                  <p className="text-muted-foreground mt-1">{userData.email}</p>
                )}
              </div>
              {userData.current_category && (
                <Badge 
                  variant="default" 
                  className="text-lg px-4 py-2"
                  style={{
                    backgroundColor: userData.current_category === 'gold' ? '#FFD700' : 
                                   userData.current_category === 'silver' ? '#C0C0C0' : '#CD7F32',
                    color: '#000'
                  }}
                >
                  {userData.current_category.toUpperCase()}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {userData.start_of_empl && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Kezdés: {new Date(userData.start_of_empl).toLocaleDateString()}</span>
                  <span>({yearsOfService.toFixed(1)} év)</span>
                </div>
              )}
              {userData.tags && userData.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {userData.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Vizsga teljesítmény
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{metrics.exam_performance_pct.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.successful_exams_count} / {metrics.total_exams_count} vizsga sikeres
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Képzési aktivitás
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{metrics.training_activity_pct.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Részvételi arány
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Összteljesítmény
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{metrics.overall_performance_pct.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Mindkét mutató átlaga
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Jelvények
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeDisplay badges={badges} />
          </CardContent>
        </Card>

        {/* Category Progress (if applicable) */}
        {userData.current_category && metrics && (
          <Card>
            <CardHeader>
              <CardTitle>Kategória előrehaladás</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userData.current_category === 'bronze' && yearsOfService < 5 && (
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Előrehaladás ezüst felé</span>
                      <span className="text-muted-foreground">
                        {yearsOfService.toFixed(1)} / 5 év
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all" 
                        style={{ width: `${Math.min((yearsOfService / 5) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Követelmények: 5 év, 85% vizsga teljesítmény, 80% képzési aktivitás
                    </p>
                  </div>
                )}
                {userData.current_category === 'silver' && yearsOfService < 10 && (
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Előrehaladás arany felé</span>
                      <span className="text-muted-foreground">
                        {yearsOfService.toFixed(1)} / 10 év
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all" 
                        style={{ width: `${Math.min((yearsOfService / 10) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Követelmények: 10 év, 90% vizsga teljesítmény, 90% képzési aktivitás
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
