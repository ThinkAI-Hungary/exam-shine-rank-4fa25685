import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  event: string;
  user?: {
    id: string;
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  exam?: {
    id: string;
    title?: string;
    score?: number;
    total_points?: number;
    percentage?: number;
  };
  course?: {
    id: string;
    title?: string;
  };
  timestamp?: string;
  // LearnWorlds may send different structures - log everything to discover format
  [key: string]: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Webhook received ===');
    console.log('Method:', req.method);
    console.log('Headers:', Object.fromEntries(req.headers.entries()));

    const payload: WebhookPayload = await req.json();
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract user data (adjust field names based on actual webhook structure)
    const userId = payload.user?.id || payload.userId || payload.user_id;
    const username = payload.user?.username || 
                     `${payload.user?.first_name || ''} ${payload.user?.last_name || ''}`.trim() || 
                     payload.username;
    const email = payload.user?.email || payload.email;
    
    // Extract exam score (adjust based on actual webhook structure)
    const examScore = payload.exam?.score || 
                      payload.score || 
                      payload.exam?.total_points || 
                      payload.points || 
                      0;

    if (!userId) {
      console.error('No user_id found in webhook payload');
      return new Response(
        JSON.stringify({ error: 'Missing user_id in payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracted data:', { userId, username, email, examScore });

    // Fetch current user data from leaderboard_cache
    const { data: existingUser, error: fetchError } = await supabase
      .from('leaderboard_cache')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching existing user:', fetchError);
      throw fetchError;
    }

    console.log('Existing user data:', existingUser);

    // Calculate updated values
    const currentTotalScore = existingUser?.total_score || 0;
    const currentExamCount = existingUser?.exam_count || 0;
    
    const newTotalScore = currentTotalScore + examScore;
    const newExamCount = currentExamCount + 1;
    const newAverageScore = newExamCount > 0 ? newTotalScore / newExamCount : 0;

    console.log('Calculated updates:', {
      newTotalScore,
      newExamCount,
      newAverageScore
    });

    // Upsert user data
    const { error: upsertError } = await supabase
      .from('leaderboard_cache')
      .upsert({
        user_id: userId,
        username: username || existingUser?.username || 'Unknown',
        email: email || existingUser?.email || null,
        total_score: newTotalScore,
        exam_count: newExamCount,
        average_score: newAverageScore,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('Error upserting user data:', upsertError);
      throw upsertError;
    }

    console.log('User data upserted successfully');

    // Recalculate ranks for all users
    const { data: allUsers, error: rankError } = await supabase
      .from('leaderboard_cache')
      .select('user_id, total_score')
      .order('total_score', { ascending: false });

    if (rankError) {
      console.error('Error fetching users for rank calculation:', rankError);
      throw rankError;
    }

    console.log('Recalculating ranks for', allUsers?.length, 'users');

    // Update ranks
    if (allUsers) {
      for (let i = 0; i < allUsers.length; i++) {
        const { error: updateError } = await supabase
          .from('leaderboard_cache')
          .update({ rank: i + 1 })
          .eq('user_id', allUsers[i].user_id);

        if (updateError) {
          console.error(`Error updating rank for user ${allUsers[i].user_id}:`, updateError);
        }
      }
    }

    console.log('Ranks recalculated successfully');
    console.log('=== Webhook processed successfully ===');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook processed successfully',
        updated_user: userId,
        new_score: newTotalScore,
        new_rank: 'recalculated'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check edge function logs for more information'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
