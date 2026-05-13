import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  TrendingUp,
  CheckCircle2,
  Award,
  ChevronRight,
  Loader2,
  Calendar,
  Mail,
  GraduationCap,
} from "lucide-react";

interface StudentQuickViewProps {
  userId: string | null;
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Enrollment {
  lw_course_id: string;
  courseTitle: string;
  completion_percentage: number;
  enrolled_at: string | null;
}

interface QuickStats {
  totalExams: number;
  avgScore: number;
  passedExams: number;
  passRate: number;
  badgeCount: number;
  email: string | null;
  aruhaz: string[];
  beosztas: string[];
  startOfEmpl: string | null;
  category: string | null;
  enrollments: Enrollment[];
}

const StudentQuickView = ({ userId, username, open, onOpenChange }: StudentQuickViewProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<QuickStats | null>(null);

  useEffect(() => {
    if (open && userId) {
      fetchQuickStats(userId);
    }
  }, [open, userId]);

  const fetchQuickStats = async (uid: string) => {
    setLoading(true);
    try {
      const [userRes, examRes, badgeRes, enrollRes] = await Promise.all([
        supabase.from("users").select("email, aruhaz, beosztas, start_of_empl, current_category").eq("user_id", uid).single(),
        supabase.from("exam_results").select("score").eq("user_id", uid),
        supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("user_id", uid).is("revoked_at", null),
        supabase.from("lw_enrollments").select("lw_course_id, completion_percentage, enrolled_at").eq("user_id", uid),
      ]);

      // Map enrollment course IDs to titles
      const enrollments: Enrollment[] = [];
      const rawEnrollments = enrollRes.data || [];
      if (rawEnrollments.length > 0) {
        const courseIds = rawEnrollments.map((e: any) => e.lw_course_id);
        const { data: courses } = await supabase.from("lw_courses").select("lw_course_id, title").in("lw_course_id", courseIds);
        const courseMap = new Map((courses || []).map((c: any) => [c.lw_course_id, c.title]));
        for (const e of rawEnrollments) {
          enrollments.push({
            lw_course_id: e.lw_course_id,
            courseTitle: courseMap.get(e.lw_course_id) || e.lw_course_id,
            completion_percentage: e.completion_percentage || 0,
            enrolled_at: e.enrolled_at,
          });
        }
        enrollments.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));
      }

      const exams = examRes.data || [];
      const totalExams = exams.length;
      const avgScore = totalExams > 0 ? exams.reduce((s, e) => s + e.score, 0) / totalExams : 0;
      const passedExams = exams.filter((e) => e.score >= 60).length;

      setStats({
        totalExams,
        avgScore,
        passedExams,
        passRate: totalExams > 0 ? (passedExams / totalExams) * 100 : 0,
        badgeCount: badgeRes.count || 0,
        email: userRes.data?.email || null,
        aruhaz: (userRes.data?.aruhaz || []).map((s: string) => s.replace(/^cf_aruhaz_/, "")).filter((s: string) => s.trim() !== ""),
        beosztas: (userRes.data?.beosztas || []).map((s: string) => s.replace(/^cf_munkakorod_?/, "")).filter((s: string) => s.trim() !== ""),
        startOfEmpl: userRes.data?.start_of_empl || null,
        category: userRes.data?.current_category || null,
        enrollments,
      });
    } catch (e) {
      console.error("Error fetching quick stats:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToFull = () => {
    onOpenChange(false);
    navigate(`/performance/${userId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-primary">
                {username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg">{username}</DialogTitle>
              {stats && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {stats.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {stats.email}
                    </span>
                  )}
                  {stats.startOfEmpl && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(stats.startOfEmpl).toLocaleDateString("hu-HU")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <div className="space-y-4 pt-2">
            {/* Tags */}
            {(stats.aruhaz.length > 0 || stats.beosztas.length > 0 || stats.category) && (
              <div className="flex flex-wrap gap-1.5">
                {stats.aruhaz.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
                {stats.beosztas.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
                {stats.category && (
                  <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{stats.category}</Badge>
                )}
              </div>
            )}

            {/* KPI Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold leading-none">{stats.totalExams}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Összes vizsga</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold leading-none">{stats.avgScore.toFixed(1)}%</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Átlag pontszám</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xl font-bold leading-none">{stats.passedExams}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Sikeres vizsga</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border">
                <div className="w-9 h-9 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                  <Award className="w-4 h-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xl font-bold leading-none">{stats.badgeCount}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Jelvények</p>
                </div>
              </div>
            </div>

            {/* Pass rate */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sikerességi arány</span>
                <span className="font-semibold text-primary">{stats.passRate.toFixed(0)}%</span>
              </div>
              <Progress value={stats.passRate} className="h-2" />
            </div>

            {/* Enrollments */}
            {stats.enrollments.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <GraduationCap className="w-3.5 h-3.5" />
                  Beiratkozások ({stats.enrollments.length})
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {stats.enrollments.map((e) => (
                    <div key={e.lw_course_id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30 border text-xs">
                      <span className="truncate font-medium" title={e.courseTitle}>{e.courseTitle}</span>
                      <span className="flex-shrink-0 text-muted-foreground">{e.completion_percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigate to full dashboard */}
            <Button
              onClick={handleNavigateToFull}
              className="w-full gap-2"
              variant="default"
            >
              Részletes teljesítmény
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">Nem sikerült betölteni az adatokat</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StudentQuickView;
