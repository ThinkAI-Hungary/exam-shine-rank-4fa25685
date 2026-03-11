import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface ExamEntry {
  username: string;
  score: number;
  completed_at: string;
  exam_title: string;
}

interface CourseGroup {
  course_title: string;
  users: ExamEntry[];
}

const EXCLUDED = ['LW DEV', 'LWSupport Test'];

const getPeriodDates = (period: string): { start: Date; end: Date } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "this_month":
      return { start: new Date(year, month, 1), end: now };
    case "last_month":
      return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
    case "this_quarter":
      return { start: new Date(year, Math.floor(month / 3) * 3, 1), end: now };
    case "this_year":
      return { start: new Date(year, 0, 1), end: now };
    case "all":
    default:
      return { start: new Date(2000, 0, 1), end: now };
  }
};

const CourseExamsLeaderboard = () => {
  const [data, setData] = useState<CourseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period);

      const [usersRes, examsRes] = await Promise.all([
        supabase.from("users").select("user_id, username"),
        supabase.from("exam_results")
          .select("user_id, course_title, exam_title, score, completed_at")
          .gte("completed_at", start.toISOString())
          .lte("completed_at", end.toISOString())
          .order("course_title", { ascending: true }),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (examsRes.error) throw examsRes.error;

      const userMap = new Map<string, string>();
      for (const u of usersRes.data || []) {
        userMap.set(u.user_id, u.username);
      }

      const grouped = new Map<string, CourseGroup>();

      for (const exam of (examsRes.data || [])) {
        const username = userMap.get(exam.user_id) || exam.user_id;
        if (EXCLUDED.includes(username)) continue;

        if (!grouped.has(exam.course_title)) {
          grouped.set(exam.course_title, { course_title: exam.course_title, users: [] });
        }
        grouped.get(exam.course_title)!.users.push({
          username,
          score: exam.score,
          completed_at: exam.completed_at,
          exam_title: exam.exam_title,
        });
      }

      setData(Array.from(grouped.values()).sort((a, b) => a.course_title.localeCompare(b.course_title, 'hu')));
    } catch (err) {
      console.error("Failed to fetch course exams:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCourse = (courseTitle: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseTitle)) next.delete(courseTitle);
      else next.add(courseTitle);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Időszak kiválasztása" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Összes időszak</SelectItem>
            <SelectItem value="this_month">Aktuális hónap</SelectItem>
            <SelectItem value="last_month">Előző hónap</SelectItem>
            <SelectItem value="this_quarter">Aktuális negyedév</SelectItem>
            <SelectItem value="this_year">Aktuális év</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Betöltés...</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10"></TableHead>
                <TableHead>Kurzus</TableHead>
                <TableHead className="text-right">Vizsgázók száma</TableHead>
                <TableHead className="text-right">Átlag vizsgaeredmény</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p>Nincs vizsgaadat a kiválasztott időszakban.</p>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((course) => {
                  const isExpanded = expandedCourses.has(course.course_title);
                  const avgScore = course.users.reduce((s, u) => s + u.score, 0) / course.users.length;
                  return (
                    <>
                      <TableRow
                        key={course.course_title}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => toggleCourse(course.course_title)}
                      >
                        <TableCell className="text-center">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-muted-foreground" />
                            {course.course_title}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{course.users.length}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={avgScore >= 80 ? "default" : "outline"}>
                            {avgScore.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isExpanded && course.users.map((user, idx) => (
                        <TableRow key={`${course.course_title}-${idx}`} className="bg-muted/20">
                          <TableCell></TableCell>
                          <TableCell className="text-sm pl-8">
                            <span className="font-medium">{user.username}</span>
                            <span className="text-muted-foreground ml-2 text-xs">({user.exam_title})</span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {new Date(user.completed_at).toLocaleDateString('hu-HU')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={user.score >= 80 ? "default" : "outline"} className="text-xs">
                              {user.score}%
                            </Badge>
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
      )}
    </div>
  );
};

export default CourseExamsLeaderboard;
