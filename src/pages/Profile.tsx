import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link as LinkIcon, CheckCircle, XCircle, Award, BookOpen, TrendingUp, Target, Trophy } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import BadgeDisplay from "@/components/BadgeDisplay";
import { WarningIndicator } from "@/components/WarningIndicator";

interface Profile {
  id: string;
  email: string;
  learnworlds_user_id: string | null;
  learnworlds_email: string | null;
  linked_at: string | null;
  link_verified: boolean;
  link_method: string | null;
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

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [examStats, setExamStats] = useState<{
    total: number;
    avgScore: number;
    passRate: number;
    passed: number;
  } | null>(null);
  const [perfMetrics, setPerfMetrics] = useState<{
    exam_performance_pct: number;
    training_activity_pct: number;
    overall_performance_pct: number;
    years_of_service: number;
  } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    await fetchProfile();
  };

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      setLinkEmail(data.email);

      // Fetch user's badges if they have a linked LearnWorlds account
      if (data.learnworlds_user_id) {
        const { data: badgesData } = await supabase
          .from('user_badges')
          .select('*, badge_definitions(*)')
          .eq('user_id', data.learnworlds_user_id)
          .is('revoked_at', null)
          .order('awarded_at', { ascending: false });
        
        setBadges(badgesData || []);

        // Fetch exam results for stats
        const { data: examData } = await supabase
          .from('exam_results')
          .select('score')
          .eq('user_id', data.learnworlds_user_id);

        if (examData && examData.length > 0) {
          const total = examData.length;
          const avgScore = examData.reduce((sum: number, e: any) => sum + e.score, 0) / total;
          const passed = examData.filter((e: any) => e.score >= 60).length;
          setExamStats({ total, avgScore, passRate: (passed / total) * 100, passed });
        }

        // Fetch performance metrics
        const { data: metricsData } = await supabase
          .from('user_performance_metrics')
          .select('exam_performance_pct, training_activity_pct, overall_performance_pct, years_of_service')
          .eq('user_id', data.learnworlds_user_id)
          .eq('evaluation_period', 'last_year')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (metricsData) setPerfMetrics(metricsData);
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      toast({
        title: "Hiba",
        description: "A profil betöltése sikertelen",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAccount = async () => {
    if (!linkEmail) {
      toast({
        title: "Hiba",
        description: "Kérjük, adja meg az email címet",
        variant: "destructive",
      });
      return;
    }

    setLinking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/link-learnworlds-account`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: linkEmail,
            method: "self",
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Linking failed");
      }

      toast({
        title: "Siker!",
        description: "Fiókja sikeresen össze lett kapcsolva a LearnWorlds fiókkal",
      });

      await fetchProfile();
    } catch (error: any) {
      console.error("Error linking account:", error);
      toast({
        title: "Hiba",
        description: error.message || "A fiók összekapcsolása sikertelen",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Profilom</h1>
          <Button variant="outline" onClick={handleSignOut}>
            Kijelentkezés
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fiók Információk</CardTitle>
            <CardDescription>
              Az Ön SupabaseAuth fiókjának adatai
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={profile?.email || ""} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LearnWorlds Összekapcsolás</CardTitle>
            <CardDescription>
              Kapcsolja össze fiókját a LearnWorlds rendszerrel a teljes funkcionalitáshoz
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile?.link_verified ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Fiók összekapcsolva</span>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>LearnWorlds User ID: {profile.learnworlds_user_id}</p>
                  <p>LearnWorlds Email: {profile.learnworlds_email}</p>
                  <p>Összekapcsolás módja: {profile.link_method === 'auto' ? 'Automatikus' : profile.link_method === 'self' ? 'Saját' : 'Admin'}</p>
                  <p>Összekapcsolva: {new Date(profile.linked_at!).toLocaleString('hu-HU')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-orange-600">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Fiók nincs összekapcsolva</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Adja meg a LearnWorlds fiókjához tartozó email címet az összekapcsoláshoz
                </p>
                <div className="space-y-2">
                  <Label htmlFor="link-email">LearnWorlds Email Cím</Label>
                  <Input
                    id="link-email"
                    type="email"
                    placeholder="pelda@email.com"
                    value={linkEmail}
                    onChange={(e) => setLinkEmail(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleLinkAccount}
                  disabled={linking}
                  className="w-full"
                >
                  {linking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Összekapcsolás...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Fiók Összekapcsolása
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Jelvényeim
            </CardTitle>
            <CardDescription>
              Az Ön által megszerzett jelvények
            </CardDescription>
          </CardHeader>
          <CardContent>
            {badges.length > 0 ? (
              <BadgeDisplay badges={badges} />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Még nincsenek jelvényei</p>
                {!profile?.link_verified && (
                  <p className="text-sm mt-2">Kapcsolja össze fiókját a LearnWorlds rendszerrel a jelvények megszerzéséhez</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Warning indicator */}
        {profile?.learnworlds_user_id && (
          <WarningIndicator userId={profile.learnworlds_user_id} variant="card" />
        )}

        {/* Statistics */}
        {profile?.link_verified && examStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Statisztikáim
              </CardTitle>
              <CardDescription>
                Vizsga és képzési teljesítmény áttekintés
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Összes vizsga</span>
                  </div>
                  <p className="text-2xl font-bold">{examStats.total}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-4 h-4 text-yellow-600" />
                    <span className="text-xs text-muted-foreground">Átlag pontszám</span>
                  </div>
                  <p className="text-2xl font-bold">{examStats.avgScore.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-muted-foreground">Sikerességi arány</span>
                  </div>
                  <p className="text-2xl font-bold">{examStats.passRate.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{examStats.passed}/{examStats.total} sikeres</p>
                </div>
                {perfMetrics && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Award className="w-4 h-4 text-accent" />
                      <span className="text-xs text-muted-foreground">Munkaviszony</span>
                    </div>
                    <p className="text-2xl font-bold">{perfMetrics.years_of_service.toFixed(1)} év</p>
                  </div>
                )}
              </div>

              {/* Performance bars */}
              {perfMetrics && (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span>Vizsga teljesítmény</span>
                      <span className="font-semibold">{perfMetrics.exam_performance_pct.toFixed(1)}%</span>
                    </div>
                    <Progress value={perfMetrics.exam_performance_pct} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span>Képzési aktivitás</span>
                      <span className="font-semibold">{perfMetrics.training_activity_pct.toFixed(1)}%</span>
                    </div>
                    <Progress value={perfMetrics.training_activity_pct} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span>Összteljesítmény</span>
                      <span className="font-semibold">{perfMetrics.overall_performance_pct.toFixed(1)}%</span>
                    </div>
                    <Progress value={perfMetrics.overall_performance_pct} className="h-2" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Button variant="outline" onClick={() => navigate("/")}>
          Vissza a főoldalra
        </Button>
      </div>
    </div>
  );
};

export default Profile;
