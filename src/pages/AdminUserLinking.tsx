import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link as LinkIcon, CheckCircle, XCircle, Menu, ArrowLeft } from "lucide-react";
import Navigation from "@/components/Navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Profile {
  id: string;
  email: string;
  learnworlds_user_id: string | null;
  learnworlds_email: string | null;
  linked_at: string | null;
  link_verified: boolean;
  link_method: string | null;
}

const AdminUserLinking = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkUserId, setLinkUserId] = useState("");

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: session.user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      toast({
        title: "Hozzáférés megtagadva",
        description: "Ehhez az oldalhoz admin jogosultság szükséges",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    await fetchProfiles();
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error: any) {
      console.error("Error fetching profiles:", error);
      toast({
        title: "Hiba",
        description: "A profilok betöltése sikertelen",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAccount = async () => {
    if (!selectedProfile) {
      toast({
        title: "Hiba",
        description: "Kérjük, válasszon ki egy felhasználót",
        variant: "destructive",
      });
      return;
    }

    if (!linkEmail && !linkUserId) {
      toast({
        title: "Hiba",
        description: "Kérjük, adjon meg egy LearnWorlds email címet vagy User ID-t",
        variant: "destructive",
      });
      return;
    }

    setLinking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/link-learnworlds-account`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: linkEmail || undefined,
            learnworlds_user_id: linkUserId || undefined,
            method: "admin",
            target_user_id: selectedProfile.id,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Linking failed");
      }

      toast({
        title: "Siker!",
        description: "Felhasználó sikeresen össze lett kapcsolva",
      });

      setSelectedProfile(null);
      setLinkEmail("");
      setLinkUserId("");
      await fetchProfiles();
    } catch (error: any) {
      console.error("Error linking account:", error);
      toast({
        title: "Hiba",
        description: error.message || "A fiók összekapcsolása sikertelen",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Vissza
            </Button>
            <h1 className="text-xl font-bold">
              <span className="hidden sm:inline">Felhasználó Összekapcsolás</span>
              <span className="sm:hidden">Összekapcsolás</span>
            </h1>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:block">
            <Navigation />
          </div>

          {/* Mobile Menu */}
          <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <DrawerTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="lg:hidden border-2 hover:bg-accent"
              >
                <Menu className="w-6 h-6" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh]">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mt-4 mb-2" />
              <DrawerHeader className="pb-4">
                <DrawerTitle className="text-xl">Menü</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-6 px-6 pb-8 overflow-y-auto">
                <Navigation />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 space-y-6">

        {selectedProfile && (
          <Card>
            <CardHeader>
              <CardTitle>Felhasználó Összekapcsolása</CardTitle>
              <CardDescription>
                {selectedProfile.email} összekapcsolása LearnWorlds fiókkal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link-email">LearnWorlds Email Cím</Label>
                <Input
                  id="link-email"
                  type="email"
                  placeholder="pelda@email.com"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                />
              </div>
              <div className="text-center text-sm text-muted-foreground">VAGY</div>
              <div className="space-y-2">
                <Label htmlFor="link-userid">LearnWorlds User ID</Label>
                <Input
                  id="link-userid"
                  type="text"
                  placeholder="LW_USER_ID"
                  value={linkUserId}
                  onChange={(e) => setLinkUserId(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleLinkAccount}
                  disabled={linking}
                  className="flex-1"
                >
                  {linking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Összekapcsolás...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Összekapcsolás
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedProfile(null);
                    setLinkEmail("");
                    setLinkUserId("");
                  }}
                >
                  Mégse
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Összes Felhasználó</CardTitle>
            <CardDescription>
              Felhasználók és LearnWorlds összekapcsolási állapotuk
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Állapot</TableHead>
                  <TableHead>LearnWorlds Email</TableHead>
                  <TableHead>Módszer</TableHead>
                  <TableHead>Műveletek</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.email}</TableCell>
                    <TableCell>
                      {profile.link_verified ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-sm">Kapcsolva</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-orange-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm">Nincs kapcsolva</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {profile.learnworlds_email || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {profile.link_method === 'auto' ? 'Automatikus' :
                       profile.link_method === 'self' ? 'Saját' :
                       profile.link_method === 'admin' ? 'Admin' : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={profile.link_verified ? "outline" : "default"}
                        onClick={() => {
                          setSelectedProfile(profile);
                          setLinkEmail(profile.email);
                        }}
                      >
                        {profile.link_verified ? "Újrakapcsolás" : "Összekapcsolás"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUserLinking;
