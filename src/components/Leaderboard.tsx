import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  username: string;
  total_score: number;
  exam_count: number;
  average_score: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isEmbedded?: boolean;
}

const Leaderboard = ({ entries, isEmbedded = false }: LeaderboardProps) => {
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
            <TableHead className="text-right">Total Points</TableHead>
            <TableHead className="text-right">Courses</TableHead>
            <TableHead className="text-right">Avg Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                <Trophy className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p>No scores yet. Be the first to submit!</p>
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow 
                key={entry.rank}
                className="hover:bg-muted/30 transition-colors"
              >
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    {getRankIcon(entry.rank)}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{entry.username}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="font-mono">
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
  );

  return isEmbedded ? content : <Card><CardContent className="p-0">{content}</CardContent></Card>;
};

export default Leaderboard;
