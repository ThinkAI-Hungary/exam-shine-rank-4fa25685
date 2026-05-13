import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Trophy, Code, RefreshCw, Users, User } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Leaderboard from "@/components/Leaderboard";
import StoreLeaderboard from "@/components/StoreLeaderboard";
import { toast } from "sonner";


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

interface LeaderboardEntry {
  rank: number;
  username: string;
  user_id: string;
  email: string | null;
  total_score: number;
  exam_count: number;
  average_score: number;
  aruhaz: string[];
  beosztas: string[];
  badges?: BadgeData[];
  start_of_empl?: string;
}

const Index = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [filteredLeaderboard, setFilteredLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [apiCallsUsed, setApiCallsUsed] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [leaderboardView, setLeaderboardView] = useState<'individual' | 'store'>('individual');

  const embedCode = `<iframe 
  src="${window.location.origin}/embed" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #e5e7eb; border-radius: 0.5rem;"
></iframe>`;

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("leaderboard_cache")
        .select(`
          *,
          users!inner(username, email, aruhaz, beosztas, start_of_empl)
        `)
        .order("rank", { ascending: true });

      if (error) throw error;

      // Fetch badges for all users
      const userIds = (data || []).map((item: any) => item.user_id);
      const { data: badgesData } = await supabase
        .from('user_badges')
        .select('*, badge_definitions(*)')
        .in('user_id', userIds)
        .is('revoked_at', null);

      // Group badges by user_id
      const badgesByUser = (badgesData || []).reduce((acc: any, badge: any) => {
        if (!acc[badge.user_id]) acc[badge.user_id] = [];
        acc[badge.user_id].push(badge);
        return acc;
      }, {});

      const EXCLUDED_USERNAMES = ['LW DEV', 'LWSupport Test'];
      
      const formattedData: LeaderboardEntry[] = (data || [])
        .filter((item: any) => !EXCLUDED_USERNAMES.includes(item.users.username))
        .map((item: any) => ({
          rank: item.rank,
          username: item.users.username,
          user_id: item.user_id,
          email: item.users.email,
          total_score: item.total_score,
          exam_count: item.exam_count,
          average_score: item.average_score,
          aruhaz: item.users.aruhaz || [],
          beosztas: item.users.beosztas || [],
          badges: badgesByUser[item.user_id] || [],
          start_of_empl: item.users.start_of_empl,
        }))
        .sort((a, b) => b.average_score - a.average_score)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      setLeaderboard(formattedData);
      setFilteredLeaderboard(formattedData);
      
      // Extract unique aruhaz tags
      const tags = new Set<string>();
      formattedData.forEach(entry => {
        entry.aruhaz.forEach(tag => tags.add(tag));
      });
      setAvailableTags(Array.from(tags).sort());
    } catch (error: any) {
      toast.error("Failed to load leaderboard");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTag) {
      const filtered = leaderboard.filter(entry => 
        entry.aruhaz.includes(selectedTag)
      );
      setFilteredLeaderboard(filtered);
    } else {
      setFilteredLeaderboard(leaderboard);
    }
  }, [selectedTag, leaderboard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const startTime = Date.now();
    let logData: any = {
      user_identifier: 'Anonymous',
      is_selective_refresh: !!selectedUserId,
      selected_user_id: selectedUserId,
    };
    
    try {
      const body = selectedUserId 
        ? { options: { userIds: [selectedUserId], limitUsers: 0, limitCourses: 0 } }
        : { options: { limitUsers: 0, limitCourses: 0 } };
      
      const { data, error } = await supabase.functions.invoke('fetch-leaderboard', { body });
      
      if (error) throw error;
      
      // Log success
      logData.api_calls = data?.apiCalls || 0;
      await supabase.from('refresh_logs').insert(logData);
      
      // Evaluate badges after fetching leaderboard data
      console.log('Evaluating badges...');
      const badgeParams = selectedUserId ? { user_id: selectedUserId } : {};
      await supabase.functions.invoke('evaluate-badges', { body: badgeParams });
      
      const message = selectedUserId 
        ? `Selected user refreshed! (${data?.apiCalls || '?'} API calls)`
        : `Full leaderboard and badges refreshed! (${data?.apiCalls || '?'} API calls)`;
      
      toast.success(message);
      if (data?.apiCalls) setApiCallsUsed(data.apiCalls);

      // Fetch the updated data with JOIN to get user info
      setTimeout(() => { fetchLeaderboard(); }, 1500);
    } catch (error: any) {
      // Log error
      logData.error_message = error?.message || 'Unknown error';
      logData.api_calls = 0;
      try {
        await supabase.from('refresh_logs').insert(logData);
      } catch (logError) {
        console.error('Failed to log refresh error:', logError);
      }
      
      toast.error("Failed to refresh leaderboard");
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCourseSync = async () => {
    setSyncing(true);
    toast.info("Szinkronizálás kurzusok alapján... Ez akár egy percig is eltarthat.");
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-learnworlds', {
        body: { options: {} }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success(
          `Szinkronizálás kész! ${data.examResultsSaved} vizsga eredmény mentve, ${data.usersUpdated} felhasználó frissítve. (${data.apiCalls} API hívás)`
        );
        setApiCallsUsed(data.apiCalls);
        
        // Evaluate badges after sync
        console.log('Evaluating badges...');
        await supabase.functions.invoke('evaluate-badges', {});
        
        // Refresh the leaderboard view
        setTimeout(() => { fetchLeaderboard(); }, 1500);
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (error: any) {
      toast.error(`Szinkronizálás sikertelen: ${error.message}`);
      console.error('Course sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };
  return (
    <div>
      {/* Leaderboard-specific toolbar */}
      <div className="border-b bg-muted/30">
        <div className="max-w-full px-4 sm:px-6 py-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Desktop Controls */}
            <div className="hidden lg:flex items-center gap-2 ml-auto">
              <Select value={selectedUserId || "all"} onValueChange={(value) => setSelectedUserId(value === "all" ? null : value)}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Válassz felhasználót (vagy mindet)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 Összes felhasználó (Teljes frissítés)</SelectItem>
                  <SelectSeparator />
                  {leaderboard.map((entry) => (
                    <SelectItem key={entry.user_id} value={entry.user_id}>
                      {entry.username} {entry.email && `(${entry.email})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                variant="default" 
                size="sm" 
                onClick={handleCourseSync}
                disabled={refreshing || syncing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Szinkronizálás...' : 'Összes felhasználó frissítése'}
              </Button>
              
              {apiCallsUsed && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Utolsó: {apiCallsUsed} API hívás
                </span>
              )}
          
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Code className="w-4 h-4 mr-2" />
                    Kód beágyazása
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ranglista beágyazása</DialogTitle>
                    <DialogDescription>
                      Másold ki ezt a kódot a ranglista weboldaladba történő beágyazásához
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea 
                    value={embedCode} 
                    readOnly 
                    className="font-mono text-sm h-32"
                    onClick={(e) => e.currentTarget.select()}
                  />
                </DialogContent>
              </Dialog>
            </div>

            {/* Mobile Controls */}
            <div className="flex lg:hidden items-center gap-2 w-full">
              <Select value={selectedUserId || "all"} onValueChange={(value) => setSelectedUserId(value === "all" ? null : value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Válassz felhasználót" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 Összes felhasználó</SelectItem>
                  <SelectSeparator />
                  {leaderboard.map((entry) => (
                    <SelectItem key={entry.user_id} value={entry.user_id}>
                      {entry.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                variant="default" 
                size="sm" 
                onClick={handleCourseSync}
                disabled={refreshing || syncing}
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">Ranglista betöltése...</div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <Card className="shadow-card">
              <CardHeader className="text-center space-y-4">
                <div>
                  <CardTitle className="text-3xl font-bold">Ranglista</CardTitle>
                  <CardDescription>
                    Az összes kurzuson szerzett átlag pontszám alapján rangsorolva
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Tabs value={leaderboardView} onValueChange={(v) => setLeaderboardView(v as typeof leaderboardView)}>
                    <TabsList className="flex-wrap h-auto">
                      <TabsTrigger value="individual" className="gap-1.5">
                        <User className="w-4 h-4" />
                        Egyéni
                      </TabsTrigger>
                      <TabsTrigger value="store" className="gap-1.5">
                        <Users className="w-4 h-4" />
                        Áruház szint
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {availableTags.length > 0 && leaderboardView === 'individual' && (
                    <Select value={selectedTag || "all"} onValueChange={(value) => setSelectedTag(value === "all" ? null : value)}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Szűrés címke szerint" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Összes címke</SelectItem>
                        <SelectSeparator />
                        {availableTags.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag.replace(/^cf_aruhaz_/, '')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {leaderboardView === 'individual' ? (
                  <Leaderboard entries={filteredLeaderboard} />
                ) : (
                  <StoreLeaderboard entries={leaderboard} />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
