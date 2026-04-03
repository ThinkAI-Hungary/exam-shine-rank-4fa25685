import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BadgeDisplay from "@/components/BadgeDisplay";
import { Trophy } from "lucide-react";

const EmbedBadges = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email");
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setError("Nincs megadva email cím.");
      setLoading(false);
      return;
    }
    fetchBadges(email);
  }, [email]);

  const fetchBadges = async (userEmail: string) => {
    try {
      // Find user by email in the users table
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("user_id, username")
        .eq("email", userEmail)
        .maybeSingle();

      if (userError) throw userError;

      if (!userData) {
        setError("Felhasználó nem található.");
        setLoading(false);
        return;
      }

      setUsername(userData.username);

      // Fetch badges for this user
      const { data: badgeData, error: badgeError } = await supabase
        .from("user_badges")
        .select(`
          id,
          awarded_at,
          expires_at,
          revoked_at,
          badge_definitions (
            badge_name,
            badge_type,
            badge_level,
            description,
            icon_name,
            color
          )
        `)
        .eq("user_id", userData.user_id);

      if (badgeError) throw badgeError;

      setBadges(badgeData || []);
    } catch (err) {
      console.error("Error fetching badges:", err);
      setError("Hiba történt a jelvények betöltésekor.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Jelvények betöltése...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        {username && (
          <div className="mb-4 text-center">
            <h2 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {username} jelvényei
            </h2>
          </div>
        )}
        <BadgeDisplay badges={badges} />
      </div>
    </div>
  );
};

export default EmbedBadges;
