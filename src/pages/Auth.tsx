import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

const emailSchema = z.string().trim().email({ message: "Érvénytelen email cím" }).max(255);
const passwordSchema = z.string().min(6, { message: "A jelszónak legalább 6 karakter hosszúnak kell lennie" }).max(72);

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        // Try automatic linking on signup
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setTimeout(async () => {
            try {
              await supabase.functions.invoke('auto-link-on-signup', {
                body: {}
              });
            } catch (error) {
              console.log("Auto-link not possible:", error);
            }
          }, 0);
        }
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateEmail = async (email: string): Promise<boolean> => {
    try {
      emailSchema.parse(email);
    } catch (error) {
      if (error instanceof z.ZodError) {
        setError(error.errors[0].message);
        return false;
      }
    }

    // For signup, check if email exists in LearnWorlds
    if (mode === 'signup') {
      try {
        const { data, error: funcError } = await supabase.functions.invoke('verify-learnworlds-email', {
          body: { email }
        });

        if (funcError) {
          console.error('Error verifying email:', funcError);
          setError("Nem sikerült ellenőrizni az email címet");
          return false;
        }

        if (!data.exists) {
          setError(
            "Ez az email cím nem található a LearnWorlds rendszerben. Csak regisztrált LearnWorlds felhasználók hozhatnak létre fiókot."
          );
          return false;
        }
      } catch (error) {
        console.error('Error in email verification:', error);
        setError("Hiba történt az ellenőrzés során");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate email
      const emailValid = await validateEmail(email);
      if (!emailValid) {
        setLoading(false);
        return;
      }

      // Validate password
      try {
        passwordSchema.parse(password);
      } catch (error) {
        if (error instanceof z.ZodError) {
          setError(error.errors[0].message);
          setLoading(false);
          return;
        }
      }

      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          if (signInError.message.includes('Invalid login credentials')) {
            setError('Helytelen email vagy jelszó');
          } else {
            setError(signInError.message);
          }
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (signUpError) {
          if (signUpError.message.includes('already registered')) {
            setError('Ez az email cím már regisztrálva van');
          } else {
            setError(signUpError.message);
          }
        } else {
          toast.success('Sikeres regisztráció! Jelentkezz be.');
          setMode('signin');
          setPassword('');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Hiba történt a művelet során');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">
            {mode === 'signin' ? 'Bejelentkezés' : 'Regisztráció'}
          </CardTitle>
          <CardDescription>
            {mode === 'signin' 
              ? 'Jelentkezz be a ranglista megtekintéséhez'
              : 'Hozz létre fiókot (csak LearnWorlds felhasználóknak)'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email cím</Label>
              <Input
                id="email"
                type="email"
                placeholder="pelda@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Jelszó</Label>
              <Input
                id="password"
                type="password"
                placeholder="Jelszavad"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                maxLength={72}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'signin' ? 'Bejelentkezés...' : 'Regisztráció...'}
                </>
              ) : (
                mode === 'signin' ? 'Bejelentkezés' : 'Regisztráció'
              )}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                  setPassword('');
                }}
                disabled={loading}
              >
                {mode === 'signin' 
                  ? 'Nincs még fiókod? Regisztrálj!' 
                  : 'Van már fiókod? Jelentkezz be!'
                }
              </Button>
            </div>

            {mode === 'signup' && (
              <div className="text-sm text-muted-foreground text-center pt-2 border-t">
                <p>Megjegyzés: Csak LearnWorlds rendszerben regisztrált email címekkel lehet fiókot létrehozni.</p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
