import { useState, useEffect, useMemo } from "react";
import { useOutletContext, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  BookOpen,
  TrendingUp,
  Award,
  BarChart3,
  Loader2,
  ChevronRight,
  Calendar,
  Target,
  Filter,
  Search,
  Mail,
  Eye,
  GraduationCap,
  ArrowUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { AnimatedCounter } from "@/components/ui/animated-counter";

// Diego-themed chart palette (reds, warm neutrals, accents)
const COLORS = [
  "hsl(356, 93%, 45%)",  // Diego red
  "hsl(142, 76%, 36%)",  // Green
  "hsl(38, 92%, 50%)",   // Amber
  "hsl(200, 60%, 50%)",  // Blue
  "hsl(20, 80%, 55%)",   // Orange
  "hsl(280, 60%, 55%)",  // Purple
  "hsl(170, 65%, 40%)",  // Teal
  "hsl(356, 70%, 65%)",  // Rose
  "hsl(50, 85%, 48%)",   // Gold
  "hsl(210, 70%, 40%)",  // Navy
  "hsl(330, 60%, 50%)",  // Magenta
  "hsl(90, 55%, 45%)",   // Olive
  "hsl(15, 75%, 48%)",   // Rust
  "hsl(190, 70%, 45%)",  // Cyan
  "hsl(260, 50%, 60%)",  // Lavender
  "hsl(45, 90%, 55%)",   // Mustard
];

interface ExamRow {
  user_id: string;
  username: string;
  email: string | null;
  course_id: string;
  course_title: string;
  score: number;
  completed_at: string;
}

interface UserRow {
  user_id: string;
  username: string;
  aruhaz: string[] | null;
  nps_score: number | null;
  nps_comment: string | null;
}

// Test/dev user names to exclude from rankings
const EXCLUDED_USERS = ["lwsupport test", "lw dev"];

const PerformanceOverview = () => {
  const { isAdmin } = useOutletContext<{ user: any; isAdmin: boolean }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allExams, setAllExams] = useState<ExamRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [badgeDetails, setBadgeDetails] = useState<Array<{
    id: string;
    user_id: string;
    username: string;
    awarded_at: string;
    badge_name: string;
    badge_type: string;
    badge_level: string | null;
    icon_name: string;
    color: string;
    description: string;
  }>>([]);
  const [badgeDialogOpen, setBadgeDialogOpen] = useState(false);
  const [courseCompletionData, setCourseCompletionData] = useState<{name: string; fullName: string; avg: number; count: number}[]>([]);

  // View and filter state
  const [activeView, setActiveView] = useState<"overview" | "users">("overview");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");
  const [userSortField, setUserSortField] = useState<"username" | "count" | "avg">("username");
  const [userSortDir, setUserSortDir] = useState<"asc" | "desc">("asc");

  const toggleUserSort = (field: typeof userSortField) => {
    if (userSortField === field) setUserSortDir(userSortDir === "asc" ? "desc" : "asc");
    else { setUserSortField(field); setUserSortDir("asc"); }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [examRes, userRes, badgeRes] = await Promise.all([
        supabase.from("exam_results").select("user_id, username, email, course_id, course_title, score, completed_at"),
        supabase.from("users").select("user_id, username, aruhaz, nps_score, nps_comment"),
        supabase.from("user_badges").select("id", { count: "exact", head: true }).is("revoked_at", null),
      ]);
      setAllExams(examRes.data || []);
      setUsers(userRes.data || []);
      setBadgeCount(badgeRes.count || 0);

      // Fetch full badge details for the dialog
      const { data: fullBadges } = await supabase
        .from("user_badges")
        .select("id, user_id, awarded_at, badge_definitions(badge_name, badge_type, badge_level, icon_name, color, description)")
        .is("revoked_at", null)
        .order("awarded_at", { ascending: false });

      if (fullBadges) {
        // Map usernames
        const userMap = new Map<string, string>();
        (userRes.data || []).forEach((u: any) => userMap.set(u.user_id, u.username));

        setBadgeDetails(fullBadges.map((b: any) => ({
          id: b.id,
          user_id: b.user_id,
          username: userMap.get(b.user_id) || b.user_id,
          awarded_at: b.awarded_at,
          badge_name: b.badge_definitions?.badge_name || "—",
          badge_type: b.badge_definitions?.badge_type || "—",
          badge_level: b.badge_definitions?.badge_level || null,
          icon_name: b.badge_definitions?.icon_name || "Award",
          color: b.badge_definitions?.color || "#888",
          description: b.badge_definitions?.description || "",
        })));
      }

      // Fetch course completion data
      try {
        const [enrollData, courseData] = await Promise.all([
          supabase.from("lw_enrollments").select("lw_course_id, completion_percentage"),
          supabase.from("lw_courses").select("lw_course_id, title"),
        ]);
        const courseMap = new Map<string, string>();
        (courseData.data || []).forEach((c: any) => courseMap.set(c.lw_course_id, c.title));

        const aggMap = new Map<string, { total: number; count: number }>();
        (enrollData.data || []).forEach((e: any) => {
          const existing = aggMap.get(e.lw_course_id) || { total: 0, count: 0 };
          existing.total += e.completion_percentage || 0;
          existing.count++;
          aggMap.set(e.lw_course_id, existing);
        });

        const completionArr = Array.from(aggMap.entries())
          .map(([id, agg]) => ({
            name: (courseMap.get(id) || id).substring(0, 25) + ((courseMap.get(id) || id).length > 25 ? "..." : ""),
            fullName: courseMap.get(id) || id,
            avg: Math.round(agg.total / agg.count),
            count: agg.count,
          }))
          .filter((c) => c.count >= 1)
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 10);
        setCourseCompletionData(completionArr);
      } catch (e2) {
        console.error("Error fetching course completion:", e2);
      }
    } catch (e) {
      console.error("Error fetching performance data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Available years/months for filter
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    allExams.forEach((e) => years.add(new Date(e.completed_at).getFullYear().toString()));
    return Array.from(years).sort();
  }, [allExams]);

  const MONTHS = ["Január","Február","Március","Április","Május","Június","Július","Augusztus","Szeptember","Október","November","December"];

  // Filtered exams
  const exams = useMemo(() => {
    return allExams.filter((e) => {
      const d = new Date(e.completed_at);
      if (selectedYear !== "all" && d.getFullYear().toString() !== selectedYear) return false;
      if (selectedMonth !== "all" && (d.getMonth() + 1).toString() !== selectedMonth) return false;
      return true;
    });
  }, [allExams, selectedYear, selectedMonth]);

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-6 w-48 bg-muted rounded animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-lg border bg-card p-5 space-y-3">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
          <SkeletonTable rows={6} columns={5} />
        </div>
      </main>
    );
  }

  // ── Computed metrics ──
  const totalStudents = new Set(exams.map((e) => e.user_id)).size;
  const totalExams = exams.length;
  const avgScore = totalExams > 0 ? exams.reduce((s, e) => s + e.score, 0) / totalExams : 0;
  const passedExams = exams.filter((e) => e.score >= 60).length;
  const passRate = totalExams > 0 ? (passedExams / totalExams) * 100 : 0;

  // ── Monthly trend ──
  const monthlyMap = new Map<string, { total: number; count: number; passed: number }>();
  exams.forEach((e) => {
    const d = new Date(e.completed_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = monthlyMap.get(key) || { total: 0, count: 0, passed: 0 };
    cur.total += e.score;
    cur.count++;
    if (e.score >= 60) cur.passed++;
    monthlyMap.set(key, cur);
  });
  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, d]) => ({
      month: month.slice(2),
      avg: Math.round(d.total / d.count),
      count: d.count,
      passRate: Math.round((d.passed / d.count) * 100),
    }));

  // ── Course stats ──
  const courseMap = new Map<string, { title: string; total: number; count: number; passed: number }>();
  exams.forEach((e) => {
    const cur = courseMap.get(e.course_id) || { title: e.course_title, total: 0, count: 0, passed: 0 };
    cur.total += e.score;
    cur.count++;
    if (e.score >= 60) cur.passed++;
    courseMap.set(e.course_id, cur);
  });
  const courseStats = Array.from(courseMap.values())
    .map((c) => ({
      name: c.title.length > 30 ? c.title.slice(0, 30) + "…" : c.title,
      fullName: c.title,
      avg: Math.round(c.total / c.count),
      count: c.count,
      passRate: Math.round((c.passed / c.count) * 100),
    }))
    .sort((a, b) => b.avg - a.avg);

  // ── Store stats ──
  const storeMap = new Map<string, { total: number; count: number; students: Set<string> }>();
  exams.forEach((e) => {
    const user = users.find((u) => u.user_id === e.user_id);
    const stores = user?.aruhaz || [];
    if (stores.length === 0) return;
    stores.forEach((store) => {
      const label = store.replace(/^cf_aruhaz_/, "");
      const cur = storeMap.get(label) || { total: 0, count: 0, students: new Set<string>() };
      cur.total += e.score;
      cur.count++;
      cur.students.add(e.user_id);
      storeMap.set(label, cur);
    });
  });
  const storeStats = Array.from(storeMap.entries())
    .filter(([name]) => name.trim() !== "")
    .map(([name, d]) => ({ name, avg: Math.round(d.total / d.count), students: d.students.size, exams: d.count }))
    .sort((a, b) => b.avg - a.avg);

  // ── Top performers (use users table for real names + store) ──
  const userScoreMap = new Map<string, { total: number; count: number; username: string; aruhaz: string[] }>();
  exams.forEach((e) => {
    const userRecord = users.find((u) => u.user_id === e.user_id);
    const displayName = userRecord?.username || e.username || "Ismeretlen";
    const aruhaz = (userRecord?.aruhaz || []).map((s) => s.replace(/^cf_aruhaz_/, "")).filter((s) => s.trim() !== "");
    const cur = userScoreMap.get(e.user_id) || { total: 0, count: 0, username: displayName, aruhaz };
    cur.total += e.score;
    cur.count++;
    userScoreMap.set(e.user_id, cur);
  });
  const topPerformers = Array.from(userScoreMap.entries())
    .filter(([, d]) => d.count >= 1 && !EXCLUDED_USERS.includes(d.username.toLowerCase()))
    .map(([id, d]) => ({
      user_id: id,
      username: d.username,
      avg: Math.round((d.total / d.count) * 10) / 10,
      count: d.count,
      aruhaz: d.aruhaz,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  // ── User list for "Felhasználószintű" view ──
  const allUserStats = Array.from(userScoreMap.entries())
    .filter(([, d]) => !EXCLUDED_USERS.includes(d.username.toLowerCase()))
    .map(([id, d]) => ({
      user_id: id,
      username: d.username,
      avg: Math.round((d.total / d.count) * 10) / 10,
      count: d.count,
      aruhaz: d.aruhaz,
    }))
    .sort((a, b) => a.username.localeCompare(b.username, "hu"));

  const filteredUserList = (userSearch
    ? allUserStats.filter((u) => u.username.toLowerCase().includes(userSearch.toLowerCase()))
    : allUserStats
  ).sort((a, b) => {
    const dir = userSortDir === "asc" ? 1 : -1;
    switch (userSortField) {
      case "username": return dir * a.username.localeCompare(b.username, "hu");
      case "count": return dir * (a.count - b.count);
      case "avg": return dir * (a.avg - b.avg);
      default: return 0;
    }
  });

  // ── Score distribution (pie) ──
  const distBuckets = [
    { name: "Kiváló (90-100%)", min: 90, max: 101, color: COLORS[1] },   // Green
    { name: "Jó (75-89%)", min: 75, max: 90, color: COLORS[3] },         // Blue
    { name: "Megfelelő (60-74%)", min: 60, max: 75, color: COLORS[2] },  // Amber/Orange
    { name: "Elégtelen (<60%)", min: 0, max: 60, color: COLORS[0] },     // Red
  ];
  const distData = distBuckets.map((b) => ({
    ...b,
    value: exams.filter((e) => e.score >= b.min && e.score < b.max).length,
  }));

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--card-foreground))",
  };
  const tooltipLabelStyle = { color: "hsl(var(--card-foreground))" };
  const tooltipItemStyle = { color: "hsl(var(--card-foreground))" };

  const isFiltered = selectedYear !== "all" || selectedMonth !== "all";

  return (
    <>
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6 page-enter">
        {/* Header + View Tabs + Date Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight gradient-text">Teljesítmény</h2>
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "overview" | "users")}>
              <TabsList className="h-9">
                <TabsTrigger value="overview" className="gap-1.5 text-sm transition-all duration-200 hover:bg-background/60 hover:text-foreground"><BarChart3 className="w-4 h-4" /> Áttekintés</TabsTrigger>
                <TabsTrigger value="users" className="gap-1.5 text-sm transition-all duration-200 hover:bg-background/60 hover:text-foreground"><Users className="w-4 h-4" /> Felhasználószintű</TabsTrigger>
              </TabsList>
            </Tabs>
            {activeView === "overview" && isFiltered && (
              <p className="text-sm text-muted-foreground">
                Összesített metrikák <span className="text-primary font-medium">(szűrve)</span>
              </p>
            )}
          </div>
          {activeView === "overview" && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedYear} onValueChange={(v) => setSelectedYear(v)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Év" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Összes év</SelectItem>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Hónap" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Összes hónap</SelectItem>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {activeView === "users" && (
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Keresés név alapján..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
        </div>

        {activeView === "overview" && (<>
        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <Card className="kpi-card animate-fade-up stagger-1"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
            <div><p className="text-2xl font-bold animate-count-up stat-value"><AnimatedCounter value={totalStudents} /></p><p className="text-xs text-muted-foreground">Aktív hallgató</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-2"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><BookOpen className="w-5 h-5 text-primary" /></div>
            <div><p className="text-2xl font-bold animate-count-up stat-value"><AnimatedCounter value={totalExams} /></p><p className="text-xs text-muted-foreground">Összes vizsga</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-3"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-primary" /></div>
            <div><p className="text-2xl font-bold animate-count-up stat-value"><AnimatedCounter value={Math.round(avgScore * 10) / 10} suffix="%" /></p><p className="text-xs text-muted-foreground">Átlag pontszám</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-4"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center"><Target className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-2xl font-bold animate-count-up stat-value"><AnimatedCounter value={Math.round(passRate)} suffix="%" /></p><p className="text-xs text-muted-foreground">Sikerességi arány</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-5 cursor-pointer hover:ring-2 hover:ring-yellow-500/40 transition-all" onClick={() => setBadgeDialogOpen(true)}><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center"><Award className="w-5 h-5 text-yellow-600" /></div>
            <div><p className="text-2xl font-bold animate-count-up stat-value">{badgeCount}</p><p className="text-xs text-muted-foreground">Kiosztott jelvény</p></div>
          </div></CardContent></Card>
        </div>

        {/* Pass rate bar */}
        <Card><CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Globális sikerességi arány</span>
            <span className="text-sm">
              <span className="font-bold text-primary">{passedExams}</span>
              <span className="text-muted-foreground"> / {totalExams} vizsga sikeres</span>
            </span>
          </div>
          <Progress value={passRate} className="h-2.5" />
        </CardContent></Card>

        {/* Monthly trend (ComposedChart) + Score distribution */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Havi teljesítmény trend
              </CardTitle>
              <CardDescription>Átlagos pontszám és sikerességi arány havonta</CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={monthlyTrend} margin={{ top: 20, right: 5, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" label={{ value: "%", position: "insideTopLeft", offset: -5, fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" label={{ value: "db", position: "insideTopRight", offset: -5, fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number, name: string) => {
                      if (name === "avg") return [`${value}%`, "Átlag pontszám"];
                      if (name === "passRate") return [`${value}%`, "Sikerességi arány"];
                      return [`${value} db`, "Vizsgaszám"];
                    }} />
                    <Bar yAxisId="right" dataKey="count" fill={COLORS[0]} opacity={0.15} radius={[4, 4, 0, 0]} name="count" />
                    <Line yAxisId="left" type="monotone" dataKey="avg" stroke={COLORS[0]} strokeWidth={2.5} dot={{ r: 4, fill: COLORS[0] }} name="avg" />
                    <Line yAxisId="left" type="monotone" dataKey="passRate" stroke={COLORS[2]} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: COLORS[2] }} name="passRate" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[280px] text-muted-foreground">Nincs adat a kiválasztott időszakra</div>
              )}
              <div className="flex justify-center gap-6 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <div className="w-8 h-0.5 rounded" style={{ background: COLORS[0] }} /> Átlag %
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-8 h-0.5 rounded" style={{ background: COLORS[2], borderTop: "2px dashed " + COLORS[2] }} /> Sikerességi %
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-3 rounded-sm opacity-20" style={{ background: COLORS[0] }} /> Vizsgaszám
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pontszám eloszlás</CardTitle>
              <CardDescription>Vizsgaeredmények kategóriák szerint</CardDescription>
            </CardHeader>
            <CardContent>
              {totalExams > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={distData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                        {distData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number, name: string) => [`${value} vizsga`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {distData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                          {d.name}
                        </span>
                        <span className="font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[280px] text-muted-foreground">Nincs adat</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Course + Store */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" /> Kurzus teljesítmény</CardTitle>
              <CardDescription>Átlagos teljesítmény kurzusonként</CardDescription>
            </CardHeader>
            <CardContent>
              {courseStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, courseStats.length * 45)}>
                  <BarChart data={courseStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number, _: string, props: any) => [
                      `${value}% (${props.payload.count} vizsga, ${props.payload.passRate}% sikeres)`, props.payload.fullName,
                    ]} />
                    <Bar dataKey="avg" radius={[0, 6, 6, 0]}>
                      {courseStats.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">Nincs adat</div>
              )}
              {courseStats.length > 0 && (
                <div className="mt-6 pt-4 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Részletes kurzus statisztikák</p>
                  {courseStats.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30 border">
                      <span className="text-xs font-medium truncate" title={c.fullName}>{c.name}</span>
                      <div className="flex items-center gap-2.5 flex-shrink-0 text-xs">
                        <span className="text-muted-foreground">{c.count} vizsga</span>
                        <span className={`font-bold px-1.5 py-0.5 rounded ${
                          c.passRate >= 90 ? "bg-green-500/15 text-green-700 dark:text-green-400"
                          : c.passRate >= 70 ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                          : c.passRate >= 50 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : "bg-red-500/15 text-red-700 dark:text-red-400"
                        }`}>{c.passRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Áruház összehasonlítás</CardTitle>
              <CardDescription>Átlagos teljesítmény áruházanként</CardDescription>
            </CardHeader>
            <CardContent>
              {storeStats.length > 0 ? (
                <div className="space-y-3">
                  {storeStats.map((store, i) => (
                    <div key={store.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{store.name}</span>
                        <span className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{store.students} fő</span>
                          <span>{store.exams} vizsga</span>
                          <span className="font-semibold text-foreground">{store.avg}%</span>
                        </span>
                      </div>
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${store.avg}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">Nincs áruház adat</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Course Completion Rates */}
        {courseCompletionData.length > 0 && (
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                Kurzus teljesítési arány (Top 10)
              </CardTitle>
              <CardDescription>Átlagos kurzusteljesítés a beiratkozott hallgatók alapján</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(250, courseCompletionData.length * 36)}>
                <BarChart data={courseCompletionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={170}
                    tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(value: number, _: string, props: any) => [
                      `${value}% (${props.payload.count} hallgató)`,
                      props.payload.fullName,
                    ]}
                  />
                  <Bar dataKey="avg" fill="hsl(142, 76%, 36%)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* ── NPS Section ── */}
        {(() => {
          const npsUsers = users.filter(u => u.nps_score !== null && u.nps_score !== undefined);
          if (npsUsers.length === 0) return null;
          const avgNps = Math.round(npsUsers.reduce((s, u) => s + (u.nps_score ?? 0), 0) / npsUsers.length * 10) / 10;
          const promoters = npsUsers.filter(u => (u.nps_score ?? 0) >= 9).length;
          const passives = npsUsers.filter(u => (u.nps_score ?? 0) >= 7 && (u.nps_score ?? 0) <= 8).length;
          const detractors = npsUsers.filter(u => (u.nps_score ?? 0) <= 6).length;
          const npsScore = Math.round((promoters / npsUsers.length - detractors / npsUsers.length) * 100);
          const recentComments = npsUsers
            .filter(u => u.nps_comment)
            .sort((a, b) => (b.nps_score ?? 0) - (a.nps_score ?? 0))
            .slice(0, 10);
          const npsColor = npsScore >= 50 ? "text-green-500" : npsScore >= 0 ? "text-yellow-500" : "text-red-500";

          return (
            <div className="grid gap-4 lg:grid-cols-3">
              {/* NPS Score Card */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    NPS Pontszám
                  </CardTitle>
                  <CardDescription>Net Promoter Score összesítés</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <p className={`text-5xl font-bold ${npsColor}`}>
                      <AnimatedCounter value={npsScore} />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">NPS ({npsUsers.length} válasz)</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        Promoter (9-10)
                      </span>
                      <span className="font-medium">{promoters} ({Math.round(promoters / npsUsers.length * 100)}%)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        Passzív (7-8)
                      </span>
                      <span className="font-medium">{passives} ({Math.round(passives / npsUsers.length * 100)}%)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        Detractor (0-6)
                      </span>
                      <span className="font-medium">{detractors} ({Math.round(detractors / npsUsers.length * 100)}%)</span>
                    </div>
                  </div>
                  {/* Stacked bar */}
                  <div className="flex h-3 rounded-full overflow-hidden">
                    <div className="bg-green-500 transition-all" style={{ width: `${promoters / npsUsers.length * 100}%` }} />
                    <div className="bg-yellow-500 transition-all" style={{ width: `${passives / npsUsers.length * 100}%` }} />
                    <div className="bg-red-500 transition-all" style={{ width: `${detractors / npsUsers.length * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Átlag pontszám: <span className="font-semibold text-foreground">{avgNps}/10</span>
                  </p>
                </CardContent>
              </Card>

              {/* NPS Comments */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" />
                    NPS Visszajelzések
                  </CardTitle>
                  <CardDescription>Legutóbbi hallgatói vélemények ({recentComments.length} db)</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentComments.length > 0 ? (
                    <div className="space-y-3 max-h-[280px] overflow-y-auto custom-scroll pr-2">
                      {recentComments.map((u, idx) => (
                        <div key={idx} className="flex gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                            (u.nps_score ?? 0) >= 9 ? "bg-green-500/15 text-green-600" :
                            (u.nps_score ?? 0) >= 7 ? "bg-yellow-500/15 text-yellow-600" :
                            "bg-red-500/15 text-red-600"
                          }`}>
                            {u.nps_score}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{u.username}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 break-words user-select-text">{u.nps_comment}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Nincs szöveges visszajelzés</p>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Recent exams */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Legutóbbi vizsgaeredmények</CardTitle>
            <CardDescription>Legfrissebb vizsgák időrendben</CardDescription>
          </CardHeader>
          <CardContent>
            {exams.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {[...exams]
                  .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
                  .slice(0, 10)
                  .map((exam, i) => {
                    const resolvedName = users.find(u => u.user_id === exam.user_id)?.username || exam.username || "Ismeretlen";
                    const scoreColor = exam.score >= 90 ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : exam.score >= 75 ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                      : exam.score >= 60 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-red-500/15 text-red-700 dark:text-red-400";
                    const daysAgo = Math.floor((Date.now() - new Date(exam.completed_at).getTime()) / 86400000);
                    const timeLabel = daysAgo === 0 ? "ma" : daysAgo === 1 ? "tegnap" : `${daysAgo} napja`;
                    return (
                      <div key={`${exam.user_id}-${exam.completed_at}-${i}`} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 border">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">{resolvedName.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{resolvedName}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{exam.course_title}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] text-muted-foreground">{timeLabel}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${scoreColor}`}>{exam.score}%</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[120px] text-muted-foreground">Nincs adat</div>
            )}
          </CardContent>
        </Card>

        {/* Top performers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4 text-yellow-500" /> Top 10 Teljesítő</CardTitle>
            <CardDescription>Hallgatók átlagos pontszám szerint rangsorolva</CardDescription>
          </CardHeader>
          <CardContent>
            {topPerformers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground w-10">#</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Hallgató</th>
                      <th className="text-left py-2 font-medium text-muted-foreground hidden md:table-cell">Áruház</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Vizsgák</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Átlag</th>
                      <th className="text-right py-2 font-medium text-muted-foreground w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPerformers.map((p, i) => {
                      const medalClass = i === 0 ? "medal-gold" : i === 1 ? "medal-silver" : i === 2 ? "medal-bronze" : "";
                      return (
                      <tr key={p.user_id} className={`border-b last:border-0 hover:bg-muted/30 group cursor-pointer animate-fade-up stagger-${Math.min(i + 1, 10)} ${medalClass}`} onClick={() => navigate(`/performance/${p.user_id}`)}>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            i === 0 ? "bg-yellow-500/15 text-yellow-600" :
                            i === 1 ? "bg-gray-400/15 text-gray-500" :
                            i === 2 ? "bg-orange-500/15 text-orange-600" :
                            "bg-muted text-muted-foreground"
                          }`}>{i + 1}</span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-primary">{p.username.charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="font-medium">{p.username}</span>
                          </div>
                        </td>
                        <td className="py-2.5 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {p.aruhaz.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">{p.count}</td>
                        <td className="py-2.5 text-right font-mono font-semibold">{p.avg}%</td>
                        <td className="py-2.5 text-right">
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">Nincs adat a kiválasztott időszakra</div>
            )}
          </CardContent>
        </Card>
        </>)}

        {/* Felhasználószintű nézet */}
        {activeView === "users" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Felhasználók teljesítménye</CardTitle>
              <CardDescription>
                Kattints egy felhasználóra a részletes metrikák megtekintéséhez
                {isFiltered && <span className="text-primary font-medium"> (szűrve)</span>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredUserList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground sortable-header" onClick={() => toggleUserSort("username")}>
                          <span className="inline-flex items-center gap-1">Hallgató <ArrowUp className={`w-3.5 h-3.5 sort-icon ${userSortField === 'username' ? 'active' : ''} ${userSortField === 'username' && userSortDir === 'desc' ? 'desc' : ''}`} /></span>
                        </th>
                        <th className="text-left py-2 font-medium text-muted-foreground hidden md:table-cell">Áruház</th>
                        <th className="text-right py-2 font-medium text-muted-foreground sortable-header" onClick={() => toggleUserSort("count")}>
                          <span className="inline-flex items-center gap-1">Vizsgák <ArrowUp className={`w-3.5 h-3.5 sort-icon ${userSortField === 'count' ? 'active' : ''} ${userSortField === 'count' && userSortDir === 'desc' ? 'desc' : ''}`} /></span>
                        </th>
                        <th className="text-right py-2 font-medium text-muted-foreground sortable-header" onClick={() => toggleUserSort("avg")}>
                          <span className="inline-flex items-center gap-1">Átlag <ArrowUp className={`w-3.5 h-3.5 sort-icon ${userSortField === 'avg' ? 'active' : ''} ${userSortField === 'avg' && userSortDir === 'desc' ? 'desc' : ''}`} /></span>
                        </th>
                        <th className="text-right py-2 font-medium text-muted-foreground w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUserList.map((u) => (
                        <tr
                          key={u.user_id}
                          className="border-b last:border-0 table-row-interactive group cursor-pointer"
                          onClick={() => navigate(`/performance/${u.user_id}`)}
                        >
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-primary">{u.username.charAt(0).toUpperCase()}</span>
                              </div>
                              <span className="font-medium">{u.username}</span>
                            </div>
                          </td>
                          <td className="py-2.5 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {u.aruhaz.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">{u.count}</td>
                          <td className="py-2.5 text-right font-mono font-semibold">{u.avg}%</td>
                          <td className="py-2.5 text-right">
                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Nincs találat</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>

    {/* Badge details dialog */}
    <Dialog open={badgeDialogOpen} onOpenChange={setBadgeDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-600" />
            Kiosztott jelvények ({badgeCount})
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          {badgeDetails.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Még nincsenek kiosztott jelvények</p>
            </div>
          ) : (
            <div className="space-y-2">
              {badgeDetails.map((b) => {
                // Resolve the effective SVG path from badge metadata
                const resolveSvgPath = (): string | null => {
                  if (b.icon_name.startsWith('/')) return b.icon_name;
                  const nameLower = (b.badge_name || '').toLowerCase();
                  if (b.badge_type === 'category' || b.badge_type === 'aspirant') {
                    if (b.badge_level === 'bronze') return '/badges/!jovo_bronzja2_jelveny.svg';
                    if (b.badge_level === 'silver') return '/badges/!jovo_ezustje_svg.svg';
                    if (b.badge_level === 'gold') return '/badges/!jovo_aranya_jelveny.svg';
                  }
                  if (b.badge_type === 'monthly_star') {
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
                const typeLabels: Record<string, string> = {
                  category: "Kategória",
                  aspirant: "Törekvő",
                  monthly_star: "Havi csillag",
                  progress: "Előrehaladás",
                };
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => { setBadgeDialogOpen(false); navigate(`/performance/${b.user_id}`); }}
                  >
                    {/* Badge icon */}
                    <div
                      className={`${svgPath ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg flex items-center justify-center flex-shrink-0`}
                      style={{ backgroundColor: `${b.color}15`, border: `1.5px solid ${b.color}30` }}
                    >
                      {svgPath ? (
                        <img src={svgPath} alt={b.badge_name} className="w-10 h-10" style={{ objectFit: "contain" }} />
                      ) : (
                        <Award className="w-5 h-5" style={{ color: b.color }} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{b.username}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 flex-shrink-0"
                          style={{ borderColor: `${b.color}50`, color: b.color }}
                        >
                          {typeLabels[b.badge_type] || b.badge_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.badge_name}
                        {b.badge_level && ` (${b.badge_level})`}
                      </p>
                    </div>

                    {/* Date */}
                    <div className="text-[11px] text-muted-foreground text-right flex-shrink-0">
                      {new Date(b.awarded_at).toLocaleDateString("hu-HU", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default PerformanceOverview;
