import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className={isEmbedded ? "" : "space-y-4"}>
      {!isEmbedded && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            Leaderboard
          </CardTitle>
          <CardDescription>Top performers across all exams</CardDescription>
        </CardHeader>
      )}
      <CardContent className={isEmbedded ? "p-0" : ""}>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-16 text-center">Rank</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Total Score</TableHead>
                <TableHead className="text-right">Exams</TableHead>
                <TableHead className="text-right">Average</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No scores yet. Be the first to submit!
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
                        {entry.total_score}
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
      </CardContent>
    </div>
  );

  return isEmbedded ? content : <Card>{content}</Card>;
};

export default Leaderboard;
