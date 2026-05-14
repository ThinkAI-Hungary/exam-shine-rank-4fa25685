import { useState, useEffect, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  UsersRound,
  Crown,
  BookOpen,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";

interface GroupRow {
  lw_group_id: string;
  title: string;
  description: string | null;
  product_ids: string[] | null;
  manager_ids: string[] | null;
  tags: string[] | null;
  max_members: number | null;
}

interface GroupMemberRow {
  lw_group_id: string;
  user_id: string;
  role: string | null;
  users: {
    username: string;
    email: string | null;
    aruhaz: string[] | null;
  } | null;
}

const Groups = () => {
  const { isAdmin } = useOutletContext<{ user: any; isAdmin: boolean }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupRes, memberRes] = await Promise.all([
        supabase.from("lw_groups").select("lw_group_id, title, description, product_ids, manager_ids, tags, max_members").order("title"),
        supabase.from("lw_group_members").select("lw_group_id, user_id, role, users(username, email, aruhaz)"),
      ]);
      setGroups(groupRes.data || []);
      setMembers((memberRes.data as any) || []);
    } catch (e) {
      console.error("Error fetching groups:", e);
    } finally {
      setLoading(false);
    }
  };

  // Available tags for filter
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    groups.forEach((g) => g.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [groups]);

  // Build member count map
  const memberCountMap = useMemo(() => {
    const map = new Map<string, number>();
    members.forEach((m) => {
      map.set(m.lw_group_id, (map.get(m.lw_group_id) || 0) + 1);
    });
    return map;
  }, [members]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    let result = groups;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q)
      );
    }
    if (tagFilter) {
      result = result.filter((g) => g.tags?.includes(tagFilter));
    }
    return result;
  }, [groups, searchQuery, tagFilter]);

  // Get members for a group
  const getGroupMembers = (groupId: string) =>
    members.filter((m) => m.lw_group_id === groupId);

  // Stats
  const totalManagers = members.filter((m) => m.role === "manager").length;
  const totalProducts = new Set(groups.flatMap((g) => g.product_ids || [])).size;

  if (!isAdmin) {
    return (
      <main className="container mx-auto px-4 py-12">
        <EmptyState
          icon={<UsersRound className="w-7 h-7 opacity-60" />}
          title="Nincs jogosultság"
          description="Ez az oldal csak admin felhasználók számára elérhető."
        />
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight gradient-text">Csoportkezelés</h2>
            <p className="text-muted-foreground">
              LearnWorlds csoportok és tagjaik kezelése
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg">
              <UsersRound className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                <AnimatedCounter value={filteredGroups.length} /> csoport
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 rounded-lg">
              <Users className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">
                <AnimatedCounter value={members.length} /> tag
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg">
              <Crown className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                <AnimatedCounter value={totalManagers} /> vezető
              </span>
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Keresés csoport neve vagy leírás alapján..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {availableTags.length > 0 && (
                <Select
                  value={tagFilter || "all"}
                  onValueChange={(v) => setTagFilter(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Összes címke" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Összes címke</SelectItem>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Groups list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Csoportok</CardTitle>
            <CardDescription>
              Kattints egy csoportra a tagok megtekintéséhez
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <SkeletonTable rows={6} columns={4} />
            ) : filteredGroups.length === 0 ? (
              <EmptyState
                icon={<UsersRound className="w-7 h-7 opacity-60" />}
                title="Nincsenek csoportok"
                description={
                  groups.length === 0
                    ? "A LearnWorlds-ben még nincsenek csoportok létrehozva, vagy a szinkronizálás nem tartalmazta őket."
                    : "A keresési feltételeknek megfelelő csoportok nem találhatók."
                }
              />
            ) : (
              <div className="space-y-3">
                {filteredGroups.map((group) => {
                  const groupMembers = getGroupMembers(group.lw_group_id);
                  const isExpanded = expandedGroup === group.lw_group_id;
                  const managers = groupMembers.filter((m) => m.role === "manager");
                  const regularMembers = groupMembers.filter((m) => m.role !== "manager");

                  return (
                    <div
                      key={group.lw_group_id}
                      className={`border rounded-lg overflow-hidden transition-all ${
                        isExpanded ? "shadow-md border-primary/20" : "hover:border-border/80"
                      }`}
                    >
                      <div
                        className="cursor-pointer p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedGroup(isExpanded ? null : group.lw_group_id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                            <UsersRound className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{group.title}</p>
                            {group.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {group.description.substring(0, 100)}{group.description.length > 100 ? "..." : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {(group.product_ids || []).length > 0 && (
                            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                              <BookOpen className="w-3.5 h-3.5" />
                              {group.product_ids!.length}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Users className="w-4 h-4" />
                            <span className="font-medium">{groupMembers.length}</span>
                            {group.max_members && (
                              <span className="text-xs">/ {group.max_members}</span>
                            )}
                          </div>
                          {(group.tags || []).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs hidden sm:inline-flex">
                              {tag}
                            </Badge>
                          ))}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t px-4 pb-4 pt-3 bg-muted/10">
                          {groupMembers.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                              Nincsenek tagok ebben a csoportban
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {/* Managers */}
                              {managers.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                                    <Crown className="w-3.5 h-3.5 text-yellow-600" />
                                    Csoportvezetők ({managers.length})
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {managers.map((m) => (
                                      <div
                                        key={m.user_id}
                                        className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10 cursor-pointer hover:bg-yellow-500/10 transition-colors"
                                        onClick={() => navigate(`/performance/${m.user_id}`)}
                                      >
                                        <div className="w-7 h-7 rounded-full bg-yellow-500/15 flex items-center justify-center text-xs font-bold text-yellow-600">
                                          {m.users?.username?.charAt(0)?.toUpperCase() || "?"}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium truncate">{m.users?.username || m.user_id}</p>
                                          <p className="text-xs text-muted-foreground truncate">{m.users?.email || ""}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Regular Members */}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5" />
                                  Tagok ({regularMembers.length})
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {regularMembers.map((m) => (
                                    <div
                                      key={m.user_id}
                                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/50 cursor-pointer hover:bg-muted/60 transition-colors"
                                      onClick={() => navigate(`/performance/${m.user_id}`)}
                                    >
                                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                        {m.users?.username?.charAt(0)?.toUpperCase() || "?"}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{m.users?.username || m.user_id}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {m.users?.aruhaz?.[0]?.replace(/^cf_aruhaz_/, "") || m.users?.email || ""}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Groups;
