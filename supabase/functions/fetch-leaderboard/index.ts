import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const configuredBase = Deno.env.get('LEARNWORLDS_BASE_URL');
    const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
    const clientSecret = Deno.env.get('LEARNWORLDS_CLIENT_SECRET');
    const scope = Deno.env.get('LEARNWORLDS_SCOPE');

    if (!configuredBase || !clientId || !clientSecret) {
      console.error('Missing LearnWorlds credentials');
      throw new Error('LearnWorlds API credentials not configured');
    }

    // Normalize API base (e.g. https://example.com/admin/api)
    const apiBase = configuredBase.replace(/\/$/, '');
    const apiBaseUrl = new URL(apiBase);
    const origin = `${apiBaseUrl.protocol}//${apiBaseUrl.host}`; // e.g. https://example.com

    console.log('Using API base:', apiBase);
    console.log('Using origin for OAuth:', origin);

    // Helper: try fetching an OAuth token from multiple endpoints/strategies
    const tryFetchToken = async (): Promise<string | null> => {
      const tokenEndpoints = [
        `${origin}/oauth2/token`,
        `${origin}/oauth/token`,
        `${apiBase}/oauth2/token`,
        `${apiBase}/oauth/token`,
      ];

      for (const url of tokenEndpoints) {
        // Strategy A: Basic auth header
        try {
          const basicResp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              ...(scope ? { scope } : {}),
            }),
          });

          if (basicResp.ok) {
            const json = await basicResp.json();
            const token = json.access_token || json.data?.access_token;
            if (token) {
              console.log('Access token obtained via BASIC at', url);
              return token as string;
            }
            console.warn('Token response missing access_token (BASIC):', json);
          } else {
            const txt = await basicResp.text();
            console.info(`Basic auth token attempt failed ${basicResp.status} at ${url}:`, txt);
          }
        } catch (e) {
          console.info('Basic auth token request threw at', url, e instanceof Error ? e.message : e);
        }

        // Strategy B: client credentials in body (no Basic header)
        try {
          const bodyResp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: clientId,
              client_secret: clientSecret,
              ...(scope ? { scope } : {}),
            }),
          });

          if (bodyResp.ok) {
            const json = await bodyResp.json();
            const token = json.access_token || json.data?.access_token;
            if (token) {
              console.log('Access token obtained via BODY at', url);
              return token as string;
            }
            console.warn('Token response missing access_token (BODY):', json);
          } else {
            const txt = await bodyResp.text();
            console.info(`Body token attempt failed ${bodyResp.status} at ${url}:`, txt);
          }
        } catch (e) {
          console.info('Body token request threw at', url, e instanceof Error ? e.message : e);
        }
      }

      return null;
    };

    console.log('Fetching access token...');
    const accessToken = await tryFetchToken();
    if (!accessToken) {
      throw new Error('Failed to get access token from all known endpoints');
    }

    // Step 2: Fetch users from Admin API
    console.log('Fetching users from LearnWorlds...');

    const userEndpoints = [
      `${apiBase}/v2/users`,
      `${apiBase}/users`,
    ];

    let usersData: any = null;
    for (const u of userEndpoints) {
      try {
        const usersResp = await fetch(u, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (usersResp.ok) {
          usersData = await usersResp.json();
          console.log('Users fetched from', u, 'count:', usersData.data?.length || usersData.length || 0);
          break;
        } else {
          const txt = await usersResp.text();
          console.info(`Users endpoint failed ${usersResp.status} at ${u}:`, txt);
        }
      } catch (e) {
        console.info('Users request threw at', u, e instanceof Error ? e.message : e);
      }
    }

    if (!usersData) {
      throw new Error('Failed to fetch users from all known endpoints');
    }

    // Process and rank users by total points
    const users = usersData.data || usersData || [];
    const leaderboardData = users
      .map((user: any) => ({
        user_id: String(user.id),
        username: user.username || user.email?.split('@')[0] || 'User',
        email: user.email || null,
        total_points: user.total_points || user.points || 0,
        course_completions: user.courses_completed || user.courses_completed_count || 0,
        last_activity: user.last_login || user.last_activity || null,
      }))
      .sort((a: any, b: any) => b.total_points - a.total_points)
      .map((user: any, index: number) => ({
        ...user,
        rank: index + 1,
      }));

    console.log('Leaderboard calculated with', leaderboardData.length, 'users');

    // Update cache in database
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Clear existing cache (safe no-op filter to avoid full table truncate on permissions)
    await supabaseClient.from('leaderboard_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (leaderboardData.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('leaderboard_cache')
        .insert(leaderboardData);

      if (insertError) {
        console.error('Error updating cache:', insertError);
      } else {
        console.log('Cache updated successfully');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        leaderboard: leaderboardData,
        count: leaderboardData.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in fetch-leaderboard function:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
