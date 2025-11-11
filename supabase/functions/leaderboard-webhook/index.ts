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

interface ExamActivity {
  id: string;
  type: string;
  title?: string;
  status: string;
  score?: number | string;
  grade?: number | string;
  [key: string]: any;
}

interface CourseProgress {
  course_id: string;
  activities: ExamActivity[];
  [key: string]: any;
}

interface ExamScoreResult {
  totalScore: number;
  examCount: number;
  lastActivity: string | null;
}

async function getLearnWorldsAccessToken(): Promise<string> {
  const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
  const clientSecret = Deno.env.get('LEARNWORLDS_CLIENT_SECRET');
  const baseUrl = Deno.env.get('LEARNWORLDS_BASE_URL');

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error('Missing LearnWorlds OAuth credentials');
  }

  const tokenUrl = `${baseUrl}/oauth2/access_token`;
  
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

async function makeLearnWorldsRequest(
  url: string,
  accessToken: string,
  retries = 3
): Promise<any> {
  const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
  
  if (!clientId) {
    throw new Error('Missing LEARNWORLDS_CLIENT_ID');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`API request (attempt ${attempt}/${retries}):`, url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Lw-Client': clientId,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        return await response.json();
      }

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        console.warn(`Rate limited. Retrying after ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      // Handle server errors (5xx)
      if (response.status >= 500) {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        console.warn(`Server error ${response.status}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Client errors (4xx) - don't retry
      const errorText = await response.text();
      console.error('LearnWorlds API error:', errorText);
      throw new Error(`API request failed: ${response.status}`);

    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      
      // Network errors - retry with exponential backoff
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.warn(`Request failed, retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

function extractExamScores(courseProgress: CourseProgress): ExamScoreResult {
  let totalScore = 0;
  let examCount = 0;
  let lastActivity: string | null = null;

  if (!courseProgress.activities || !Array.isArray(courseProgress.activities)) {
    return { totalScore: 0, examCount: 0, lastActivity: null };
  }

  for (const activity of courseProgress.activities) {
    // Only process completed exams
    if (activity.type === 'exam' && activity.status === 'completed') {
      // Extract score - can be in 'score' or 'grade' field
      const scoreValue = activity.score ?? activity.grade;
      
      if (scoreValue !== undefined && scoreValue !== null) {
        let numericScore: number;

        if (typeof scoreValue === 'string') {
          // Handle percentage strings like "85%" or "0.85"
          const cleaned = scoreValue.replace('%', '').trim();
          numericScore = parseFloat(cleaned);
          
          // If it's a decimal (0-1), convert to percentage
          if (numericScore <= 1) {
            numericScore *= 100;
          }
        } else {
          numericScore = scoreValue;
          
          // If it's a decimal (0-1), convert to percentage
          if (numericScore <= 1) {
            numericScore *= 100;
          }
        }

        if (!isNaN(numericScore)) {
          totalScore += numericScore;
          examCount += 1;
          
          console.log(`Exam "${activity.title || activity.id}": ${numericScore}%`);
        }
      }
    }
  }

  console.log(`Extracted ${examCount} exam scores, total: ${totalScore}`);
  return { totalScore, examCount, lastActivity };
}

async function getUserExamScores(
  accessToken: string,
  userId: string,
  courseId: string
): Promise<ExamScoreResult> {
  const baseUrl = Deno.env.get('LEARNWORLDS_BASE_URL');
  
  if (!baseUrl) {
    throw new Error('Missing LEARNWORLDS_BASE_URL');
  }

  const progressUrl = `${baseUrl}/v2/users/${userId}/progress`;
  
  console.log('Fetching user progress from:', progressUrl);

  const data = await makeLearnWorldsRequest(progressUrl, accessToken);
  
  // Find the progress for the specific course
  const progressData = data.data || data;
  const courseProgress = Array.isArray(progressData)
    ? progressData.find((p: CourseProgress) => p.course_id === courseId)
    : null;

  if (!courseProgress) {
    console.warn(`No progress found for course ${courseId}`);
    return { totalScore: 0, examCount: 0, lastActivity: null };
  }

  return extractExamScores(courseProgress);
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

    // Get LearnWorlds access token and fetch exam scores
    console.log('Fetching exam scores from LearnWorlds API...');
    const accessToken = await getLearnWorldsAccessToken();
    const examResult = await getUserExamScores(accessToken, userId, courseId);

    console.log('Exam scores retrieved:', examResult);

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
    
    const newTotalScore = currentTotalScore + examResult.totalScore;
    const newExamCount = currentExamCount + examResult.examCount;
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
