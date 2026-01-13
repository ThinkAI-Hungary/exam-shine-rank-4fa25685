import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Trophy, Code, RefreshCw, Menu } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";
import Navigation from "@/components/Navigation";
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
  tags: string[];
  badges?: BadgeData[];
  start_of_empl?: string;
}

interface SyncProgress {
  total: number;
  processed: number;
  success: number;
  failed: number;
  examsTotal: number;
}

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 10500; // 10.5 seconds between batches

const Index = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [filteredLeaderboard, setFilteredLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [apiCallsUsed, setApiCallsUsed] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const syncAbortRef = useRef(false);

  const embedCode = `<iframe 
  src="${window.location.origin}/embed" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #e5e7eb; border-radius: 0.5rem;"
></iframe>`;

  useEffect(() => {
    checkAuth();
  }, []);

  // Realtime subscription for leaderboard updates
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leaderboard_cache',
        },
        () => {
          console.log('Leaderboard updated via realtime');
          fetchLeaderboard();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    fetchLeaderboard();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  };

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("leaderboard_cache")
        .select(`
          *,
          users!inner(username, email, tags, start_of_empl)
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

      const formattedData: LeaderboardEntry[] = (data || []).map((item: any) => ({
        rank: item.rank,
        username: item.users.username,
        user_id: item.user_id,
        email: item.users.email,
        total_score: item.total_score,
        exam_count: item.exam_count,
        average_score: item.average_score,
        tags: item.users.tags || [],
        badges: badgesByUser[item.user_id] || [],
        start_of_empl: item.users.start_of_empl,
      }));

      setLeaderboard(formattedData);
      setFilteredLeaderboard(formattedData);
      
      // Extract unique tags
      const tags = new Set<string>();
      formattedData.forEach(entry => {
        entry.tags.forEach(tag => tags.add(tag));
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
        entry.tags.includes(selectedTag)
      );
      setFilteredLeaderboard(filtered);
    } else {
      setFilteredLeaderboard(leaderboard);
    }
  }, [selectedTag, leaderboard]);

  // Initialize sync queue with all user IDs
  const initSyncQueue = async () => {
    console.log('Initializing sync queue...');
    
    // Get all user IDs from users table
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('user_id');

    if (usersError || !allUsers) {
      throw new Error(`Failed to fetch users: ${usersError?.message}`);
    }

    // Clear existing queue
    await supabase.from('sync_queue').delete().neq('user_id', '');

    // Insert all users as pending
    const queueEntries = allUsers.map(u => ({
      user_id: u.user_id,
      status: 'pending',
      created_at: new Date().toISOString(),
    }));

    // Insert in batches to avoid payload limits
    const chunkSize = 500;
    for (let i = 0; i < queueEntries.length; i += chunkSize) {
      const chunk = queueEntries.slice(i, i + chunkSize);
      const { error } = await supabase.from('sync_queue').insert(chunk);
      if (error) {
        console.error('Error inserting queue chunk:', error);
      }
    }

    console.log(`Initialized sync queue with ${allUsers.length} users`);
    return allUsers.length;
  };

  // Process one batch and return remaining count
  const processSyncBatch = async (): Promise<{ remaining: number; success: number; failed: number; exams: number }> => {
    const { data, error } = await supabase.functions.invoke('sync-learnworlds', {
      body: { batchSize: BATCH_SIZE }
    });

    if (error) {
      throw new Error(`Sync batch failed: ${error.message}`);
    }

    return {
      remaining: data.remaining || 0,
      success: data.success || 0,
      failed: data.failed || 0,
      exams: data.exams_synced || 0,
    };
  };

  // Delay helper
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Handle full sync with recursive batching
  const handleFullSync = async () => {
    setRefreshing(true);
    syncAbortRef.current = false;
    
    try {
      // Init phase: populate sync queue
      toast.info('Szinkronizálás előkészítése...');
      const totalUsers = await initSyncQueue();
      
      setSyncProgress({
        total: totalUsers,
        processed: 0,
        success: 0,
        failed: 0,
        examsTotal: 0,
      });

      let remaining = totalUsers;
      let totalProcessed = 0;
      let totalSuccess = 0;
      let totalFailed = 0;
      let totalExams = 0;

      // Process phase: loop until queue is empty
      while (remaining > 0 && !syncAbortRef.current) {
        console.log(`Processing batch... ${remaining} users remaining`);
        
        const result = await processSyncBatch();
        
        totalProcessed += BATCH_SIZE;
        totalSuccess += result.success;
        totalFailed += result.failed;
        totalExams += result.exams;
        remaining = result.remaining;

        setSyncProgress({
          total: totalUsers,
          processed: Math.min(totalProcessed, totalUsers),
          success: totalSuccess,
          failed: totalFailed,
          examsTotal: totalExams,
        });

        // Refresh leaderboard to show updates
        fetchLeaderboard();

        // Wait before next batch (10.5 seconds to stay under rate limit)
        if (remaining > 0) {
          console.log(`Waiting ${BATCH_DELAY_MS}ms before next batch...`);
          await delay(BATCH_DELAY_MS);
        }
      }

      // Evaluate badges after sync
      console.log('Evaluating badges...');
      await supabase.functions.invoke('evaluate-badges', { body: {} });

      toast.success(`Szinkronizálás kész! ${totalSuccess} felhasználó, ${totalExams} vizsga eredmény`);
      
      // Log the sync
      await supabase.from('refresh_logs').insert({
        user_identifier: user?.email || 'Unknown',
        is_selective_refresh: false,
        api_calls: totalSuccess, // Each user = 1 API call with new endpoint
      });

      fetchLeaderboard();
      
    } catch (error: any) {
      console.error('Full sync error:', error);
      toast.error(`Szinkronizálási hiba: ${error.message}`);
    } finally {
      setRefreshing(false);
      setSyncProgress(null);
    }
  };

  // Handle single user refresh (uses old endpoint for now)
  const handleSingleUserRefresh = async () => {
    if (!selectedUserId) return;
    
    setRefreshing(true);
    try {
      // For single user, use the questionnaires endpoint directly
      const { data, error } = await supabase.functions.invoke('sync-learnworlds', {
        body: { batchSize: 1 }
      });

      // First add the single user to queue
      await supabase.from('sync_queue').upsert({
        user_id: selectedUserId,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      // Then process
      const result = await supabase.functions.invoke('sync-learnworlds', {
        body: { batchSize: 1 }
      });

      if (result.error) throw result.error;

      await supabase.functions.invoke('evaluate-badges', { body: { user_id: selectedUserId } });
      
      toast.success('Felhasználó frissítve!');
      fetchLeaderboard();
      
    } catch (error: any) {
      toast.error('Frissítési hiba');
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    if (selectedUserId) {
      await handleSingleUserRefresh();
    } else {
      await handleFullSync();
    }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-full px-6 py-3">
          <div className="flex items-center justify-between gap-8">
            {/* Left Section */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-glow rounded-xl flex items-center justify-center shadow-glow">
                <Trophy className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent whitespace-nowrap">
                LearnWorlds Leaderboard
              </h1>
            </div>

            {/* Desktop Navigation - Hidden on Mobile */}
            <div className="hidden lg:flex items-center gap-2">
              <Navigation />
              
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
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing 
                  ? 'Frissítés...' 
                  : selectedUserId 
                    ? 'Kiválasztott felhasználó frissítése' 
                    : 'Összes felhasználó frissítése'
                }
              </Button>
              
              {syncProgress && (
                <div className="flex items-center gap-2 min-w-[200px]">
                  <Progress 
                    value={(syncProgress.processed / syncProgress.total) * 100} 
                    className="h-2 flex-1"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {syncProgress.processed} / {syncProgress.total}
                  </span>
                </div>
              )}
              
              {!syncProgress && apiCallsUsed && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Utolsó: {apiCallsUsed} API hívás
                </span>
              )}
          
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm">
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

            {/* Mobile Menu Button */}
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
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Felhasználó kiválasztása</label>
                    <Select value={selectedUserId || "all"} onValueChange={(value) => setSelectedUserId(value === "all" ? null : value)}>
                      <SelectTrigger className="w-full">
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
                  </div>
                  
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      handleRefresh();
                      setMobileMenuOpen(false);
                    }}
                    disabled={refreshing}
                    className="w-full"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Frissítés...' : 'Frissítés'}
                  </Button>
                  
                  {syncProgress && (
                    <div className="space-y-1">
                      <Progress 
                        value={(syncProgress.processed / syncProgress.total) * 100} 
                        className="h-2"
                      />
                      <span className="text-xs text-muted-foreground text-center block">
                        Feldolgozás: {syncProgress.processed} / {syncProgress.total} felhasználó
                      </span>
                    </div>
                  )}
                  
                  {!syncProgress && apiCallsUsed && (
                    <span className="text-xs text-muted-foreground text-center">
                      Utolsó: {apiCallsUsed} API hívás
                    </span>
                  )}
              
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="default" className="w-full">
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
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      </header>

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
                {availableTags.length > 0 && (
                  <div className="flex justify-center">
                    <Select value={selectedTag || "all"} onValueChange={(value) => setSelectedTag(value === "all" ? null : value)}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Szűrés címke szerint" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Összes címke</SelectItem>
                        <SelectSeparator />
                        {availableTags.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Leaderboard entries={filteredLeaderboard} />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
