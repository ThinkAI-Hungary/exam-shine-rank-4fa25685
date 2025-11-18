import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Trophy, Code, RefreshCw, Upload } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";
import { toast } from "sonner";
import Papa from "papaparse";

interface LeaderboardEntry {
  rank: number;
  username: string;
  user_id: string;
  email: string | null;
  total_score: number;
  exam_count: number;
  average_score: number;
  tags: string[];
}

const Index = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [filteredLeaderboard, setFilteredLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [apiCallsUsed, setApiCallsUsed] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          users!inner(username, email, tags)
        `)
        .order("rank", { ascending: true });

      if (error) throw error;

      const formattedData: LeaderboardEntry[] = (data || []).map((item: any) => ({
        rank: item.rank,
        username: item.users.username,
        user_id: item.user_id,
        email: item.users.email,
        total_score: item.total_score,
        exam_count: item.exam_count,
        average_score: item.average_score,
        tags: item.users.tags || [],
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
        ? { options: { userIds: [selectedUserId], limitUsers: 0, limitCourses: 0, courseTitleContains: 'Vizsgafelület' } }
        : { options: { limitUsers: 0, limitCourses: 0, courseTitleContains: 'Vizsgafelület' } };
      
      const { data, error } = await supabase.functions.invoke('fetch-leaderboard', { body });
      
      if (error) throw error;
      
      // Log success
      logData.api_calls = data?.apiCalls || 0;
      await supabase.from('refresh_logs').insert(logData);
      
      const message = selectedUserId 
        ? `Selected user refreshed! (${data?.apiCalls || '?'} API calls)`
        : `Full leaderboard refreshed! (${data?.apiCalls || '?'} API calls)`;
      
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

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            // Convert string numbers to actual numbers
            const parsedData = results.data.map((row: any) => ({
              username: row.username || row.Username,
              total_score: parseFloat(row.total_score || row['Total Score'] || 0),
              exam_count: parseInt(row.exam_count || row['Exam Count'] || 0),
              average_score: parseFloat(row.average_score || row['Average Score'] || 0),
              email: row.email || row.Email || null,
            }));

            const { data, error } = await supabase.functions.invoke('upload-leaderboard', {
              body: { data: parsedData }
            });

            if (error) throw error;

            toast.success(`Leaderboard updated with ${parsedData.length} entries!`);
            await fetchLeaderboard();
          } catch (error: any) {
            toast.error(`Failed to upload CSV: ${error.message}`);
            console.error(error);
          } finally {
            setUploading(false);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }
        },
        error: (error) => {
          toast.error(`Failed to parse CSV: ${error.message}`);
          setUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      });
    } catch (error: any) {
      toast.error("Failed to read CSV file");
      console.error(error);
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-glow rounded-xl flex items-center justify-center shadow-glow">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                LearnWorlds Leaderboard
              </h1>
              <p className="text-xs text-muted-foreground">All-time top performers</p>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className={`w-4 h-4 mr-2 ${uploading ? 'animate-pulse' : ''}`} />
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </Button>
            <Select value={selectedUserId || "all"} onValueChange={(value) => setSelectedUserId(value === "all" ? null : value)}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select user (or all)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌐 All Users (Full Refresh)</SelectItem>
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
                ? 'Refreshing...' 
                : selectedUserId 
                  ? 'Refresh Selected User' 
                  : 'Refresh All Users'
              }
            </Button>
            {apiCallsUsed && (
              <span className="text-xs text-muted-foreground">
                Last: {apiCallsUsed} API calls
              </span>
            )}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="default" size="sm">
                  <Code className="w-4 h-4 mr-2" />
                  Embed Code
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Embed Leaderboard</DialogTitle>
                  <DialogDescription>
                    Copy this code to embed the leaderboard on your website
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
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">Loading leaderboard...</div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <Card className="shadow-card">
              <CardHeader className="text-center space-y-4">
                <div>
                  <CardTitle className="text-3xl font-bold">Top Performers</CardTitle>
                  <CardDescription>
                    Ranked by total points earned across all courses
                  </CardDescription>
                </div>
                {availableTags.length > 0 && (
                  <div className="flex justify-center">
                    <Select value={selectedTag || "all"} onValueChange={(value) => setSelectedTag(value === "all" ? null : value)}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Filter by tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tags</SelectItem>
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
                <Leaderboard entries={filteredLeaderboard} isEmbedded />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
