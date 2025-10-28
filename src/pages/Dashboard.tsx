import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogOut, Trophy, Code } from "lucide-react";
import ScoreSubmission from "@/components/ScoreSubmission";
import UserScores from "@/components/UserScores";
import Leaderboard from "@/components/Leaderboard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface Exam {
  id: string;
  name: string;
  description: string | null;
  max_score: number;
}

interface UserScore {
  exam_name: string;
  score: number;
  max_score: number;
  submitted_at: string;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  total_score: number;
  exam_count: number;
  average_score: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [userScores, setUserScores] = useState<UserScore[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const embedCode = `<iframe 
  src="${window.location.origin}/embed/leaderboard" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #e5e7eb; border-radius: 0.5rem;"
></iframe>`;

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth");
      } else if (session) {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchExams(),
        fetchUserScores(),
        fetchLeaderboard(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load exams");
      return;
    }

    setExams(data || []);
  };

  const fetchUserScores = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("scores")
      .select(`
        score,
        submitted_at,
        exams (name, max_score)
      `)
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false });

    if (error) {
      toast.error("Failed to load your scores");
      return;
    }

    const formattedScores = data?.map((item: any) => ({
      exam_name: item.exams.name,
      score: item.score,
      max_score: item.exams.max_score,
      submitted_at: item.submitted_at,
    })) || [];

    setUserScores(formattedScores);
  };

  const fetchLeaderboard = async () => {
    const { data, error } = await supabase
      .from("scores")
      .select(`
        user_id,
        score,
        profiles (username),
        exams (max_score)
      `);

    if (error) {
      toast.error("Failed to load leaderboard");
      return;
    }

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-glow rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                ExamRank
              </h1>
              <p className="text-xs text-muted-foreground">Welcome, {user?.email?.split('@')[0]}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
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
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-6">
            <ScoreSubmission 
              exams={exams}
              userId={user?.id}
              onScoreSubmitted={fetchData}
            />
            <UserScores scores={userScores} />
          </div>
          
          <div className="md:col-span-1 lg:col-span-2">
            <Leaderboard entries={leaderboard} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
