import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/hooks/use-toast";
import {
  UserCog,
  UserPlus,
  Search,
  Loader2,
  Users,
  AlertCircle,
  Pencil,
  Ban,
  CheckCircle2,
  ChevronRight,
  Mail,
  Calendar,
  X,
  Plus,
  RefreshCw,
} from "lucide-react";

// ── Types ──
interface UserRow {
  user_id: string;
  username: string;
  email: string | null;
  aruhaz: string[] | null;
  beosztas: string[] | null;
  start_of_empl: string | null;
  current_category: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface UserFormData {
  email: string;
  username: string;
  password: string;
  tags: string[];
  uj_kollega: string;
  munkaviszony_kezdete: string;
}

// ── Edge Function caller ──
async function callManageUser(action: string, payload: Record<string, unknown>) {
  console.log("[callManageUser]", action, payload);
  const { data, error } = await supabase.functions.invoke("manage-user", {
    body: { action, ...payload },
  });
  // When edge fn returns non-2xx, error is generic but data may have details
  if (data && !data.success) {
    throw new Error(data.error || "Ismeretlen hiba az Edge Function-ben");
  }
  if (error) {
    // Try to parse error context from the response
    const msg = data?.error || error.message || "Edge function hiba";
    throw new Error(msg);
  }
  return data;
}

// ── Component ──
const UserManagement = () => {
  const { isAdmin } = useOutletContext<{ user: any; isAdmin: boolean }>();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAruhaz, setSelectedAruhaz] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  // Form state
  const [form, setForm] = useState<UserFormData>({ email: "", username: "", password: "", tags: [], uj_kollega: "", munkaviszony_kezdete: "" });
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  // ── Data fetching ──
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("username", { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (e) {
      console.error("Error fetching users:", e);
    } finally {
      setLoading(false);
    }
  };

  // ── Available áruház tags (for filter) ──
  const availableAruhaz = useMemo(() => {
    const tags = new Set<string>();
    users.forEach((u) => (u.aruhaz || []).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [users]);

  // ── Grouped tags from existing users (for tag picker) ──
  const aruhazTags = useMemo(() => {
    const tags = new Set<string>();
    users.forEach((u) => (u.aruhaz || []).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [users]);

  const beosztasTags = useMemo(() => {
    const tags = new Set<string>();
    users.forEach((u) => (u.beosztas || []).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [users]);

  // ── Filtered list ──
  const filteredUsers = useMemo(() => {
    let list = users;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q))
      );
    }
    if (selectedAruhaz) {
      list = list.filter((u) => u.aruhaz && u.aruhaz.includes(selectedAruhaz));
    }
    return list;
  }, [users, searchQuery, selectedAruhaz]);

  // Build LW custom fields from tags + form values
  const buildFieldsFromTags = (tags: string[], ujKollega?: string, munkaviszony?: string) => {
    const fields: Record<string, string> = {};
    const allTags = [...tags];

    // Extract cf_aruhaz_X → fields.cf_aruhaz = X (use last one if multiple)
    const aruhazTag = tags.filter((t) => t.startsWith("cf_aruhaz_")).pop();
    if (aruhazTag) fields.cf_aruhaz = aruhazTag.replace(/^cf_aruhaz_/, "");

    // Extract cf_munkakorod_X (or cf_munkakorodX) → fields.cf_munkakorod = X
    const munkakorTag = tags.filter((t) => t.startsWith("cf_munkakorod")).pop();
    if (munkakorTag) fields.cf_munkakorod = munkakorTag.replace(/^cf_munkakorod_?/, "");

    if (ujKollega) {
      const cap = ujKollega.charAt(0).toUpperCase() + ujKollega.slice(1).toLowerCase();
      fields.cf_ujkollegavagy = cap;
      const ujTag = `cf_ujkollegavagy_${cap}`;
      if (!allTags.includes(ujTag)) allTags.push(ujTag);
    }

    if (munkaviszony) fields.cf_munkaviszonyod_kezdete = munkaviszony;

    return { fields, tags: allTags };
  };

  // ── Handlers ──
  const handleCreate = async () => {
    if (!form.email) {
      toast({ title: "Hiba", description: "Email megadása kötelező", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      const { fields, tags } = buildFieldsFromTags(form.tags, form.uj_kollega, form.munkaviszony_kezdete);

      await callManageUser("create", {
        email: form.email,
        username: form.username || undefined,
        password: form.password || undefined,
        tags: tags.length > 0 ? tags : undefined,
        fields: Object.keys(fields).length > 0 ? fields : undefined,
      });
      toast({ title: "Siker", description: `Felhasználó létrehozva: ${form.email}` });
      setCreateDialogOpen(false);
      setForm({ email: "", username: "", password: "", tags: [], uj_kollega: "", munkaviszony_kezdete: "" });
      await fetchUsers();
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const openEditDialog = (user: UserRow) => {
    setSelectedUser(user);
    // Merge aruhaz + beosztas tags for editing
    const allTags = [...(user.aruhaz || []), ...(user.beosztas || [])];
    setEditTags(allTags);
    setEditDialogOpen(true);
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await callManageUser("update", {
        user_id: selectedUser.user_id,
        username: selectedUser.username,
        email: selectedUser.email,
        tags: editTags,
      });
      toast({ title: "Siker", description: `${selectedUser.username} frissítve` });
      setEditDialogOpen(false);
      setSelectedUser(null);
      await fetchUsers();
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await callManageUser("suspend", {
        user_id: selectedUser.user_id,
        is_suspended: true,
      });
      toast({ title: "Felfüggesztve", description: `${selectedUser.username} felfüggesztve` });
      setSuspendDialogOpen(false);
      setSelectedUser(null);
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const addTag = (tag: string, target: "form" | "edit") => {
    if (!tag.trim()) return;
    if (target === "form") {
      if (!form.tags.includes(tag)) setForm({ ...form, tags: [...form.tags, tag] });
    } else {
      if (!editTags.includes(tag)) setEditTags([...editTags, tag]);
    }
    setNewTag("");
  };

  const removeTag = (tag: string, target: "form" | "edit") => {
    if (target === "form") {
      setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });
    } else {
      setEditTags(editTags.filter((t) => t !== tag));
    }
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

  // ── Render ──
  return (
    <main className="container mx-auto px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Felhasználókezelés</h2>
            <p className="text-muted-foreground">
              LearnWorlds felhasználók létrehozása, szerkesztése és kezelése
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Frissítés
            </Button>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Új felhasználó
            </Button>
          </div>
        </div>

        {/* Search & Filter */}
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
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg flex-shrink-0">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  {filteredUsers.length} felhasználó
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Felhasználók</CardTitle>
            <CardDescription>
              Kattints a szerkesztés vagy felfüggesztés gombra a műveletek elvégzéséhez
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nem található felhasználó</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Felhasználó</TableHead>
                      <TableHead className="hidden sm:table-cell">Email</TableHead>
                      <TableHead className="hidden md:table-cell">Áruház</TableHead>
                      <TableHead className="hidden lg:table-cell">Beosztás</TableHead>
                      <TableHead className="hidden lg:table-cell">Kategória</TableHead>
                      <TableHead className="text-right">Műveletek</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.user_id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-primary">
                                {user.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{user.username}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">
                                {user.email || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="w-3.5 h-3.5" />
                            {user.email || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(user.aruhaz || []).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag.replace(/^cf_aruhaz_/, "")}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(user.beosztas || []).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag.replace(/^cf_munkakorod_?/, "")}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {user.current_category ? (
                            <Badge
                              className={
                                user.current_category === "gold"
                                  ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                                  : user.current_category === "silver"
                                  ? "bg-gray-400/10 text-gray-500 border-gray-400/20"
                                  : user.current_category === "bronze"
                                  ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                                  : "bg-muted text-muted-foreground"
                              }
                            >
                              {user.current_category}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(user)}
                              title="Szerkesztés"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setSelectedUser(user);
                                setSuspendDialogOpen(true);
                              }}
                              title="Felfüggesztés"
                            >
                              <Ban className="w-3.5 h-3.5" />
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

      {/* ── Create User Dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Új felhasználó létrehozása</DialogTitle>
            <DialogDescription>
              A felhasználó közvetlenül a LearnWorlds-ben jön létre
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-username">Felhasználónév</Label>
              <Input
                id="create-username"
                placeholder="Teljes név"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Jelszó</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="Minimum 6 karakter"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-uj-kollega">Új kolléga vagy?</Label>
                <Select
                  value={form.uj_kollega || ""}
                  onValueChange={(v) => setForm({ ...form, uj_kollega: v })}
                >
                  <SelectTrigger id="create-uj-kollega">
                    <SelectValue placeholder="Válassz..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="igen">Igen</SelectItem>
                    <SelectItem value="nem">Nem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-munkaviszony">Munkaviszony kezdete</Label>
                <Input
                  id="create-munkaviszony"
                  type="date"
                  value={form.munkaviszony_kezdete}
                  onChange={(e) => setForm({ ...form, munkaviszony_kezdete: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Címkék (tags)</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1">
                    {tag.replace(/^cf_aruhaz_/, "").replace(/^cf_munkakorod_?/, "")}
                    <button onClick={() => removeTag(tag, "form")} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Select
                value=""
                onValueChange={(v) => addTag(v, "form")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Válassz címkét..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Áruház</div>
                  {aruhazTags
                    .filter((t) => !form.tags.includes(t))
                    .map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag.replace(/^cf_aruhaz_/, "")}
                      </SelectItem>
                    ))}
                  <div className="my-1 h-px bg-border" />
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Beosztás</div>
                  {beosztasTags
                    .filter((t) => !form.tags.includes(t))
                    .map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag.replace(/^cf_munkakorod_?/, "")}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  placeholder="Egyéni címke..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(newTag, "form");
                    }
                  }}
                  className="text-sm"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => addTag(newTag, "form")}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Mégsem
            </Button>
            <Button onClick={handleCreate} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Létrehozás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Felhasználó szerkesztése</DialogTitle>
            <DialogDescription>
              A módosítások a LearnWorlds-ben is frissülnek
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-username">Felhasználónév</Label>
                <Input
                  id="edit-username"
                  value={selectedUser.username}
                  onChange={(e) =>
                    setSelectedUser({ ...selectedUser, username: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={selectedUser.email || ""}
                  onChange={(e) =>
                    setSelectedUser({ ...selectedUser, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Címkék (áruház, beosztás, egyéb)</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs gap-1">
                      {tag.replace(/^cf_aruhaz_/, "").replace(/^cf_munkakorod_?/, "")}
                      <button onClick={() => removeTag(tag, "edit")} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Select
                  value=""
                  onValueChange={(v) => addTag(v, "edit")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Válassz címkét..." />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Áruház</div>
                    {aruhazTags
                      .filter((t) => !editTags.includes(t))
                      .map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag.replace(/^cf_aruhaz_/, "")}
                        </SelectItem>
                      ))}
                    <div className="my-1 h-px bg-border" />
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Beosztás</div>
                    {beosztasTags
                      .filter((t) => !editTags.includes(t))
                      .map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag.replace(/^cf_munkakorod_?/, "")}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input
                    placeholder="Egyéni címke..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(newTag, "edit");
                      }
                    }}
                    className="text-sm"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => addTag(newTag, "edit")}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Mégsem
            </Button>
            <Button onClick={handleEdit} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mentés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Suspend Confirmation ── */}
      <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Felhasználó felfüggesztése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan felfüggeszted <strong>{selectedUser?.username}</strong> felhasználót?
              A felfüggesztés után nem fog tudni belépni a LearnWorlds felületre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégsem</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Felfüggesztés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default UserManagement;
