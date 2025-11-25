import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, Medal, Award, MapPin, Calendar, Star } from "lucide-react";
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
  start_of_empl?: string;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isEmbedded?: boolean;
}

const Leaderboard = ({ entries, isEmbedded = false }: LeaderboardProps) => {
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
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

  const handleRowClick = (entry: LeaderboardEntry) => {
    if (isEmbedded) return;
    setSelectedUser(entry);
    setDialogOpen(true);
  };

  const getStoreTags = (tags?: string[]) => {
    if (!tags) return [];
    return tags
      .filter(tag => tag.startsWith('cf_aruhaz_'))
      .map(tag => tag.replace('cf_aruhaz_', ''));
  };

  const content = (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center">Helyezés</TableHead>
            <TableHead>Tanuló</TableHead>
            <TableHead className="text-right">Összes pont</TableHead>
            <TableHead className="text-right">Kurzusok</TableHead>
            <TableHead className="text-right">Átlag pontszám</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                <Trophy className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p>Még nincsenek pontszámok. Légy te az első!</p>
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow 
                key={entry.rank}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => handleRowClick(entry)}
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

  return (
    <>
      {isEmbedded ? content : <Card><CardContent className="p-0">{content}</CardContent></Card>}
      
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              {selectedUser?.username}
            </DialogTitle>
            <DialogDescription>Felhasználó részletek</DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Helyezés</span>
                <div className="flex items-center gap-2">
                  {getRankIcon(selectedUser.rank)}
                  <span className="font-semibold">#{selectedUser.rank}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Összpontszám</span>
                <Badge variant="secondary" className="font-mono">
                  {selectedUser.total_score.toLocaleString()}
                </Badge>
              </div>

              {getStoreTags(selectedUser.tags).length > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Áruházak</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {getStoreTags(selectedUser.tags).map((store, idx) => (
                      <Badge key={idx} variant="outline">
                        {store}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedUser.start_of_empl && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Munkaviszony kezdete</span>
                  </div>
                  <span className="font-medium">
                    {new Date(selectedUser.start_of_empl).toLocaleDateString('hu-HU')}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Átlag pontszám</span>
                </div>
                <Badge variant={selectedUser.average_score >= 80 ? "default" : "outline"}>
                  {selectedUser.average_score.toFixed(1)}%
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Leaderboard;
