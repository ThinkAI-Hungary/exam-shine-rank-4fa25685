import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Leaderboard from "@/components/Leaderboard";
import StoreLeaderboard from "@/components/StoreLeaderboard";

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
  start_of_empl?: string;
}

const EXCLUDED_USERNAMES = ['LW DEV', 'LWSupport Test'];

const Embed = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 60000);
    return () => clearInterval(interval);
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

      const formattedData: LeaderboardEntry[] = (data || [])
        .filter((item: any) => !EXCLUDED_USERNAMES.includes(item.users.username))
        .map((item: any) => ({
          rank: item.rank,
          username: item.users.username,
          user_id: item.user_id,
          email: item.users.email ?? null,
          total_score: item.total_score,
          exam_count: item.exam_count,
          average_score: item.average_score,
          aruhaz: item.users.aruhaz || [],
          beosztas: item.users.beosztas || [],
          start_of_empl: item.users.start_of_empl,
        }))
        .sort((a, b) => b.average_score - a.average_score)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      setLeaderboard(formattedData);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const topIndividuals = leaderboard.slice(0, 3);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">Ranglista betöltése...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="mb-3 text-center">
                <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Egyéni Top 3
                </h2>
                <p className="text-xs text-muted-foreground">
                  Átlag vizsgaeredmény alapján
                </p>
              </div>
              <Leaderboard entries={topIndividuals} isEmbedded={true} />
            </div>

            <div>
              <div className="mb-3 text-center">
                <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Áruház Top 3
                </h2>
                <p className="text-xs text-muted-foreground">
                  Áruházak átlag vizsgaeredménye alapján
                </p>
              </div>
              <StoreLeaderboard entries={leaderboard} limit={3} />
            </div>
          </div>
        )}

        <div className="mt-3 text-center text-xs text-muted-foreground">
          Powered by LearnWorlds
        </div>
      </div>
    </div>
  );
};

export default Embed;
