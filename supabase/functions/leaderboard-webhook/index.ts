import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LearnWorldsWebhookPayload {
  version: number;
  type: string;
  trigger: string;
  school_id: string;
  data: {
    completed_at?: number;
    manually_completed?: boolean;
    course?: {
      id: string;
      title?: string;
      [key: string]: any;
    };
    user?: {
      id: string;
      username?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

interface LearnWorldsEnrollment {
  id: string;
  progress: number; // percentage 0-100
  course_id: string;
  completed: boolean;
  [key: string]: any;
}

async function getLearnWorldsAccessToken(): Promise<string> {
  const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
  const clientSecret = Deno.env.get('LEARNWORLDS_CLIENT_SECRET');
  const subdomain = Deno.env.get('LEARNWORLDS_SUBDOMAIN');

  if (!clientId || !clientSecret || !subdomain) {
    throw new Error('Missing LearnWorlds OAuth credentials');
  }

  const tokenUrl = `https://${subdomain}.learnworlds.com/oauth2/access_token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('LearnWorlds OAuth error:', errorText);
    throw new Error(`Failed to get LearnWorlds access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getUserCourseProgress(
  accessToken: string,
  userId: string,
  courseId: string
): Promise<number> {
  const baseUrl = Deno.env.get('LEARNWORLDS_BASE_URL');
  
  if (!baseUrl) {
    throw new Error('Missing LEARNWORLDS_BASE_URL');
  }

  // Try to get user enrollments to find the course progress
  const enrollmentsUrl = `${baseUrl}/v2/users/${userId}/enrollments`;
  
  console.log('Fetching user enrollments from:', enrollmentsUrl);

  const response = await fetch(enrollmentsUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('LearnWorlds API error:', errorText);
    throw new Error(`Failed to fetch user enrollments: ${response.status}`);
  }

  const data = await response.json();
  console.log('LearnWorlds API response:', JSON.stringify(data, null, 2));

  // Find the enrollment for the specific course
  const enrollments = data.data || data;
  const courseEnrollment = Array.isArray(enrollments)
    ? enrollments.find((e: LearnWorldsEnrollment) => e.course_id === courseId)
    : null;

  if (!courseEnrollment) {
    console.warn(`No enrollment found for course ${courseId}, returning 0`);
    return 0;
  }

  // Return the progress percentage (0-100)
  const progress = courseEnrollment.progress || 0;
  console.log(`Found course progress: ${progress}%`);
  
  return progress;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== LearnWorlds Course Completion Webhook received ===');
    console.log('Method:', req.method);
    console.log('Headers:', Object.fromEntries(req.headers.entries()));

    const payload: LearnWorldsWebhookPayload = await req.json();
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Check if this is a course completion event
    if (payload.trigger !== 'course_completed') {
      console.log('Ignoring non-course-completion event:', payload.trigger);
      return new Response(
        JSON.stringify({ message: 'Event ignored - not a course completion' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract user and course data from LearnWorlds webhook
    const userId = payload.data?.user?.id;
    const courseId = payload.data?.course?.id;
    const username = payload.data?.user?.username || 
                     `${payload.data?.user?.first_name || ''} ${payload.data?.user?.last_name || ''}`.trim() ||
                     'Unknown';
    const email = payload.data?.user?.email;

    if (!userId || !courseId) {
      console.error('Missing user_id or course_id in webhook payload');
      return new Response(
        JSON.stringify({ error: 'Missing user_id or course_id in payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracted data:', { userId, courseId, username, email });

    // Get LearnWorlds access token and fetch course progress
    console.log('Fetching course progress from LearnWorlds API...');
    const accessToken = await getLearnWorldsAccessToken();
    const courseScore = await getUserCourseProgress(accessToken, userId, courseId);

    console.log('Course score retrieved:', courseScore);

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
    
    const newTotalScore = currentTotalScore + courseScore;
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Check edge function logs for more information'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
