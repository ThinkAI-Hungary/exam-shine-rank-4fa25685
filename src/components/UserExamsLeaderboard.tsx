import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UserExamGroup {
  user_id: string;
  username: string;
  courses: { course_title: string; exam_title: string; score: number; completed_at: string }[];
}

const EXCLUDED = ['LW DEV', 'LWSupport Test'];

const UserExamsLeaderboard = () => {
  const [data, setData] = useState<UserExamGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch users and exam results in parallel
      const [usersRes, examsRes] = await Promise.all([
        supabase.from("users").select("user_id, username"),
        supabase.from("exam_results")
          .select("user_id, course_title, exam_title, score, completed_at")
          .order("completed_at", { ascending: false }),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (examsRes.error) throw examsRes.error;

      const userMap = new Map<string, string>();
      for (const u of usersRes.data || []) {
        userMap.set(u.user_id, u.username);
      }

      const grouped = new Map<string, UserExamGroup>();

      for (const exam of (examsRes.data || [])) {
        const username = userMap.get(exam.user_id) || exam.user_id;
        if (EXCLUDED.includes(username)) continue;

        if (!grouped.has(exam.user_id)) {
          grouped.set(exam.user_id, {
            user_id: exam.user_id,
            username,
            courses: [],
          });
        }
        grouped.get(exam.user_id)!.courses.push({
          course_title: exam.course_title,
          exam_title: exam.exam_title,
          score: exam.score,
          completed_at: exam.completed_at,
        });
      }

      setData(Array.from(grouped.values()).sort((a, b) => a.username.localeCompare(b.username, 'hu')));
    } catch (err) {
      console.error("Failed to fetch user exams:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const getUniqueCourses = (courses: UserExamGroup["courses"]) => {
    return Array.from(new Set(courses.map(c => c.course_title)));
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Betöltés...</div>;
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-10"></TableHead>
            <TableHead>Kolléga neve</TableHead>
            <TableHead className="text-right">Vizsgák száma</TableHead>
            <TableHead>Vizsgázott témák</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                <BookOpen className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                <p>Nincs vizsgaadat.</p>
              </TableCell>
            </TableRow>
          ) : (
            data.map((user) => {
              const isExpanded = expandedUsers.has(user.user_id);
              const uniqueCourses = getUniqueCourses(user.courses);
              return (
                <>
                  <TableRow
                    key={user.user_id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => toggleUser(user.user_id)}
                  >
                    <TableCell className="text-center">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell className="text-right">{user.courses.length}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {uniqueCourses.map((course, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {course}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && user.courses.map((exam, idx) => (
                    <TableRow key={`${user.user_id}-${idx}`} className="bg-muted/20">
                      <TableCell></TableCell>
                      <TableCell className="text-sm text-muted-foreground pl-8">
                        {exam.exam_title}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={exam.score >= 80 ? "default" : "outline"} className="text-xs">
                          {exam.score}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(exam.completed_at).toLocaleDateString('hu-HU')}
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserExamsLeaderboard;
