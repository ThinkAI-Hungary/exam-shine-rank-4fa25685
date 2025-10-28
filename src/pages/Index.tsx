import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, RefreshCw, Code } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface LeaderboardEntry {
  rank: number;
  username: string;
  email: string | null;
  total_points: number;
  course_completions: number;
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
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchLeaderboard, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("leaderboard_cache")
        .select("*")
        .order("rank", { ascending: true });

      if (error) throw error;

      setLeaderboard(data || []);
    } catch (error: any) {
      console.error("Error fetching leaderboard:", error);
      toast.error("Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Call edge function to fetch fresh data from LearnWorlds
      const { data, error } = await supabase.functions.invoke('fetch-leaderboard');
      
      if (error) throw error;
      
      toast.success("Leaderboard refreshed successfully!");
      await fetchLeaderboard();
    } catch (error: any) {
      console.error("Error refreshing:", error);
      toast.error("Failed to refresh leaderboard");
    } finally {
      setRefreshing(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />;
      default:
        return <span className="text-muted-foreground font-semibold text-lg">{rank}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <div className="animate-pulse text-muted-foreground">Loading leaderboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary-glow rounded-xl flex items-center justify-center shadow-glow">
              <Trophy className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                LearnWorlds Leaderboard
              </h1>
              <p className="text-sm text-muted-foreground">All-time top performers</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Code className="w-4 h-4 mr-2" />
                  Embed
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
            <Button 
              onClick={handleRefresh} 
              disabled={refreshing}
              size="sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="shadow-xl">
          <CardHeader className="border-b">
            <CardTitle className="text-2xl">Top Learners</CardTitle>
            <CardDescription>
              Ranked by total points from course completions and progress
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-20 text-center">Rank</TableHead>
                    <TableHead>Learner</TableHead>
                    <TableHead className="text-right">Total Points</TableHead>
                    <TableHead className="text-right">Completed Courses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                        <div className="flex flex-col items-center gap-2">
                          <Trophy className="w-12 h-12 text-muted-foreground/30" />
                          <p>No data yet. Click Refresh to fetch from LearnWorlds.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    leaderboard.map((entry) => (
                      <TableRow 
                        key={entry.rank}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            {getRankIcon(entry.rank)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{entry.username}</div>
                            {entry.email && (
                              <div className="text-sm text-muted-foreground">{entry.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={entry.rank <= 3 ? "default" : "secondary"}
                            className="font-mono text-base px-3 py-1"
                          >
                            {entry.total_points.toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="font-mono">
                            {entry.course_completions}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleString()}
        </div>
      </main>
    </div>
  );
};

export default Index;
