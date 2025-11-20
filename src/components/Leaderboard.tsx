import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BadgeDisplay from "./BadgeDisplay";

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
  user_id?: string;
  total_score: number;
  exam_count: number;
  average_score: number;
  score_source?: 'exact' | 'estimated';
  tags?: string[];
  badges?: BadgeData[];
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isEmbedded?: boolean;
}

const Leaderboard = ({ entries, isEmbedded = false }: LeaderboardProps) => {
  const navigate = useNavigate();
  
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

  const content = (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center">Rank</TableHead>
            <TableHead>Learner</TableHead>
            <TableHead>Badge</TableHead>
            <TableHead className="text-right">Total Points</TableHead>
            <TableHead className="text-right">Courses</TableHead>
            <TableHead className="text-right">Avg Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                <Trophy className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p>No scores yet. Be the first to submit!</p>
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow 
                key={entry.rank}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => entry.user_id && !isEmbedded && navigate(`/profile/${entry.user_id}`)}
              >
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    {getRankIcon(entry.rank)}
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{entry.username}</span>
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {entry.tags.map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {entry.badges && entry.badges.length > 0 ? (
                    <BadgeDisplay badges={entry.badges} compact />
                  ) : (
                    <span className="text-xs text-muted-foreground">No badge</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={entry.score_source === 'estimated' ? 'outline' : 'secondary'} className="font-mono">
                    {entry.total_score.toLocaleString()}
                    {entry.score_source === 'estimated' && (
                      <span className="ml-1 text-xs opacity-70">(est)</span>
                    )}
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
  );

  return isEmbedded ? content : <Card><CardContent className="p-0">{content}</CardContent></Card>;
};

export default Leaderboard;
