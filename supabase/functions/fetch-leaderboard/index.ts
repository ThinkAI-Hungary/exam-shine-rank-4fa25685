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
    const apiBase = Deno.env.get('LEARNWORLDS_BASE_URL');
    const accessToken = Deno.env.get('LEARNWORLDS_ACCESS_TOKEN');
    const subdomain = Deno.env.get('LEARNWORLDS_SUBDOMAIN');

    if (!apiBase || !accessToken) {
      console.error('Missing LearnWorlds configuration');
      throw new Error('LEARNWORLDS_BASE_URL and LEARNWORLDS_ACCESS_TOKEN must be configured');
    }

    // Normalize API base (e.g. https://example.com/admin/api)
    const normalizedBase = apiBase.replace(/\/$/, '');
    const lwBaseFromSubdomain = subdomain ? `https://${subdomain}.learnworlds.com/admin/api` : null;

    const apiBases = [
      normalizedBase,
      ...(lwBaseFromSubdomain && lwBaseFromSubdomain !== normalizedBase ? [lwBaseFromSubdomain] : []),
    ];

    console.log('API bases to try:', apiBases);
    console.log('Auth mode: direct access token (Bearer)');

    // Fetch users from Admin API
    console.log('Fetching users from LearnWorlds...');

    const userEndpoints = apiBases.flatMap((b) => [
      `${b}/v2/users`,
      `${b}/users`,
    ]);

    let usersData: any = null;
    const headerStrategies: Array<{ name: string; headers: Record<string, string> }> = [
      { name: 'Authorization: Bearer', headers: { Authorization: `Bearer ${accessToken}` } },
      { name: 'X-API-KEY', headers: { 'X-API-KEY': `${accessToken}` } },
      { name: 'X-Auth-Token', headers: { 'X-Auth-Token': `${accessToken}` } },
      { name: 'Api-Key', headers: { 'Api-Key': `${accessToken}` } },
    ];

    for (const u of userEndpoints) {
      for (const strategy of headerStrategies) {
        try {
          const usersResp = await fetch(u, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              ...strategy.headers,
            },
          });

          if (usersResp.ok) {
            usersData = await usersResp.json();
            console.log(`Users fetched from ${u} using header strategy: ${strategy.name}. Count:`, usersData.data?.length || usersData.length || 0);
            break;
          } else {
            const txt = await usersResp.text();
            console.info(`Users endpoint failed ${usersResp.status} at ${u} with ${strategy.name}:`, txt);
          }
        } catch (e) {
          console.info(`Users request threw at ${u} with ${strategy.name}:`, e instanceof Error ? e.message : e);
        }
      }
      if (usersData) break;
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