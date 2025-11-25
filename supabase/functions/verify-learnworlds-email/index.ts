import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ exists: false, error: 'Email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Checking if email exists in LearnWorlds: ${email}`);

    // Check if email exists in users table (LearnWorlds data)
    const { data: user, error } = await supabaseClient
      .from('users')
      .select('email, username')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Error checking email:', error);
      return new Response(
        JSON.stringify({ exists: false, error: 'Database error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (user) {
      console.log(`Email found in LearnWorlds: ${email} (${user.username})`);
      return new Response(
        JSON.stringify({ exists: true, username: user.username }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Email not found in LearnWorlds: ${email}`);
    return new Response(
      JSON.stringify({ exists: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in verify-learnworlds-email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ exists: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
