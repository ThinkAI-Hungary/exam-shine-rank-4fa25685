import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Trophy, Code, RefreshCw } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";
import { toast } from "sonner";

interface LeaderboardEntry {
  rank: number;
  username: string;
  total_score: number;
  exam_count: number;
  average_score: number;
}

const Index = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        .select("*")
        .order("rank", { ascending: true });

      if (error) throw error;

      const formattedData: LeaderboardEntry[] = (data || []).map((item: any) => ({
        rank: item.rank,
        username: item.username,
        total_score: item.total_score,
        exam_count: item.exam_count,
        average_score: item.average_score,
      }));

      setLeaderboard(formattedData);
    } catch (error: any) {
      toast.error("Failed to load leaderboard");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-leaderboard');
      
      if (error) throw error;
      
      toast.success("Leaderboard refreshed from LearnWorlds!");
      await fetchLeaderboard();
    } catch (error: any) {
      toast.error("Failed to refresh leaderboard");
      console.error(error);
    } finally {
      setRefreshing(false);
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
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
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
              <CardHeader className="text-center">
                <CardTitle className="text-3xl font-bold">Top Performers</CardTitle>
                <CardDescription>
                  Ranked by total points earned across all courses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Leaderboard entries={leaderboard} isEmbedded />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
