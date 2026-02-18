import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  username: string;
  email: string | null;
  total_score: number;
  exam_count: number;
  average_score: number;
  aruhaz: string[];
}

const Embed = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetchLeaderboard();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchLeaderboard, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("leaderboard_cache")
        .select(`
          *,
          users!inner(username, email, aruhaz)
        `)
        .order("rank", { ascending: true })
        .limit(50);

      if (error) throw error;
      
      const formattedData: LeaderboardEntry[] = (data || []).map((item: any) => ({
        rank: item.rank,
        username: item.users.username,
        email: item.users.email,
        total_score: item.total_score,
        exam_count: item.exam_count,
        average_score: item.average_score,
        aruhaz: item.users.aruhaz || [],
      }));
      
      setLeaderboard(formattedData);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground font-semibold">{rank}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Ranglista
          </h2>
          <p className="text-sm text-muted-foreground">Minden idők ranglistája</p>
        </div>
        
        <div className="rounded-lg border overflow-hidden bg-card shadow-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-16 text-center">Helyezés</TableHead>
                <TableHead>Tanuló</TableHead>
                <TableHead className="text-right">Összes pont</TableHead>
                <TableHead className="text-right">Vizsgák</TableHead>
                <TableHead className="text-right">Átlag pontszám</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    <Trophy className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p>Nincs elérhető adat</p>
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
                      <div className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{entry.username}</span>
                          {entry.aruhaz && entry.aruhaz.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {entry.aruhaz.map((tag, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant="secondary"
                        className="font-mono"
                      >
                        {entry.total_score.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {entry.exam_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={entry.average_score >= 80 ? "default" : "outline"}>
                        {entry.average_score.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="mt-3 text-center text-xs text-muted-foreground">
          Powered by LearnWorlds
        </div>
      </div>
    </div>
  );
};

export default Embed;
