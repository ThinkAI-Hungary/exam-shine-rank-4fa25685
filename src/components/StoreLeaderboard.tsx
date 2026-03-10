import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Store, Users } from "lucide-react";

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
  badges?: any[];
  start_of_empl?: string;
}

interface StoreStats {
  storeName: string;
  displayName: string;
  userCount: number;
  totalExams: number;
  averageScore: number;
  totalScore: number;
  topPerformer: string;
  topScore: number;
  rank: number;
}

interface StoreLeaderboardProps {
  entries: LeaderboardEntry[];
}

const StoreLeaderboard = ({ entries }: StoreLeaderboardProps) => {
  const storeStats = useMemo(() => {
    const storeMap = new Map<string, {
      users: Set<string>;
      totalScore: number;
      examCount: number;
      scoreSum: number;
      topPerformer: string;
      topScore: number;
    }>();

    for (const entry of entries) {
      const stores = (entry.aruhaz || []).filter(t => t.startsWith('cf_aruhaz_'));
      
      // If user has no store tag, skip for store-level view
      if (stores.length === 0) continue;

      for (const store of stores) {
        if (!storeMap.has(store)) {
          storeMap.set(store, {
            users: new Set(),
            totalScore: 0,
            examCount: 0,
            scoreSum: 0,
            topPerformer: '',
            topScore: 0,
          });
        }
        const s = storeMap.get(store)!;
        s.users.add(entry.user_id);
        s.totalScore += entry.total_score;
        s.examCount += entry.exam_count;
        s.scoreSum += entry.average_score;
        if (entry.average_score > s.topScore) {
          s.topScore = entry.average_score;
          s.topPerformer = entry.username;
        }
      }
    }

    const stats: StoreStats[] = Array.from(storeMap.entries())
      .map(([storeName, data]) => ({
        storeName,
        displayName: storeName.replace(/^cf_aruhaz_/, ''),
        userCount: data.users.size,
        totalExams: data.examCount,
        averageScore: data.users.size > 0
          ? Math.round((data.scoreSum / data.users.size) * 10) / 10
          : 0,
        totalScore: data.totalScore,
        topPerformer: data.topPerformer,
        topScore: data.topScore,
        rank: 0,
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    return stats;
  }, [entries]);

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
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center">Helyezés</TableHead>
            <TableHead>Áruház</TableHead>
            <TableHead className="text-right">Kollégák</TableHead>
            <TableHead className="text-right">Vizsgák</TableHead>
            <TableHead className="text-right">Átlag pontszám</TableHead>
            <TableHead className="hidden md:table-cell">Legjobb kolléga</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {storeStats.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                <Store className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p>Nincs áruház szintű adat.</p>
              </TableCell>
            </TableRow>
          ) : (
            storeStats.map((store) => (
              <TableRow key={store.storeName} className="hover:bg-muted/30 transition-colors">
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    {getRankIcon(store.rank)}
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-muted-foreground" />
                    <span>{store.displayName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{store.userCount}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {store.totalExams}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={store.averageScore >= 80 ? "default" : "outline"}>
                    {store.averageScore.toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                  {store.topPerformer && (
                    <span>
                      {store.topPerformer} ({store.topScore.toFixed(1)}%)
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default StoreLeaderboard;
