import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  ArrowUp,
  AlertCircle,
  Eye,
  Trash2,
  Activity,
  Download,
  Pencil,
  Link2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatedCounter } from "@/components/ui/animated-counter";

// ── Types ──
interface CompanyRow {
  id: string;
  company_name: string;
  tax_number: string;
  current_employee_count: number | null;
  previous_employee_count: number | null;
  last_checked_at: string | null;
  last_change_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  company_status: string | null;
  foundation_date: string | null;
  main_activity: string | null;
  registered_capital: string | null;
  company_form: string | null;
  lw_group_id: string | null;
}

interface LwGroup {
  lw_group_id: string;
  title: string;
}

interface LogEntry {
  id: string;
  company_id: string;
  employee_count: number;
  previous_count: number | null;
  changed: boolean;
  checked_at: string;
}

// ── Edge Function caller ──
async function callOptenFunction(action: string, payload: Record<string, unknown>) {
  console.log("[callOptenFunction]", action, payload);
  const { data, error } = await supabase.functions.invoke("opten-check-employees", {
    body: { action, ...payload },
  });
  if (data && !data.success) {
    throw new Error(data.error || "Ismeretlen hiba az Edge Function-ben");
  }
  if (error) {
    const msg = data?.error || error.message || "Edge function hiba";
    throw new Error(msg);
  }
  return data;
}

// ── Component ──
const CompanyMonitoring = () => {
  const { isAdmin } = useOutletContext<{ user: any; isAdmin: boolean }>();
  const { toast } = useToast();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [checkAllLoading, setCheckAllLoading] = useState(false);
  const [sortField, setSortField] = useState<"company_name" | "current_employee_count" | "last_checked_at">("company_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Add dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ company_name: "", tax_number: "", notes: "" });

  // Company name search (RapidSearch2)
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [companySearchResults, setCompanySearchResults] = useState<any[]>([]);
  const [companySearching, setCompanySearching] = useState(false);

  // Detail dialog
  const [detailCompany, setDetailCompany] = useState<CompanyRow | null>(null);
  const [detailLogs, setDetailLogs] = useState<LogEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Remove dialog
  const [removeTarget, setRemoveTarget] = useState<CompanyRow | null>(null);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ company_name: "", notes: "", lw_group_id: "" });
  const [editTarget, setEditTarget] = useState<CompanyRow | null>(null);

  // LW groups for linking
  const [lwGroups, setLwGroups] = useState<LwGroup[]>([]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortHeader = ({ field, children, className = "" }: { field: typeof sortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={`sortable-header ${className}`} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUp className={`w-3.5 h-3.5 sort-icon ${sortField === field ? "active" : ""} ${sortField === field && sortDir === "desc" ? "desc" : ""}`} />
      </span>
    </TableHead>
  );

  // ── Data fetching ──
  useEffect(() => {
    fetchCompanies();
    fetchLwGroups();
  }, []);

  const fetchLwGroups = async () => {
    try {
      const { data } = await supabase.from("lw_groups").select("lw_group_id, title").order("title");
      setLwGroups(data || []);
    } catch (e) {
      console.error("Error fetching LW groups:", e);
    }
  };

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_monitoring")
        .select("*")
        .eq("is_active", true)
        .order("company_name");
      if (error) throw error;
      setCompanies((data || []) as unknown as CompanyRow[]);
    } catch (e) {
      console.error("Error fetching companies:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyLogs = async (companyId: string) => {
    setDetailLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_monitoring_log")
        .select("id, company_id, employee_count, previous_count, changed, checked_at")
        .eq("company_id", companyId)
        .order("checked_at", { ascending: true });
      if (error) throw error;
      setDetailLogs(data || []);
    } catch (e) {
      console.error("Error fetching logs:", e);
      setDetailLogs([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Filtered & sorted ──
  const filteredCompanies = useMemo(() => {
    let list = companies;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.company_name.toLowerCase().includes(q) ||
          c.tax_number.includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "company_name":
          return dir * a.company_name.localeCompare(b.company_name, "hu");
        case "current_employee_count":
          return dir * ((a.current_employee_count || 0) - (b.current_employee_count || 0));
        case "last_checked_at":
          return dir * ((a.last_checked_at || "").localeCompare(b.last_checked_at || ""));
        default:
          return 0;
      }
    });
  }, [companies, searchQuery, sortField, sortDir]);

  // ── Stats ──
  const totalCompanies = companies.length;
  const companiesWithChanges = companies.filter(
    (c) => c.previous_employee_count !== null && c.current_employee_count !== c.previous_employee_count
  ).length;
  const lastCheckDate = companies.reduce((latest, c) => {
    if (!c.last_checked_at) return latest;
    return !latest || c.last_checked_at > latest ? c.last_checked_at : latest;
  }, null as string | null);

  // ── Handlers ──
  const handleAddCompany = async () => {
    if (!addForm.company_name || !addForm.tax_number) {
      toast({ title: "Hiba", description: "Cégnév és adószám megadása kötelező", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      const result = await callOptenFunction("add-company", {
        company_name: addForm.company_name,
        tax_number: addForm.tax_number,
        notes: addForm.notes || undefined,
      });
      toast({
        title: "Cég hozzáadva",
        description: `${addForm.company_name} — aktuális létszám: ${result.initial_employee_count ?? "N/A"}`,
      });
      setAddDialogOpen(false);
      setAddForm({ company_name: "", tax_number: "", notes: "" });
      void fetchCompanies();
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompanySearch = async () => {
    if (!companySearchQuery || companySearchQuery.length < 3) {
      toast({ title: "Hiba", description: "Legalább 3 karakter szükséges a kereséshez", variant: "destructive" });
      return;
    }
    setCompanySearching(true);
    setCompanySearchResults([]);
    try {
      const result = await callOptenFunction("search-company", { text: companySearchQuery });
      setCompanySearchResults(result.results || []);
      if (!result.results || result.results.length === 0) {
        toast({ title: "Nincs találat", description: `"${companySearchQuery}" keresésre nem érkezett eredmény.` });
      }
    } catch (e: any) {
      toast({ title: "Keresési hiba", description: e.message, variant: "destructive" });
    } finally {
      setCompanySearching(false);
    }
  };

  const selectSearchResult = (result: any) => {
    setAddForm({
      company_name: result.name,
      tax_number: result.tax_number,
      notes: result.address ? `${result.address.zip} ${result.address.city}, ${result.address.street}` : "",
    });
    setCompanySearchResults([]);
    setCompanySearchQuery("");
  };

  const handleCheckAll = async () => {
    setCheckAllLoading(true);
    toast({ title: "Ellenőrzés indítása...", description: "Az összes cég létszámának lekérdezése folyamatban." });
    try {
      const result = await callOptenFunction("check-all", {});
      if (result.queued) {
        toast({
          title: "🚀 Ellenőrzés elindítva",
          description: result.message || `${result.total} cég ellenőrzése a háttérben fut. Frissítsd az oldalt pár perc múlva.`,
        });
      } else {
        toast({
          title: "✅ Ellenőrzés kész",
          description: `${result.checked ?? 0} cég ellenőrizve, ${result.changed ?? 0} változás, ${result.errors ?? 0} hiba`,
        });
      }
      void fetchCompanies();

    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setCheckAllLoading(false);
    }
  };

  const handleCheckSingle = async (company: CompanyRow) => {
    setActionLoading(true);
    try {
      const result = await callOptenFunction("check-single", { company_id: company.id });
      toast({
        title: result.changed ? "Változás észlelve!" : "Nincs változás",
        description: `${company.company_name}: ${result.previous_count ?? "?"} → ${result.employee_count}`,
        variant: result.changed ? "default" : undefined,
      });
      void fetchCompanies();
      // Refresh detail if open
      if (detailCompany?.id === company.id) {
        void fetchCompanyLogs(company.id);
      }
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveCompany = async () => {
    if (!removeTarget) return;
    setActionLoading(true);
    try {
      await callOptenFunction("remove-company", { company_id: removeTarget.id });
      toast({ title: "Cég eltávolítva", description: `${removeTarget.company_name} inaktiválva.` });
      setRemoveTarget(null);
      void fetchCompanies();
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditCompany = async () => {
    if (!editTarget) return;
    setActionLoading(true);
    try {
      await callOptenFunction("update-company", {
        company_id: editTarget.id,
        company_name: editForm.company_name,
        notes: editForm.notes,
        lw_group_id: editForm.lw_group_id || null,
      });
      toast({ title: "Cég frissítve", description: `${editForm.company_name} adatai módosítva.` });
      setEditDialogOpen(false);
      void fetchCompanies();
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const openEditDialog = (company: CompanyRow) => {
    setEditTarget(company);
    setEditForm({
      company_name: company.company_name,
      notes: company.notes || "",
      lw_group_id: company.lw_group_id || "",
    });
    setEditDialogOpen(true);
  };

  const handleExportCsv = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("opten-check-employees", {
        body: { action: "export-csv" },
      });
      if (error) throw error;
      // data is the CSV string
      const blob = new Blob([data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cegfigyelés_${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV exportálva" });
    } catch (e: any) {
      toast({ title: "Export hiba", description: e.message, variant: "destructive" });
    }
  };

  const openDetail = (company: CompanyRow) => {
    setDetailCompany(company);
    void fetchCompanyLogs(company.id);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric" });
  };

  const getChangeBadge = (company: CompanyRow) => {
    if (company.previous_employee_count === null || company.current_employee_count === null) {
      return null;
    }
    const diff = company.current_employee_count - company.previous_employee_count;
    if (diff === 0) return null;
    if (diff > 0) {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs gap-1">
          <TrendingUp className="w-3 h-3" />+{diff}
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs gap-1">
        <TrendingDown className="w-3 h-3" />{diff}
      </Badge>
    );
  };

  // ── Chart data ──
  const chartData = detailLogs.map((log) => ({
    date: new Date(log.checked_at).toLocaleDateString("hu-HU", { month: "short", day: "numeric", year: "2-digit" }),
    létszám: log.employee_count,
  }));

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--card-foreground))",
  };

  // ── Access check ──
  if (!isAdmin) {
    return (
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-destructive/50" />
          <h2 className="text-xl font-bold mb-2">Hozzáférés megtagadva</h2>
          <p className="text-muted-foreground">
            Ez az oldal csak adminisztrátorok számára érhető el.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight gradient-text">Cégfigyelés</h2>
            <p className="text-muted-foreground">
              OPTEN alkalmazotti létszám monitorozás
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportCsv}
              disabled={companies.length === 0}
              title="CSV export"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckAll}
              disabled={checkAllLoading || companies.length === 0}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${checkAllLoading ? "animate-spin" : ""}`} />
              {checkAllLoading ? "Ellenőrzés..." : "Mind ellenőrzés"}
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Új cég
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          <Card className="kpi-card animate-fade-up stagger-1">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold"><AnimatedCounter value={totalCompanies} /></p>
                  <p className="text-xs text-muted-foreground">Monitorozott cég</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="kpi-card animate-fade-up stagger-2">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold"><AnimatedCounter value={companiesWithChanges} /></p>
                  <p className="text-xs text-muted-foreground">Változás észlelve</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="kpi-card animate-fade-up stagger-3 col-span-2 lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{lastCheckDate ? formatDate(lastCheckDate) : "—"}</p>
                  <p className="text-xs text-muted-foreground">Utolsó ellenőrzés</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Keresés cégnév vagy adószám alapján..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg flex-shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  <AnimatedCounter value={filteredCompanies.length} /> cég
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monitorozott cégek</CardTitle>
            <CardDescription>
              Kattints egy cégre a részletes létszámtörténet megtekintéséhez
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <SkeletonTable rows={5} columns={5} />
            ) : filteredCompanies.length === 0 ? (
              <EmptyState
                icon={<Building2 className="w-7 h-7 opacity-60" />}
                title={companies.length === 0 ? "Nincs még monitorozott cég" : "Nincs találat"}
                description={companies.length === 0 ? 'Add hozzá az első céget az "Új cég" gombbal.' : "Próbáld módosítani a keresési feltételeket."}
              />
            ) : (
              <div className="rounded-lg border overflow-hidden max-h-[60vh] overflow-y-auto custom-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader field="company_name">Cég neve</SortHeader>
                      <TableHead className="hidden sm:table-cell">Adószám</TableHead>
                      <SortHeader field="current_employee_count">Létszám</SortHeader>
                      <TableHead className="hidden md:table-cell">Változás</TableHead>
                      <SortHeader field="last_checked_at" className="hidden lg:table-cell">Utolsó ellenőrzés</SortHeader>
                      <TableHead className="text-right">Műveletek</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company, idx) => (
                      <TableRow
                        key={company.id}
                        className="group table-row-interactive animate-fade-up cursor-pointer"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                        onClick={() => openDetail(company)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{company.company_name}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">{company.tax_number}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm font-mono text-muted-foreground">{company.tax_number}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="font-semibold text-sm">
                              {company.current_employee_count ?? "—"}
                            </span>
                            {company.previous_employee_count !== null &&
                              company.current_employee_count !== null &&
                              company.previous_employee_count !== company.current_employee_count && (
                                <span className="text-xs text-muted-foreground">
                                  (előző: {company.previous_employee_count})
                                </span>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {getChangeBadge(company) || (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Minus className="w-3 h-3" /> Nincs
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {formatDate(company.last_checked_at)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDetail(company)}
                              title="Részletek"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCheckSingle(company)}
                              disabled={actionLoading}
                              title="Ellenőrzés most"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(company)}
                              title="Szerkesztés"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setRemoveTarget(company)}
                              title="Eltávolítás"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
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

      {/* ── Add Company Dialog ── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Új cég hozzáadása</DialogTitle>
            <DialogDescription>
              A cég hozzáadása után azonnal lekérdezzük az aktuális létszámot az OPTEN-ből.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Company name search via RapidSearch2 */}
            <div className="space-y-2">
              <Label>Keresés cégnév alapján (OPTEN)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Pl. Diego Kft."
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCompanySearch()}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCompanySearch}
                  disabled={companySearching || companySearchQuery.length < 3}
                >
                  {companySearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {companySearchResults.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto border rounded-md divide-y">
                  {companySearchResults.map((r: any, i: number) => (
                    <div
                      key={i}
                      className="px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => selectSearchResult(r)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{r.name}</span>
                        <span className="text-xs font-mono text-muted-foreground">{r.tax_number}</span>
                      </div>
                      {r.address && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.address.zip} {r.address.city}, {r.address.street}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">vagy kézi megadás</span></div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-name">Cég neve *</Label>
              <Input
                id="add-name"
                placeholder="Példa Kft."
                value={addForm.company_name}
                onChange={(e) => setAddForm({ ...addForm, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-tax">Adószám (első 8 jegy) *</Label>
              <Input
                id="add-tax"
                placeholder="12345678"
                maxLength={8}
                value={addForm.tax_number}
                onChange={(e) => setAddForm({ ...addForm, tax_number: e.target.value.replace(/\D/g, "").substring(0, 8) })}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Az adószám első 8 számjegye szükséges az OPTEN lekérdezéshez.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-notes">Megjegyzés</Label>
              <Textarea
                id="add-notes"
                placeholder="Opcionális megjegyzés..."
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Mégsem
            </Button>
            <Button onClick={handleAddCompany} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Hozzáadás és ellenőrzés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailCompany} onOpenChange={(open) => { if (!open) setDetailCompany(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {detailCompany?.company_name}
            </DialogTitle>
            <DialogDescription>
              Adószám: {detailCompany?.tax_number} · Létszámtörténet
            </DialogDescription>
          </DialogHeader>

          {/* Current stats */}
          {detailCompany && (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/40 border">
                <p className="text-2xl font-bold">{detailCompany.current_employee_count ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Aktuális létszám</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/40 border">
                <p className="text-2xl font-bold">{detailCompany.previous_employee_count ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Előző létszám</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/40 border">
                {detailCompany.previous_employee_count !== null && detailCompany.current_employee_count !== null ? (
                  <>
                    <p className={`text-2xl font-bold ${
                      detailCompany.current_employee_count > detailCompany.previous_employee_count
                        ? "text-green-600"
                        : detailCompany.current_employee_count < detailCompany.previous_employee_count
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}>
                      {detailCompany.current_employee_count - detailCompany.previous_employee_count > 0 ? "+" : ""}
                      {detailCompany.current_employee_count - detailCompany.previous_employee_count}
                    </p>
                    <p className="text-xs text-muted-foreground">Változás</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-muted-foreground">—</p>
                    <p className="text-xs text-muted-foreground">Változás</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Chart */}
          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length > 1 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Létszám alakulás</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="létszám"
                    stroke="hsl(200, 70%, 50%)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "hsl(200, 70%, 50%)" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : chartData.length === 1 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Még csak 1 mérési pont van. A grafikon a 2. ellenőrzés után jelenik meg.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Még nincs történeti adat.
            </p>
          )}

          {/* Log entries */}
          {detailLogs.length > 0 && (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scroll">
              <p className="text-xs font-medium text-muted-foreground">Ellenőrzési napló</p>
              {[...detailLogs].reverse().map((log) => (
                <div
                  key={log.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-lg text-xs ${
                    log.changed ? "bg-amber-500/5 border border-amber-500/15" : "bg-muted/30 border"
                  }`}
                >
                  <span className="text-muted-foreground">
                    {new Date(log.checked_at).toLocaleString("hu-HU", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="font-medium">
                    {log.previous_count !== null ? `${log.previous_count} → ` : ""}
                    {log.employee_count} fő
                  </span>
                  {log.changed && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5">
                      Változás
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Extra OPTEN data */}
          {detailCompany && (detailCompany.company_form || detailCompany.company_status || detailCompany.main_activity) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {detailCompany.company_form && (
                <div className="p-2 rounded-lg bg-muted/30 border">
                  <p className="text-muted-foreground">Cégforma</p>
                  <p className="font-medium">{detailCompany.company_form}</p>
                </div>
              )}
              {detailCompany.company_status && (
                <div className="p-2 rounded-lg bg-muted/30 border">
                  <p className="text-muted-foreground">Státusz</p>
                  <p className="font-medium">{detailCompany.company_status}</p>
                </div>
              )}
              {detailCompany.main_activity && (
                <div className="p-2 rounded-lg bg-muted/30 border">
                  <p className="text-muted-foreground">Főtevékenység</p>
                  <p className="font-medium">{detailCompany.main_activity}</p>
                </div>
              )}
              {detailCompany.foundation_date && (
                <div className="p-2 rounded-lg bg-muted/30 border">
                  <p className="text-muted-foreground">Alapítás</p>
                  <p className="font-medium">{detailCompany.foundation_date}</p>
                </div>
              )}
            </div>
          )}

          {/* LW Group link */}
          {detailCompany?.lw_group_id && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10 text-xs">
              <Link2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">LearnWorlds csoport:</span>
              <span className="font-medium text-primary">
                {lwGroups.find(g => g.lw_group_id === detailCompany.lw_group_id)?.title || detailCompany.lw_group_id}
              </span>
            </div>
          )}

          {/* Notes */}
          {detailCompany?.notes && (
            <div className="p-3 rounded-lg bg-muted/30 border text-sm text-muted-foreground">
              <p className="text-xs font-medium text-foreground mb-1">Megjegyzés</p>
              {detailCompany.notes}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => detailCompany && handleCheckSingle(detailCompany)}
              disabled={actionLoading}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${actionLoading ? "animate-spin" : ""}`} />
              Ellenőrzés most
            </Button>
            <Button variant="outline" onClick={() => setDetailCompany(null)}>
              Bezárás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Confirmation ── */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cég eltávolítása</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan inaktiválod a(z) <strong>{removeTarget?.company_name}</strong> ({removeTarget?.tax_number}) monitorozását?
              Az eddigi adatok megmaradnak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégsem</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveCompany} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eltávolítás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Company Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cég szerkesztése</DialogTitle>
            <DialogDescription>
              Módosítsd a cég adatait és a LearnWorlds csoport összekapcsolást.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Cég neve</Label>
              <Input
                id="edit-name"
                value={editForm.company_name}
                onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group">LearnWorlds csoport</Label>
              <Select
                value={editForm.lw_group_id || "none"}
                onValueChange={(v) => setEditForm({ ...editForm, lw_group_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Válassz csoportot..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nincs összekapcsolva</SelectItem>
                  {lwGroups.map((g) => (
                    <SelectItem key={g.lw_group_id} value={g.lw_group_id}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A LearnWorlds csoporttal összekapcsolt cég létszámváltozása később automatikusan módosíthatja a székkorlátot.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Megjegyzés</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Mégsem
            </Button>
            <Button onClick={handleEditCompany} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mentés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default CompanyMonitoring;
