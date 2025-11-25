import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link as LinkIcon, CheckCircle, XCircle } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  learnworlds_user_id: string | null;
  learnworlds_email: string | null;
  linked_at: string | null;
  link_verified: boolean;
  link_method: string | null;
}

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [linkEmail, setLinkEmail] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    await fetchProfile();
  };

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      setLinkEmail(data.email);
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      toast({
        title: "Hiba",
        description: "A profil betöltése sikertelen",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAccount = async () => {
    if (!linkEmail) {
      toast({
        title: "Hiba",
        description: "Kérjük, adja meg az email címet",
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
            email: linkEmail,
            method: "self",
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Linking failed");
      }

      toast({
        title: "Siker!",
        description: "Fiókja sikeresen össze lett kapcsolva a LearnWorlds fiókkal",
      });

      await fetchProfile();
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Profilom</h1>
          <Button variant="outline" onClick={handleSignOut}>
            Kijelentkezés
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fiók Információk</CardTitle>
            <CardDescription>
              Az Ön SupabaseAuth fiókjának adatai
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={profile?.email || ""} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LearnWorlds Összekapcsolás</CardTitle>
            <CardDescription>
              Kapcsolja össze fiókját a LearnWorlds rendszerrel a teljes funkcionalitáshoz
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile?.link_verified ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Fiók összekapcsolva</span>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>LearnWorlds User ID: {profile.learnworlds_user_id}</p>
                  <p>LearnWorlds Email: {profile.learnworlds_email}</p>
                  <p>Összekapcsolás módja: {profile.link_method === 'auto' ? 'Automatikus' : profile.link_method === 'self' ? 'Saját' : 'Admin'}</p>
                  <p>Összekapcsolva: {new Date(profile.linked_at!).toLocaleString('hu-HU')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-orange-600">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Fiók nincs összekapcsolva</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Adja meg a LearnWorlds fiókjához tartozó email címet az összekapcsoláshoz
                </p>
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
                <Button
                  onClick={handleLinkAccount}
                  disabled={linking}
                  className="w-full"
                >
                  {linking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Összekapcsolás...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Fiók Összekapcsolása
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Button variant="outline" onClick={() => navigate("/")}>
          Vissza a főoldalra
        </Button>
      </div>
    </div>
  );
};

export default Profile;
