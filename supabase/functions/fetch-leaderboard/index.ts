import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LearnWorldsUser {
  id: string;
  username: string;
  email: string;
  // Add other fields based on LearnWorlds API response
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('LEARNWORLDS_API_KEY');
    const subdomain = Deno.env.get('LEARNWORLDS_SUBDOMAIN');

    if (!apiKey || !subdomain) {
      throw new Error('LearnWorlds credentials not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching users from LearnWorlds...');

    // Fetch users from LearnWorlds API
    const learnWorldsResponse = await fetch(
      `https://${subdomain}.learnworlds.com/api/v2/users`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!learnWorldsResponse.ok) {
      const errorText = await learnWorldsResponse.text();
      console.error('LearnWorlds API error:', errorText);
      throw new Error(`LearnWorlds API error: ${learnWorldsResponse.status}`);
    }

    const userData = await learnWorldsResponse.json();
    console.log('Fetched users:', userData);

    // Process users and calculate scores
    // This is a placeholder - adjust based on actual LearnWorlds API structure
    const users = userData.data || userData || [];
    
    const leaderboardEntries = await Promise.all(
      users.map(async (user: any, index: number) => {
        // Fetch user's course progress/completions
        // Adjust this based on your LearnWorlds setup
        let totalPoints = 0;
        let courseCompletions = 0;

        try {
          // Fetch enrollments for each user
          const enrollmentsResponse = await fetch(
            `https://${subdomain}.learnworlds.com/api/v2/users/${user.id}/enrollments`,
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
              },
            }
          );

          if (enrollmentsResponse.ok) {
            const enrollments = await enrollmentsResponse.json();
            const enrollmentData = enrollments.data || enrollments || [];
            
            // Calculate points based on completed courses and progress
            enrollmentData.forEach((enrollment: any) => {
              if (enrollment.completion_percentage === 100) {
                courseCompletions++;
                totalPoints += 100; // 100 points per completed course
              } else {
                totalPoints += Math.floor(enrollment.completion_percentage || 0);
              }
            });
          }
        } catch (error) {
          console.error(`Error fetching enrollments for user ${user.id}:`, error);
        }

        return {
          user_id: user.id,
          username: user.username || user.name || user.email?.split('@')[0] || 'Unknown',
          email: user.email,
          total_points: totalPoints,
          course_completions: courseCompletions,
          last_activity: user.last_login || new Date().toISOString(),
        };
      })
    );

    // Sort by total points and assign ranks
    const sortedEntries = leaderboardEntries
      .sort((a, b) => b.total_points - a.total_points)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    // Update cache in database
    console.log('Updating leaderboard cache...');
    
    // Clear existing cache
    await supabase.from('leaderboard_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new data
    if (sortedEntries.length > 0) {
      const { error: insertError } = await supabase
        .from('leaderboard_cache')
        .insert(sortedEntries);

      if (insertError) {
        console.error('Error inserting cache:', insertError);
        throw insertError;
      }
    }

    console.log('Leaderboard updated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        entries: sortedEntries.length,
        data: sortedEntries 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in fetch-leaderboard function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Check function logs for more information'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
