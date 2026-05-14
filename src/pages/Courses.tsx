import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Search,
  Loader2,
  Users,
  DollarSign,
  Tag,
  Layers,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";

interface Course {
  lw_course_id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  price: number | null;
  categories: string[] | null;
  sections: any | null;
  synced_at: string | null;
  enrollmentCount: number;
  avgCompletion: number;
}

interface EnrolledUser {
  user_id: string;
  username: string;
  email: string | null;
  completion_percentage: number;
  enrolled_at: string | null;
}

const Courses = () => {
  const { isAdmin } = useOutletContext<{ user: any; isAdmin: boolean }>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [enrolledUsers, setEnrolledUsers] = useState<EnrolledUser[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    let filtered = courses;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q)
      );
    }

    if (statusFilter) {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    if (categoryFilter) {
      filtered = filtered.filter(
        (c) => c.categories && c.categories.includes(categoryFilter)
      );
    }

    setFilteredCourses(filtered);
  }, [searchQuery, statusFilter, categoryFilter, courses]);

  const fetchCourses = async () => {
    try {
      const [coursesRes, enrollRes] = await Promise.all([
        supabase.from("lw_courses").select("*").order("title", { ascending: true }),
        supabase.from("lw_enrollments").select("lw_course_id, completion_percentage"),
      ]);

      if (coursesRes.error) throw coursesRes.error;

      // Aggregate enrollment data per course
      const enrollMap = new Map<string, { count: number; totalCompletion: number }>();
      (enrollRes.data || []).forEach((e: any) => {
        const existing = enrollMap.get(e.lw_course_id) || { count: 0, totalCompletion: 0 };
        existing.count++;
        existing.totalCompletion += e.completion_percentage || 0;
        enrollMap.set(e.lw_course_id, existing);
      });

      const mapped: Course[] = (coursesRes.data || []).map((c: any) => {
        const enrollment = enrollMap.get(c.lw_course_id);
        return {
          ...c,
          enrollmentCount: enrollment?.count || 0,
          avgCompletion: enrollment ? enrollment.totalCompletion / enrollment.count : 0,
        };
      });

      setCourses(mapped);
      setFilteredCourses(mapped);

      // Extract unique categories
      const cats = new Set<string>();
      mapped.forEach((c) => {
        (c.categories || []).forEach((cat: string) => cats.add(cat));
      });
      setAvailableCategories(Array.from(cats).sort());
    } catch (error) {
      console.error("Error fetching courses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCourseClick = async (course: Course) => {
    setSelectedCourse(course);
    setDetailSearch("");
    setDetailLoading(true);
    try {
      const { data: enrollments, error } = await supabase
        .from("lw_enrollments")
        .select("user_id, completion_percentage, enrolled_at")
        .eq("lw_course_id", course.lw_course_id);
      if (error) throw error;

      const userIds = (enrollments || []).map((e: any) => e.user_id);
      let userMap = new Map<string, { username: string; email: string | null }>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("user_id, username, email")
          .in("user_id", userIds);
        (users || []).forEach((u: any) => {
          userMap.set(u.user_id, { username: u.username, email: u.email });
        });
      }

      const mapped: EnrolledUser[] = (enrollments || []).map((e: any) => ({
        user_id: e.user_id,
        username: userMap.get(e.user_id)?.username || e.user_id,
        email: userMap.get(e.user_id)?.email || null,
        completion_percentage: e.completion_percentage || 0,
        enrolled_at: e.enrolled_at,
      }));
      mapped.sort((a, b) => b.completion_percentage - a.completion_percentage);
      setEnrolledUsers(mapped);
    } catch (e) {
      console.error("Error fetching enrolled users:", e);
      setEnrolledUsers([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "publish":
      case "published":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Aktív</Badge>;
      case "draft":
        return <Badge variant="secondary" className="text-xs">Piszkozat</Badge>;
      case "unpublished":
        return <Badge variant="outline" className="text-xs text-muted-foreground">Inaktív</Badge>;
      default:
        return status ? <Badge variant="outline" className="text-xs">{status}</Badge> : null;
    }
  };

  const totalEnrollments = courses.reduce((sum, c) => sum + c.enrollmentCount, 0);
  const activeCourses = courses.filter((c) => c.status === "publish" || c.status === "published").length;

  const filteredEnrolledUsers = enrolledUsers.filter((u) => {
    if (!detailSearch) return true;
    const q = detailSearch.toLowerCase();
    return u.username.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Kurzuskatalógus</h2>
            <p className="text-muted-foreground">
              LearnWorlds kurzusok áttekintése és statisztikái
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {filteredCourses.length} kurzus
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">
                {activeCourses} aktív
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {totalEnrollments} beiratkozás
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Keresés kurzusnév vagy leírás alapján..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter || "all"}
                onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Státusz" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Összes státusz</SelectItem>
                  <SelectItem value="publish">Aktív</SelectItem>
                  <SelectItem value="draft">Piszkozat</SelectItem>
                  <SelectItem value="unpublished">Inaktív</SelectItem>
                </SelectContent>
              </Select>
              {availableCategories.length > 0 && (
                <Select
                  value={categoryFilter || "all"}
                  onValueChange={(v) => setCategoryFilter(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Kategória" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Összes kategória</SelectItem>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Course Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nem található kurzus a szűrési feltételekkel</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course, idx) => (
              <Card
                key={course.lw_course_id}
                className="group hover:shadow-md transition-all duration-300 animate-fade-up cursor-pointer"
                style={{ animationDelay: `${idx * 0.03}s` }}
                onClick={() => handleCourseClick(course)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
                      {course.title || course.lw_course_id}
                    </CardTitle>
                    {getStatusBadge(course.status)}
                  </div>
                  {course.description && (
                    <CardDescription className="text-xs line-clamp-2 mt-1">
                      {course.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      <span>{course.enrollmentCount} beiratkozó</span>
                    </div>
                    {course.price !== null && course.price > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>{course.price.toLocaleString("hu-HU")} Ft</span>
                      </div>
                    )}
                    {(course.price === null || course.price === 0) && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Ingyenes</Badge>
                    )}
                  </div>

                  {/* Completion Progress */}
                  {course.enrollmentCount > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Átl. teljesítés</span>
                        <span className="font-medium text-foreground">{course.avgCompletion.toFixed(0)}%</span>
                      </div>
                      <Progress value={course.avgCompletion} className="h-1.5" />
                    </div>
                  )}

                  {/* Categories */}
                  {course.categories && course.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {course.categories.map((cat) => (
                        <Badge key={cat} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Sections count */}
                  {course.sections && Array.isArray(course.sections) && course.sections.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Layers className="w-3.5 h-3.5" />
                      <span>{course.sections.length} szekció</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Course Detail Dialog */}
      <Dialog open={!!selectedCourse} onOpenChange={(open) => { if (!open) setSelectedCourse(null); }}>
        <DialogContent className="sm:max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {selectedCourse?.title || selectedCourse?.lw_course_id}
            </DialogTitle>
            <DialogDescription>
              Beiratkozott felhasználók ({enrolledUsers.length})
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          {enrolledUsers.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Keresés név vagy email alapján..."
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                className="pl-8 h-8 text-sm w-full"
              />
            </div>
          )}

          {/* User List */}
          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEnrolledUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {enrolledUsers.length === 0 ? "Nincs beiratkozott felhasználó" : "Nincs találat"}
            </div>
          ) : (
            <div className="space-y-1 max-h-[45vh] overflow-y-auto custom-scroll">
              {filteredEnrolledUsers.map((user) => (
                <div key={user.user_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.username}</p>
                    {user.email && (
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16">
                      <Progress value={user.completion_percentage} className="h-1.5" />
                    </div>
                    <span className={`text-xs font-mono w-10 text-right ${
                      user.completion_percentage >= 100 ? "text-green-600 font-semibold" :
                      user.completion_percentage > 0 ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {user.completion_percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="sm:justify-end">
            <Button variant="outline" onClick={() => setSelectedCourse(null)}>
              Bezárás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default Courses;
