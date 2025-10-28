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
    const learnWorldsApiKey = Deno.env.get('LEARNWORLDS_API_KEY');
    const learnWorldsSubdomain = Deno.env.get('LEARNWORLDS_SUBDOMAIN');
    
    if (!learnWorldsApiKey || !learnWorldsSubdomain) {
      console.error('Missing LearnWorlds credentials');
      throw new Error('LearnWorlds API credentials not configured');
    }

    console.log('Fetching users from LearnWorlds...');
    
    // Fetch users from LearnWorlds API
    const usersResponse = await fetch(
      `https://${learnWorldsSubdomain}.learnworlds.com/api/v2/users`,
      {
        method: 'GET',
        headers: {
          'Authorization': learnWorldsApiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!usersResponse.ok) {
      const errorText = await usersResponse.text();
      console.error('LearnWorlds API error:', errorText);
      throw new Error(`LearnWorlds API error: ${usersResponse.status}`);
    }

    const usersData = await usersResponse.json();
    console.log('Users fetched:', usersData.data?.length || 0);

    // Process and rank users by total points
    const leaderboardData = (usersData.data || [])
      .map((user: any) => ({
        user_id: user.id,
        username: user.username || user.email?.split('@')[0] || 'User',
        email: user.email,
        total_points: user.total_points || 0,
        course_completions: user.courses_completed || 0,
        last_activity: user.last_login || null,
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
