import { useState, useEffect } from "react";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  BarChart3,
  TrendingUp,
  Award,
  BookOpen,
  Clock,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  GraduationCap,
} from "lucide-react";
import { WarningIndicator } from "@/components/WarningIndicator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface ExamResult {
  id: string;
  course_id: string;
  course_title: string;
  exam_id: string;
  exam_title: string;
  score: number;
  completed_at: string;
}

interface UserData {
  user_id: string;
  username: string;
  email: string | null;
  aruhaz: string[] | null;
  beosztas: string[] | null;
  start_of_empl: string | null;
  current_category: string | null;
  nps_score: number | null;
  nps_comment: string | null;
}

interface BadgeData {
  id: string;
  badge_definitions: {
    badge_name: string;
    badge_type: string;
    badge_level: string | null;
    description: string;
    icon_name: string;
    color: string;
  };
  awarded_at: string;
}

interface EnrollmentProgress {
  lw_course_id: string;
  courseTitle: string;
  completion_percentage: number;
  enrolled_at: string | null;
  completed_at: string | null;
}

const CHART_COLORS = [
  "hsl(356, 93%, 45%)",
  "hsl(200, 98%, 48%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(280, 70%, 60%)",
];

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--card-foreground))",
};
const tooltipLabelStyle = { color: "hsl(var(--card-foreground))" };
const tooltipItemStyle = { color: "hsl(var(--card-foreground))" };

const StudentDashboard = () => {
  const { userId } = useParams<{ userId: string }>();
  const { isAdmin } = useOutletContext<{ user: any; isAdmin: boolean }>();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<(BadgeData & { svgPath: string | null }) | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (userId) {
      fetchDashboardData(userId);
    }
  }, [userId]);

  const fetchDashboardData = async (uid: string) => {
    try {
      // Fetch user data
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("user_id", uid)
        .single();

      if (userError) throw userError;
      setUserData(user);

      // Fetch exam results
      const { data: exams, error: examError } = await supabase
        .from("exam_results")
        .select("*")
        .eq("user_id", uid)
        .order("completed_at", { ascending: false });

      if (examError) throw examError;
      setExamResults(exams || []);

      // Fetch badges
      const { data: badgeData } = await supabase
        .from("user_badges")
        .select("*, badge_definitions(*)")
        .eq("user_id", uid)
        .is("revoked_at", null);

      setBadges(badgeData || []);

      // Fetch course enrollment progress
      const { data: enrollData } = await supabase
        .from("lw_enrollments")
        .select("lw_course_id, completion_percentage, enrolled_at, completed_at")
        .eq("user_id", uid);

      if (enrollData && enrollData.length > 0) {
        const courseIds = enrollData.map((e: any) => e.lw_course_id);
        const { data: courses } = await supabase
          .from("lw_courses")
          .select("lw_course_id, title")
          .in("lw_course_id", courseIds);
        const titleMap = new Map<string, string>();
        (courses || []).forEach((c: any) => titleMap.set(c.lw_course_id, c.title));

        setEnrollments(
          enrollData
            .map((e: any) => ({
              lw_course_id: e.lw_course_id,
              courseTitle: titleMap.get(e.lw_course_id) || e.lw_course_id,
              completion_percentage: e.completion_percentage || 0,
              enrolled_at: e.enrolled_at,
              completed_at: e.completed_at,
            }))
            .sort((a: EnrollmentProgress, b: EnrollmentProgress) => b.completion_percentage - a.completion_percentage)
        );
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="skeleton-shimmer w-20 h-8"></div>
          <div className="skeleton-shimmer w-full h-32 rounded-xl"></div>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="skeleton-shimmer h-24 rounded-xl"></div>
            <div className="skeleton-shimmer h-24 rounded-xl"></div>
            <div className="skeleton-shimmer h-24 rounded-xl"></div>
            <div className="skeleton-shimmer h-24 rounded-xl"></div>
          </div>
          <div className="skeleton-shimmer w-full h-64 rounded-xl"></div>
        </div>
      </main>
    );
  }

  if (!userData) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-muted-foreground">Hallgató nem található</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Vissza
          </Button>
        </div>
      </main>
    );
  }

  // Calculate stats
  const totalExams = examResults.length;
  const avgScore = totalExams > 0 ? examResults.reduce((sum, e) => sum + e.score, 0) / totalExams : 0;
  const passedExams = examResults.filter((e) => e.score >= 60).length;
  const passRate = totalExams > 0 ? (passedExams / totalExams) * 100 : 0;

  // Group exam results by course for bar chart
  const courseScores = examResults.reduce((acc, exam) => {
    if (!acc[exam.course_title]) {
      acc[exam.course_title] = { scores: [], count: 0 };
    }
    acc[exam.course_title].scores.push(exam.score);
    acc[exam.course_title].count++;
    return acc;
  }, {} as Record<string, { scores: number[]; count: number }>);

  const courseChartData = Object.entries(courseScores).map(([title, data]) => ({
    name: title.length > 25 ? title.substring(0, 25) + "..." : title,
    fullName: title,
    avg: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
    count: data.count,
  }));

  // Score trend over time (last 20 exams)
  const trendData = [...examResults]
    .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
    .slice(-20)
    .map((exam) => ({
      date: new Date(exam.completed_at).toLocaleDateString("hu-HU", {
        month: "short",
        day: "numeric",
      }),
      score: exam.score,
      exam: exam.exam_title,
    }));

  // Pass/fail pie chart
  const pieData = [
    { name: "Sikeres", value: passedExams, color: CHART_COLORS[2] },
    { name: "Sikertelen", value: totalExams - passedExams, color: CHART_COLORS[4] },
  ];

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6 page-enter">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Vissza
        </Button>

        {/* Student Header Card */}
        <Card className="overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-primary via-accent to-primary" />
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-primary">
                  {userData.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl">{userData.username}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-3 mt-1">
                  {userData.email && <span>{userData.email}</span>}
                  {userData.start_of_empl && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(userData.start_of_empl).toLocaleDateString("hu-HU")}
                    </span>
                  )}
                </CardDescription>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(userData.aruhaz || []).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag.replace(/^cf_aruhaz_/, "")}
                    </Badge>
                  ))}
                  {(userData.beosztas || []).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag.replace(/^cf_munkakorod_?/, "")}
                    </Badge>
                  ))}
                  {userData.current_category && (
                    <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                      {userData.current_category}
                    </Badge>
                  )}
                  {userData.nps_score !== null && userData.nps_score !== undefined && (
                    <Badge className={`text-xs ${
                      userData.nps_score >= 9 ? "bg-green-500/10 text-green-600 border-green-500/20" :
                      userData.nps_score >= 7 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" :
                      "bg-red-500/10 text-red-600 border-red-500/20"
                    }`}>
                      NPS: {userData.nps_score}/10
                    </Badge>
                  )}
                </div>
                {userData.nps_comment && (
                  <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-primary/30 pl-2 user-select-text">
                    „{userData.nps_comment}”
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Warning Card (sárga/piros lap) */}
        {userData && <WarningIndicator userId={userData.user_id} variant="card" />}

        {/* Stats Grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalExams}</p>
                  <p className="text-xs text-muted-foreground">Összes vizsga</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{avgScore.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Átlag pontszám</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{passedExams}</p>
                  <p className="text-xs text-muted-foreground">Sikeres vizsga</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                  <Award className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{badges.length}</p>
                  <p className="text-xs text-muted-foreground">Jelvények</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pass Rate Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Sikerességi arány</span>
              <span className="text-sm font-bold text-primary">{passRate.toFixed(0)}%</span>
            </div>
            <Progress value={passRate} className="h-2" />
          </CardContent>
        </Card>

        {/* Course Progress */}
        {enrollments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                Kurzus haladás
              </CardTitle>
              <CardDescription>{enrollments.length} kurzusba iratkozott be</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {enrollments.map((e) => (
                <div key={e.lw_course_id} className="p-3 rounded-lg border bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium truncate max-w-[70%]">{e.courseTitle}</span>
                    {e.completed_at ? (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Teljesítve</Badge>
                    ) : e.completion_percentage > 0 ? (
                      <Badge variant="secondary" className="text-xs">Folyamatban</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Nem kezdte el</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={e.completion_percentage} className="h-2 flex-1" />
                    <span className={`text-xs font-mono w-10 text-right ${e.completion_percentage >= 100 ? 'text-green-600 font-semibold' : 'text-muted-foreground'}`}>
                      {e.completion_percentage.toFixed(0)}%
                    </span>
                  </div>
                  {e.enrolled_at && (
                    <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Beiratkozás: {new Date(e.enrolled_at).toLocaleDateString("hu-HU")}
                      {e.completed_at && (<> · Teljesítés: {new Date(e.completed_at).toLocaleDateString("hu-HU")}</>)}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Score Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Pontszám trend
              </CardTitle>
              <CardDescription>Utolsó {trendData.length} vizsga eredménye</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      formatter={(value: number, name: string, props: any) => [
                        `${value}%`,
                        props.payload.exam,
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(200, 70%, 50%)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "hsl(200, 70%, 50%)" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                  Nincs még vizsgaeredmény
                </div>
              )}
            </CardContent>
          </Card>

          {/* Course Average Scores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent" />
                Kurzusonkénti átlag
              </CardTitle>
              <CardDescription>Átlagos teljesítmény kurzusok szerint</CardDescription>
            </CardHeader>
            <CardContent>
              {courseChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={courseChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 10 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      formatter={(value: number, name: string, props: any) => [
                        `${value}% (${props.payload.count} vizsga)`,
                        props.payload.fullName,
                      ]}
                    />
                    <Bar
                      dataKey="avg"
                      fill="hsl(200, 98%, 48%)"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                  Nincs még vizsgaeredmény
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pass/Fail Pie + Badges */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pass/Fail Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sikerességi eloszlás</CardTitle>
            </CardHeader>
            <CardContent>
              {totalExams > 0 ? (
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  Nincs adat
                </div>
              )}
              <div className="flex justify-center gap-6 mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[2] }} />
                  <span className="text-sm text-foreground">Sikeres ({passedExams})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[4] }} />
                  <span className="text-sm text-foreground">Sikertelen ({totalExams - passedExams})</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Badges */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-yellow-500" />
                Megszerzett jelvények
              </CardTitle>
            </CardHeader>
            <CardContent>
              {badges.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {badges.map((badge) => {
                    // Resolve the correct SVG icon from badge metadata
                    const resolveSvgPath = (): string | null => {
                      const { badge_type, badge_level, badge_name, icon_name } = badge.badge_definitions;
                      if (icon_name.startsWith('/')) return icon_name;
                      const nameLower = (badge_name || '').toLowerCase();
                      if (badge_type === 'category' || badge_type === 'aspirant') {
                        if (badge_level === 'bronze') return '/badges/!jovo_bronzja2_jelveny.svg';
                        if (badge_level === 'silver') return '/badges/!jovo_ezustje_svg.svg';
                        if (badge_level === 'gold') return '/badges/!jovo_aranya_jelveny.svg';
                      }
                      if (badge_type === 'monthly_star') {
                        if (nameLower.includes('vizsga') || nameLower.includes('exam') || nameLower.includes('mester'))
                          return '/badges/!honap_vizsga_mester_final.svg';
                        if (nameLower.includes('képzési') || nameLower.includes('training') || nameLower.includes('bajnok'))
                          return '/badges/!kepzesi_bajnok.svg';
                        if (nameLower.includes('kezdő') || nameLower.includes('starter') || nameLower.includes('siker') || nameLower.includes('success'))
                          return '/badges/!kezdo_siker.svg';
                      }
                      return null;
                    };
                    const svgPath = resolveSvgPath();

                    return (
                      <button
                        key={badge.id}
                        type="button"
                        onClick={() => setSelectedBadge({ ...badge, svgPath })}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-transform hover:scale-[1.02] cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-ring"
                        style={{
                          background: `${badge.badge_definitions.color}10`,
                          borderColor: `${badge.badge_definitions.color}30`,
                        }}
                      >
                        <div
                          className="w-14 h-14 rounded-xl flex items-center justify-center"
                          style={{
                            background: `${badge.badge_definitions.color}18`,
                          }}
                        >
                          {svgPath ? (
                            <img src={svgPath} alt={badge.badge_definitions.badge_name} className="w-12 h-12" style={{ objectFit: "contain" }} />
                          ) : (
                            <Award className="w-7 h-7" style={{ color: badge.badge_definitions.color }} />
                          )}
                        </div>
                        <div className="text-center min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: badge.badge_definitions.color }}>
                            {badge.badge_definitions.badge_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(badge.awarded_at).toLocaleDateString("hu-HU")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Award className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-sm">Még nincs jelvény</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Exam Results Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Legutóbbi vizsgaeredmények</CardTitle>
            <CardDescription>Az összes vizsga időrendi sorrendben</CardDescription>
          </CardHeader>
          <CardContent>
            {examResults.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">Vizsga</th>
                      <th className="text-left py-2 font-medium text-muted-foreground hidden sm:table-cell">Kurzus</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Pontszám</th>
                      <th className="text-right py-2 font-medium text-muted-foreground hidden sm:table-cell">Dátum</th>
                      <th className="text-center py-2 font-medium text-muted-foreground">Státusz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examResults.slice(0, 20).map((exam) => (
                      <tr key={exam.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5">
                          <p className="font-medium">{exam.exam_title}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">{exam.course_title}</p>
                        </td>
                        <td className="py-2.5 text-muted-foreground hidden sm:table-cell">
                          {exam.course_title}
                        </td>
                        <td className="py-2.5 text-right font-mono font-medium">
                          {exam.score.toFixed(0)}%
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                          {new Date(exam.completed_at).toLocaleDateString("hu-HU")}
                        </td>
                        <td className="py-2.5 text-center">
                          {exam.score >= 60 ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Még nincs vizsgaeredmény</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default StudentDashboard;
