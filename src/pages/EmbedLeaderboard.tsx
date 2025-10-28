import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Leaderboard from "@/components/Leaderboard";

interface LeaderboardEntry {
  rank: number;
  username: string;
  total_score: number;
  exam_count: number;
  average_score: number;
}

const EmbedLeaderboard = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetchLeaderboard();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderboard = async () => {
    const { data, error } = await supabase
      .from("scores")
      .select(`
        user_id,
        score,
        profiles (username),
        exams (max_score)
      `);

    if (error) return;

    const userStats = data?.reduce((acc: any, item: any) => {
      const userId = item.user_id;
      if (!acc[userId]) {
        acc[userId] = {
          username: item.profiles.username,
          total_score: 0,
          total_max_score: 0,
          exam_count: 0,
        };
      }
      acc[userId].total_score += item.score;
      acc[userId].total_max_score += item.exams.max_score;
      acc[userId].exam_count += 1;
      return acc;
    }, {});

    const leaderboardData: LeaderboardEntry[] = Object.values(userStats || {})
      .map((stats: any) => ({
        username: stats.username,
        total_score: stats.total_score,
        exam_count: stats.exam_count,
        average_score: (stats.total_score / stats.total_max_score) * 100,
        rank: 0,
      }))
      .sort((a, b) => b.total_score - a.total_score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    setLeaderboard(leaderboardData);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Leaderboard entries={leaderboard} isEmbedded />
      </div>
    </div>
  );
};

export default EmbedLeaderboard;
