import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search, Mail, Calendar, Tag, Loader2, ChevronRight, BookOpen, ArrowUp } from "lucide-react";
import StudentQuickView from "@/components/StudentQuickView";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useWarningStatuses, WarningIcon } from "@/components/WarningIndicator";


interface Student {
  user_id: string;
  username: string;
  email: string | null;
  aruhaz: string[] | null;
  beosztas: string[] | null;
  start_of_empl: string | null;
  created_at: string | null;
  current_category: string | null;
}

type SortField = "username" | "email" | "aruhaz" | "beosztas" | "category" | "enrollments" | "start_of_empl";
type SortDir = "asc" | "desc";

const Students = () => {
  const { isAdmin } = useOutletContext<{ user: any; isAdmin: boolean }>();
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAruhaz, setSelectedAruhaz] = useState<string | null>(null);
  const [availableAruhaz, setAvailableAruhaz] = useState<string[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [sortField, setSortField] = useState<SortField>("username");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`sortable-header ${className}`}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {children}
        <ArrowUp className={`w-3.5 h-3.5 sort-icon ${sortField === field ? 'active' : ''} ${sortField === field && sortDir === 'desc' ? 'desc' : ''}`} />
      </span>
    </TableHead>
  );

  useEffect(() => {
    fetchStudents();
    fetchEnrollmentCounts();
  }, []);

  // Batch-fetch warning statuses for all students
  const warningMap = useWarningStatuses(students.map(s => s.user_id));

  useEffect(() => {
    let filtered = students;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.username.toLowerCase().includes(query) ||
          (s.email && s.email.toLowerCase().includes(query))
      );
    }

    if (selectedAruhaz) {
      filtered = filtered.filter(
        (s) => s.aruhaz && s.aruhaz.includes(selectedAruhaz)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "username":
          return dir * a.username.localeCompare(b.username, "hu");
        case "email":
          return dir * (a.email || "").localeCompare(b.email || "", "hu");
        case "aruhaz":
          return dir * ((a.aruhaz || [])[0] || "").localeCompare((b.aruhaz || [])[0] || "", "hu");
        case "beosztas":
          return dir * ((a.beosztas || [])[0] || "").localeCompare((b.beosztas || [])[0] || "", "hu");
        case "category":
          return dir * (a.current_category || "").localeCompare(b.current_category || "", "hu");
        case "enrollments":
          return dir * ((enrollmentCounts[a.user_id] || 0) - (enrollmentCounts[b.user_id] || 0));
        case "start_of_empl":
          return dir * ((a.start_of_empl || "").localeCompare(b.start_of_empl || ""));
        default:
          return 0;
      }
    });

    setFilteredStudents(filtered);
  }, [searchQuery, selectedAruhaz, students, sortField, sortDir, enrollmentCounts]);

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("username", { ascending: true });

      if (error) throw error;

      setStudents(data || []);
      setFilteredStudents(data || []);

      // Extract unique aruhaz tags
      const tags = new Set<string>();
      (data || []).forEach((s) => {
        (s.aruhaz || []).forEach((tag: string) => tags.add(tag));
      });
      setAvailableAruhaz(Array.from(tags).sort());
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEnrollmentCounts = async () => {
    try {
      const { data, error } = await supabase
        .from("lw_enrollments")
        .select("user_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.user_id] = (counts[row.user_id] || 0) + 1;
      });
      setEnrollmentCounts(counts);
    } catch (e) {
      console.error("Error fetching enrollment counts:", e);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("hu-HU");
    } catch {
      return dateStr;
    }
  };

  const getCategoryColor = (category: string | null) => {
    switch (category) {
      case "gold":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "silver":
        return "bg-gray-400/10 text-gray-500 border-gray-400/20";
      case "bronze":
        return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <>
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight gradient-text">Hallgatók</h2>
            <p className="text-muted-foreground">
              LearnWorlds hallgatók áttekintése és adatkezelés
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                <AnimatedCounter value={filteredStudents.length} /> hallgató
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
                  placeholder="Keresés név vagy email alapján..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={selectedAruhaz || "all"}
                onValueChange={(v) => setSelectedAruhaz(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Szűrés áruház szerint" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Összes áruház</SelectItem>
                  {availableAruhaz.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag.replace(/^cf_aruhaz_/, "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Student Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Hallgatói Lista</CardTitle>
            <CardDescription>
              Az összes LearnWorlds-ből szinkronizált hallgató
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <SkeletonTable rows={8} columns={6} />
            ) : filteredStudents.length === 0 ? (
              <EmptyState
                icon={<Users className="w-7 h-7 opacity-60" />}
                title="Nem található hallgató"
                description="Próbáld módosítani a keresési feltételeket."
              />
            ) : (
              <div className="rounded-lg border overflow-hidden max-h-[70vh] overflow-y-auto custom-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader field="username">Név</SortHeader>
                      <SortHeader field="email" className="hidden sm:table-cell">Email</SortHeader>
                      <SortHeader field="aruhaz" className="hidden md:table-cell">Áruház</SortHeader>
                      <SortHeader field="beosztas" className="hidden lg:table-cell">Beosztás</SortHeader>
                      <SortHeader field="category" className="hidden lg:table-cell">Kategória</SortHeader>
                      <SortHeader field="enrollments" className="hidden md:table-cell">Kurzusok</SortHeader>
                      <SortHeader field="start_of_empl" className="hidden xl:table-cell">Kezdés</SortHeader>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student, idx) => (
                      <TableRow key={student.user_id} className="group cursor-pointer table-row-interactive hover:bg-muted/50 animate-fade-up" style={{ animationDelay: `${idx * 0.02}s` }} onClick={() => setSelectedStudent({ id: student.user_id, name: student.username })}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-primary">
                                {student.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm">{student.username}</p>
                                {warningMap.get(student.user_id) && (
                                  <WarningIcon warningType={warningMap.get(student.user_id)!} />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground sm:hidden">
                                {student.email || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div
                            className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                            title="Kattints a másoláshoz"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!student.email) return;
                              navigator.clipboard.writeText(student.email);
                              const el = e.currentTarget;
                              const orig = el.innerHTML;
                              el.textContent = "✓ Másolva!";
                              setTimeout(() => { el.innerHTML = orig; }, 1200);
                            }}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            {student.email || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(student.aruhaz || []).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag.replace(/^cf_aruhaz_/, "")}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(student.beosztas || []).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag.replace(/^cf_munkakorod_?/, "")}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {student.current_category ? (
                            <Badge className={getCategoryColor(student.current_category)}>
                              {student.current_category}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {enrollmentCounts[student.user_id] || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(student.start_of_empl)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>

    {/* Quick view dialog */}
    <StudentQuickView
      userId={selectedStudent?.id || null}
      username={selectedStudent?.name || ""}
      open={!!selectedStudent}
      onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}
    />
    </>
  );
};

export default Students;
