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
    const baseUrl = Deno.env.get('LEARNWORLDS_BASE_URL');
    const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
    const clientSecret = Deno.env.get('LEARNWORLDS_CLIENT_SECRET');
    
    if (!baseUrl || !clientId || !clientSecret) {
      console.error('Missing LearnWorlds credentials');
      throw new Error('LearnWorlds API credentials not configured');
    }

    // Normalize base URL (remove trailing slash)
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    console.log('Using base URL:', normalizedBaseUrl);

    // Step 1: Get access token using OAuth 2.0 Client Credentials
    console.log('Fetching access token...');
    let tokenResponse;
    let accessToken;

    // Try /oauth2/token first
    try {
      tokenResponse = await fetch(`${normalizedBaseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;
        console.log('Access token obtained via /oauth2/token');
      } else {
        console.log(`/oauth2/token failed with ${tokenResponse.status}, trying /oauth/token`);
        throw new Error('Try alternative endpoint');
      }
    } catch (error) {
      // Fallback to /oauth/token
      console.log('Trying /oauth/token endpoint...');
      tokenResponse = await fetch(`${normalizedBaseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('OAuth token error:', errorText);
        throw new Error(`Failed to get access token: ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;
      console.log('Access token obtained via /oauth/token');
    }

    if (!accessToken) {
      throw new Error('No access token received');
    }

    // Step 2: Fetch users with access token
    console.log('Fetching users from LearnWorlds...');
    let usersResponse;
    let usersData;

    // Try /v2/users first
    try {
      usersResponse = await fetch(`${normalizedBaseUrl}/v2/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (usersResponse.ok) {
        usersData = await usersResponse.json();
        console.log('Users fetched via /v2/users:', usersData.data?.length || usersData.length || 0);
      } else {
        console.log(`/v2/users failed with ${usersResponse.status}, trying /users`);
        throw new Error('Try alternative endpoint');
      }
    } catch (error) {
      // Fallback to /users
      console.log('Trying /users endpoint...');
      usersResponse = await fetch(`${normalizedBaseUrl}/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!usersResponse.ok) {
        const errorText = await usersResponse.text();
        console.error('Users API error:', errorText);
        throw new Error(`Failed to fetch users: ${usersResponse.status}`);
      }

      usersData = await usersResponse.json();
      console.log('Users fetched via /users:', usersData.data?.length || usersData.length || 0);
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

    // Clear existing cache
    await supabaseClient.from('leaderboard_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new data
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
        count: leaderboardData.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('Error in fetch-leaderboard function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
