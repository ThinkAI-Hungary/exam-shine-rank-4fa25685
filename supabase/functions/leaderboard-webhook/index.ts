import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Token cache to avoid unnecessary API calls
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

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

interface ExamDetail {
  examId: string;
  examTitle: string;
  score: number;
  completedAt: string | null;
}

interface ExamScoreResult {
  totalScore: number;
  examCount: number;
  lastActivity: string | null;
  exams: ExamDetail[];
}

async function getLearnWorldsAccessToken(): Promise<string> {
  const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
  const clientSecret = Deno.env.get('LEARNWORLDS_CLIENT_SECRET');
  const baseUrl = Deno.env.get('LEARNWORLDS_BASE_URL');
  const subdomain = Deno.env.get('LEARNWORLDS_SUBDOMAIN');
  const presetToken = Deno.env.get('LEARNWORLDS_ACCESS_TOKEN');

  // 0) If a static access token is configured, use it
  if (presetToken && presetToken.trim()) {
    console.log('Using preset LEARNWORLDS_ACCESS_TOKEN');
    return presetToken.trim();
  }

  // Check if we have a valid cached token
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now) {
    console.log('Using cached access token');
    return cachedToken;
  }

  if (!clientId || !clientSecret) {
    throw new Error('Missing LearnWorlds credentials: LEARNWORLDS_CLIENT_ID or LEARNWORLDS_CLIENT_SECRET');
  }

  const basic = 'Basic ' + btoa(`${clientId}:${clientSecret}`);

  async function tryToken(url: string) {
    console.log('Requesting LW access token from:', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': basic,
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error('LearnWorlds OAuth error:', res.status, raw);
      return null;
    }

    try {
      const data = JSON.parse(raw);
      if (data && data.access_token) return String(data.access_token);
      console.error('OAuth JSON missing access_token:', raw);
      return null;
    } catch (e) {
      console.error('Unexpected OAuth response (not JSON):', raw);
      return null;
    }
  }

  // 1) Try official learnworlds.com domain if subdomain provided
  if (subdomain && subdomain.trim()) {
    const slug = subdomain.trim().split('.')[0];
    const url = `https://${slug}.learnworlds.com/oauth2/access_token`;
    const token = await tryToken(url);
    if (token) {
      // Cache token for 55 minutes (tokens typically expire in 1 hour)
      cachedToken = token;
      tokenExpiresAt = Date.now() + (55 * 60 * 1000);
      console.log('Token cached, expires in 55 minutes');
      return token;
    }
  }

  // 2) Fallback to custom domain root derived from LEARNWORLDS_BASE_URL
  if (baseUrl && baseUrl.trim()) {
    const root = baseUrl.replace(/\/$/, '').replace(/\/admin\/api\/?$/, '');
    const url = `${root}/oauth2/access_token`;
    const token = await tryToken(url);
    if (token) {
      // Cache token for 55 minutes
      cachedToken = token;
      tokenExpiresAt = Date.now() + (55 * 60 * 1000);
      console.log('Token cached, expires in 55 minutes');
      return token;
    }
  }

  throw new Error('Failed to acquire LearnWorlds access token from all endpoints');
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
      
      const requestUrl = new URL(url);
      if (!requestUrl.searchParams.has('client_id')) {
        requestUrl.searchParams.set('client_id', clientId);
      }

      const response = await fetch(requestUrl.toString(), {
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
  const exams: ExamDetail[] = [];

  if (!courseProgress.activities || !Array.isArray(courseProgress.activities)) {
    return { totalScore: 0, examCount: 0, lastActivity: null, exams: [] };
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
          
          // Store individual exam details
          exams.push({
            examId: activity.id,
            examTitle: activity.title || 'Untitled Exam',
            score: numericScore,
            completedAt: activity.completed_at || null,
          });
          
          console.log(`Exam "${activity.title || activity.id}": ${numericScore}%`);
        }
      }
    }
  }

  console.log(`Extracted ${examCount} exam scores, total: ${totalScore}`);
  return { totalScore, examCount, lastActivity, exams };
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
    return { totalScore: 0, examCount: 0, lastActivity: null, exams: [] };
  }

  return extractExamScores(courseProgress);
}

async function storeExamResults(
  supabase: any,
  userId: string,
  username: string,
  email: string | null,
  courseId: string,
  courseTitle: string,
  exams: ExamDetail[]
): Promise<void> {
  if (exams.length === 0) {
    console.log('No exams to store');
    return;
  }

  console.log(`Storing ${exams.length} exam results for user ${userId}`);

  for (const exam of exams) {
    const { error } = await supabase
      .from('exam_results')
      .upsert({
        user_id: userId,
        username,
        email,
        course_id: courseId,
        course_title: courseTitle,
        exam_id: exam.examId,
        exam_title: exam.examTitle,
        score: exam.score,
        completed_at: exam.completedAt || new Date().toISOString(),
      }, {
        onConflict: 'user_id,exam_id'
      });

    if (error) {
      console.error(`Error upserting exam result for ${exam.examTitle}:`, error);
    } else {
      console.log(`Upserted exam result: ${exam.examTitle} - ${exam.score}%`);
    }
  }
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
    const courseTitle = payload.data?.course?.title || 'Unknown Course';
    const username = payload.data?.user?.username || 
                     `${payload.data?.user?.first_name || ''} ${payload.data?.user?.last_name || ''}`.trim() ||
                     'Unknown';
    const email = payload.data?.user?.email;
    const tags = payload.data?.user?.tags || [];

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
    
    // Fetch full user details to get custom fields
    console.log('Fetching full user details from LearnWorlds...');
    const baseUrl = Deno.env.get('LEARNWORLDS_BASE_URL');
    const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
    let munkaviszonyod_kezdete: string | null = null;
    
    if (baseUrl && clientId) {
      try {
        const userDetailsUrl = `${baseUrl}/v2/users/${userId}`;
        const userDetails = await makeLearnWorldsRequest(userDetailsUrl, accessToken);
        
        // Get employment start date from fields object
        munkaviszonyod_kezdete = userDetails?.fields?.cf_munkaviszonyodkezdete || null;
        
        if (munkaviszonyod_kezdete) {
          console.log('Found employment start date:', munkaviszonyod_kezdete);
        } else {
          console.log('No employment start date found in user fields');
        }
      } catch (error) {
        console.warn('Failed to fetch full user details:', error);
      }
    }
    
    const examResult = await getUserExamScores(accessToken, userId, courseId);

    console.log('Exam scores retrieved:', examResult);

    // Store individual exam results in exam_results table (source of truth)
    await storeExamResults(
      supabase,
      userId,
      username,
      email || null,
      courseId,
      courseTitle,
      examResult.exams
    );

    // Recalculate user's totals from exam_results (the source of truth)
    console.log('Recalculating totals from exam_results for user:', userId);
    
    const { data: userExams, error: examsError } = await supabase
      .from('exam_results')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false });

    if (examsError) {
      console.error('Error fetching exam results:', examsError);
      throw examsError;
    }

    if (!userExams || userExams.length === 0) {
      console.warn('No exam results found for user after insertion');
      return new Response(
        JSON.stringify({ error: 'No exam results found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate totals from all exam results
    const totalScore = userExams.reduce((sum, exam) => sum + (exam.score || 0), 0);
    const examCount = userExams.length;
    const averageScore = examCount > 0 ? totalScore / examCount : 0;
    const lastActivity = userExams[0]?.completed_at || new Date().toISOString();

    console.log('Calculated totals from exam_results:', {
      totalScore,
      examCount,
      averageScore
    });

    // Upsert user data into users table
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        user_id: userId,
        username,
        email: email || null,
        tags: tags.filter((tag: string) => tag.startsWith('cf_aruhaz_')),
        start_of_empl: munkaviszonyod_kezdete ? new Date(munkaviszonyod_kezdete).toISOString().split('T')[0] : null,  // Convert to YYYY-MM-DD format
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (userError) {
      console.error('Error upserting user to users table:', userError);
    } else {
      console.log('User data upserted successfully');
    }

    // Update leaderboard_cache with calculated values (only metrics, no user data)
    const { error: upsertError } = await supabase
      .from('leaderboard_cache')
      .upsert({
        user_id: userId,
        total_score: totalScore,
        exam_count: examCount,
        average_score: averageScore,
        last_activity: lastActivity,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('Error updating leaderboard_cache:', upsertError);
      throw upsertError;
    }

    console.log('Leaderboard_cache updated successfully');

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
        new_score: totalScore,
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
