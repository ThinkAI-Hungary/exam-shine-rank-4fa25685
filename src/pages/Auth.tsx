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
  
  // Check for recovery mode immediately - check both search params and hash
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const isRecovery = searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
  
  console.log('Component mount - URL:', window.location.href);
  console.log('Search params:', window.location.search);
  console.log('Hash:', window.location.hash);
  console.log('Is recovery mode:', isRecovery);
  
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'update-password'>(
    isRecovery ? 'update-password' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecoverySession, setIsRecoverySession] = useState(isRecovery);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('=== Auth State Change ===');
      console.log('Event:', event);
      console.log('Has session:', !!session);
      console.log('Current URL:', window.location.href);
      console.log('isRecoverySession state:', isRecoverySession);
      
      // Handle password recovery event - this means user clicked recovery link
      if (event === 'PASSWORD_RECOVERY') {
        console.log('PASSWORD_RECOVERY event - setting recovery mode');
        setIsRecoverySession(true);
        setMode('update-password');
        return;
      }
      
      // If we're in a recovery session, don't navigate away
      if (isRecoverySession) {
        console.log('In recovery session - staying on auth page');
        return;
      }
      
      // Check URL one more time
      const currentSearchParams = new URLSearchParams(window.location.search);
      const currentHashParams = new URLSearchParams(window.location.hash.substring(1));
      const isCurrentlyRecovery = currentSearchParams.get('type') === 'recovery' || currentHashParams.get('type') === 'recovery';
      
      if (isCurrentlyRecovery) {
        console.log('Recovery detected in URL - staying on auth page');
        setIsRecoverySession(true);
        setMode('update-password');
        return;
      }
      
      // Only navigate away if we have a session AND not in recovery
      if (session) {
        console.log('Session exists and not recovery - navigating home');
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
  }, [navigate, isRecoverySession]);

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
      if (mode === 'update-password') {
        // Update password mode - validate passwords match
        try {
          passwordSchema.parse(password);
        } catch (error) {
          if (error instanceof z.ZodError) {
            setError(error.errors[0].message);
            setLoading(false);
            return;
          }
        }

        if (password !== confirmPassword) {
          setError('A jelszavak nem egyeznek');
          setLoading(false);
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        });

        if (updateError) {
          setError('Hiba történt a jelszó frissítése során');
        } else {
          toast.success('Jelszó sikeresen frissítve! Átirányítás...');
          setPassword('');
          setConfirmPassword('');
          setIsRecoverySession(false); // Clear recovery flag
          // Sign out and redirect to login after password update
          await supabase.auth.signOut();
          setTimeout(() => {
            navigate('/auth');
            setMode('signin');
          }, 1000);
        }
        setLoading(false);
        return;
      }

      // Validate email
      const emailValid = await validateEmail(email);
      if (!emailValid) {
        setLoading(false);
        return;
      }

      if (mode === 'reset') {
        // Password reset mode - only needs email
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });

        if (resetError) {
          setError('Hiba történt a jelszó visszaállítás során');
        } else {
          toast.success('Jelszó visszaállító email elküldve! Ellenőrizd a postaládád.');
          setMode('signin');
          setEmail('');
        }
        setLoading(false);
        return;
      }

      // Validate password for signin/signup
      try {
        passwordSchema.parse(password);
      } catch (error) {
        if (error instanceof z.ZodError) {
          setError(error.errors[0].message);
          setLoading(false);
          return;
        }
      }

      // Check password confirmation for signup
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('A jelszavak nem egyeznek');
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
          } else if (signInError.message.includes('Email not confirmed')) {
            setError('Erősítsd meg az email címedet a bejelentkezés előtt');
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
          toast.success('Sikeres regisztráció! Ellenőrizd az emailedet a megerősítéshez.');
          setMode('signin');
          setPassword('');
          setConfirmPassword('');
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
            {mode === 'signin' ? 'Bejelentkezés' : mode === 'signup' ? 'Regisztráció' : mode === 'update-password' ? 'Új jelszó beállítása' : 'Jelszó visszaállítás'}
          </CardTitle>
          <CardDescription>
            {mode === 'signin' 
              ? 'Jelentkezz be a ranglista megtekintéséhez'
              : mode === 'signup'
              ? 'Hozz létre fiókot (csak LearnWorlds felhasználóknak)'
              : mode === 'update-password'
              ? 'Add meg az új jelszavadat'
              : 'Add meg az email címedet a jelszó visszaállításához'
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

            {mode !== 'update-password' && (
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
            )}

            {mode !== 'reset' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">{mode === 'update-password' ? 'Új jelszó' : 'Jelszó'}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={mode === 'update-password' ? 'Új jelszavad' : 'Jelszavad'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    maxLength={72}
                    disabled={loading}
                  />
                </div>

                {(mode === 'signup' || mode === 'update-password') && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Jelszó megerősítése</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Jelszó újra"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      maxLength={72}
                      disabled={loading}
                    />
                  </div>
                )}
              </>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'signin' ? 'Bejelentkezés...' : mode === 'signup' ? 'Regisztráció...' : mode === 'update-password' ? 'Jelszó frissítése...' : 'Email küldése...'}
                </>
              ) : (
                mode === 'signin' ? 'Bejelentkezés' : mode === 'signup' ? 'Regisztráció' : mode === 'update-password' ? 'Jelszó frissítése' : 'Jelszó visszaállítás'
              )}
            </Button>

            {mode !== 'update-password' && (
              <div className="text-center space-y-2">
                {mode === 'signin' && (
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => {
                      setMode('reset');
                      setError(null);
                      setPassword('');
                      setConfirmPassword('');
                    }}
                    disabled={loading}
                    className="text-sm"
                  >
                    Elfelejtetted a jelszavad?
                  </Button>
                )}
                
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    if (mode === 'reset') {
                      setMode('signin');
                    } else {
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                    }
                    setError(null);
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  disabled={loading}
                >
                  {mode === 'reset' 
                    ? 'Vissza a bejelentkezéshez'
                    : mode === 'signin' 
                    ? 'Nincs még fiókod? Regisztrálj!' 
                    : 'Van már fiókod? Jelentkezz be!'
                  }
                </Button>
              </div>
            )}

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
