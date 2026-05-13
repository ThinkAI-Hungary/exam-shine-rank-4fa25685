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

  // View and filter state
  const [activeView, setActiveView] = useState<"overview" | "users">("overview");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [examRes, userRes, badgeRes] = await Promise.all([
        supabase.from("exam_results").select("user_id, username, email, course_id, course_title, score, completed_at"),
        supabase.from("users").select("user_id, username, aruhaz"),
        supabase.from("user_badges").select("id", { count: "exact", head: true }).is("revoked_at", null),
      ]);
      setAllExams(examRes.data || []);
      setUsers(userRes.data || []);
      setBadgeCount(badgeRes.count || 0);
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
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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

  const filteredUserList = userSearch
    ? allUserStats.filter((u) => u.username.toLowerCase().includes(userSearch.toLowerCase()))
    : allUserStats;

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
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header + View Tabs + Date Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">Teljesítmény</h2>
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
            <div><p className="text-2xl font-bold animate-count-up">{totalStudents}</p><p className="text-xs text-muted-foreground">Aktív hallgató</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-2"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><BookOpen className="w-5 h-5 text-primary" /></div>
            <div><p className="text-2xl font-bold animate-count-up">{totalExams}</p><p className="text-xs text-muted-foreground">Összes vizsga</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-3"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-primary" /></div>
            <div><p className="text-2xl font-bold animate-count-up">{avgScore.toFixed(1)}%</p><p className="text-xs text-muted-foreground">Átlag pontszám</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-4"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center"><Target className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-2xl font-bold animate-count-up">{passRate.toFixed(0)}%</p><p className="text-xs text-muted-foreground">Sikerességi arány</p></div>
          </div></CardContent></Card>
          <Card className="kpi-card animate-fade-up stagger-5"><CardContent className="pt-6"><div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center"><Award className="w-5 h-5 text-yellow-600" /></div>
            <div><p className="text-2xl font-bold animate-count-up">{badgeCount}</p><p className="text-xs text-muted-foreground">Kiosztott jelvény</p></div>
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
                  <ComposedChart data={monthlyTrend}>
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
                        <th className="text-left py-2 font-medium text-muted-foreground">Hallgató</th>
                        <th className="text-left py-2 font-medium text-muted-foreground hidden md:table-cell">Áruház</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Vizsgák</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Átlag</th>
                        <th className="text-right py-2 font-medium text-muted-foreground w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUserList.map((u) => (
                        <tr
                          key={u.user_id}
                          className="border-b last:border-0 hover:bg-muted/30 group cursor-pointer"
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
  );
};

export default PerformanceOverview;
