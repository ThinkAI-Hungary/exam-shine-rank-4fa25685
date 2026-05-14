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
  const [search, setSearch] = useState("");
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
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [groups, search]);

  // Get members for a group
  const getGroupMembers = (groupId: string) =>
    members.filter((m) => m.lw_group_id === groupId);

  if (loading) {
    return (
      <div className="space-y-6 page-enter">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Csoportok</h1>
          <p className="text-muted-foreground">LearnWorlds csoportok és tagjaik kezelése</p>
        </div>
        <SkeletonTable rows={6} columns={4} />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-6 page-enter">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Csoportok</h1>
          <p className="text-muted-foreground">LearnWorlds csoportok és tagjaik kezelése</p>
        </div>
        <EmptyState
          icon={<UsersRound className="w-12 h-12 text-muted-foreground/50" />}
          title="Nincsenek csoportok"
          description="A LearnWorlds-ben még nincsenek csoportok létrehozva, vagy a legutóbbi szinkronizálás nem tartalmazta őket."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Csoportok</h1>
          <p className="text-muted-foreground">LearnWorlds csoportok és tagjaik kezelése</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          <UsersRound className="w-3.5 h-3.5 mr-1.5" />
          <AnimatedCounter value={groups.length} /> csoport
        </Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Keresés csoport neve alapján..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UsersRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter value={groups.length} /></p>
                <p className="text-xs text-muted-foreground">Csoportok</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold"><AnimatedCounter value={members.length} /></p>
                <p className="text-xs text-muted-foreground">Tagságok</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <Crown className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  <AnimatedCounter value={members.filter((m) => m.role === "manager").length} />
                </p>
                <p className="text-xs text-muted-foreground">Csoportvezetők</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  <AnimatedCounter
                    value={new Set(groups.flatMap((g) => g.product_ids || [])).size}
                  />
                </p>
                <p className="text-xs text-muted-foreground">Kapcsolt kurzusok</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Group Cards */}
      <div className="space-y-3">
        {filteredGroups.map((group) => {
          const groupMembers = getGroupMembers(group.lw_group_id);
          const isExpanded = expandedGroup === group.lw_group_id;
          const managers = groupMembers.filter((m) => m.role === "manager");
          const regularMembers = groupMembers.filter((m) => m.role !== "manager");

          return (
            <Card key={group.lw_group_id} className="overflow-hidden transition-all hover:shadow-md">
              <div
                className="cursor-pointer"
                onClick={() => setExpandedGroup(isExpanded ? null : group.lw_group_id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <UsersRound className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{group.title}</CardTitle>
                        {group.description && (
                          <CardDescription className="text-xs mt-0.5">
                            {group.description.substring(0, 80)}{group.description.length > 80 ? "..." : ""}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                </CardHeader>
              </div>

              {isExpanded && (
                <CardContent className="pt-0 border-t">
                  {groupMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Nincsenek tagok ebben a csoportban
                    </p>
                  ) : (
                    <div className="space-y-4 pt-3">
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
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Groups;
