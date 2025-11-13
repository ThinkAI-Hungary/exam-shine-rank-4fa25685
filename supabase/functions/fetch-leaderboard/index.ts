import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= TYPES =============
interface LearnWorldsUser {
  id: string;
  username?: string;
  email?: string;
  name?: string;
}

interface Enrollment {
  product_id: string;
  product_type: string;
}

interface ExamActivity {
  id: string;
  type: string;
  title?: string;
  score?: number;
  max_score?: number;
  status: string;
  completed_at?: string | number;
}

interface CourseProgress {
  activities?: ExamActivity[];
}

interface AggregatedUserData {
  user_id: string;
  username: string;
  email: string | null;
  total_score: number;
  exam_count: number;
  average_score: number;
  last_activity: string | null;
}

// ============= RATE LIMITING =============
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
    }
  }
}

// ============= API HELPERS =============
async function makeLearnWorldsRequest(
  url: string,
  accessToken: string,
  clientId: string,
  opts: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<any> {
  const maxRetries = opts.maxRetries ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 800; // start under 1s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    let resp: Response | null = null;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Lw-Client': clientId,
        },
      });
    } catch (e) {
      if (attempt === maxRetries) {
        throw new Error(`Network error after ${maxRetries + 1} attempts: ${e instanceof Error ? e.message : e}`);
      }
      const wait = baseDelayMs * Math.pow(2, attempt);
      console.warn(`Network error, retrying in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (resp.ok) {
      const json = await resp.json();
      return json;
    }

    // Handle rate limit
    if (resp.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(resp.headers.get('Retry-After'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
      const text = await resp.text();
      console.warn(`429 Too Many Requests for ${url}. Waiting ${backoff}ms before retry. Body: ${text}`);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    // Retry on transient 5xx
    if (resp.status >= 500 && resp.status < 600 && attempt < maxRetries) {
      const backoff = baseDelayMs * Math.pow(2, attempt);
      const text = await resp.text();
      console.warn(`Server ${resp.status} for ${url}. Retry in ${backoff}ms. Body: ${text}`);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    const text = await resp.text();
    throw new Error(`API request failed (${resp.status}) after ${Date.now() - start}ms: ${text}`);
  }

  throw new Error('Unreachable');
}

async function fetchAllCourses(
  baseUrl: string,
  accessToken: string,
  clientId: string
): Promise<string[]> {
  console.log('Fetching all courses...');
  const allCourses: string[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}/v2/courses?page=${page}&per_page=50`;
    try {
      const data = await makeLearnWorldsRequest(url, accessToken, clientId);
      const courses = data.data || data || [];
      
      if (courses.length === 0) {
        hasMore = false;
      } else {
        const courseIds = courses.map((c: any) => c.id || c.course_id).filter(Boolean);
        allCourses.push(...courseIds);
        console.log(`Fetched courses page ${page}: ${courseIds.length} courses`);
        page++;
        
        if (page > 10) {
          console.warn('Reached course page limit of 10');
          hasMore = false;
        }
      }
    } catch (error) {
      console.error(`Error fetching courses page ${page}:`, error);
      hasMore = false;
    }
  }

  console.log(`Total courses fetched: ${allCourses.length}`);
  return allCourses;
}

async function fetchAllUsers(
  baseUrl: string,
  accessToken: string,
  clientId: string
): Promise<LearnWorldsUser[]> {
  console.log('Fetching all users...');
  const allUsers: LearnWorldsUser[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}/v2/users?page=${page}&per_page=50`;
    try {
      const data = await makeLearnWorldsRequest(url, accessToken, clientId);
      const users = data.data || data || [];
      
      if (users.length === 0) {
        hasMore = false;
      } else {
        allUsers.push(...users);
        console.log(`Fetched page ${page}: ${users.length} users`);
        
        // Log first user structure on first page to understand available fields
        if (page === 1 && users.length > 0) {
          console.log('Sample user fields:', JSON.stringify(Object.keys(users[0])));
          console.log('Sample user data (Benke Viktor if present):', JSON.stringify(users.find((u: any) => u.username?.includes('Benke') || u.name?.includes('Benke'))));
        }
        
        page++;
        
        // Safety limit
        if (page > 20) {
          console.warn('Reached page limit of 20, stopping pagination');
          hasMore = false;
        }
      }
    } catch (error) {
      console.error(`Error fetching users page ${page}:`, error);
      hasMore = false;
    }
  }

  console.log(`Total users fetched: ${allUsers.length}`);
  return allUsers;
}

async function fetchUserEnrollments(
  baseUrl: string,
  userId: string,
  accessToken: string,
  clientId: string
): Promise<Enrollment[]> {
  try {
    const url = `${baseUrl}/v2/users/${userId}/enrollments`;
    console.log(`[User ${userId}] Calling enrollments URL: ${url}`);
    const data = await makeLearnWorldsRequest(url, accessToken, clientId);
    const enrollments = data.data || data || [];
    console.log(`[User ${userId}] Found ${enrollments.length} enrollments`);
    if (enrollments.length > 0) {
      console.log(`[User ${userId}] Enrollment details:`, JSON.stringify(enrollments.map((e: any) => ({ 
        product_id: e.product_id, 
        product_type: e.product_type 
      }))));
    }
    return enrollments;
  } catch (error) {
    console.warn(`Failed to fetch enrollments for user ${userId}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchCourseProgress(
  baseUrl: string,
  userId: string,
  courseId: string,
  accessToken: string,
  clientId: string
): Promise<CourseProgress | null> {
  try {
    const url = `${baseUrl}/v2/users/${userId}/progress/${courseId}`;
    const data = await makeLearnWorldsRequest(url, accessToken, clientId);
    console.log(`[User ${userId}] [Course ${courseId}] Progress data structure:`, JSON.stringify({
      hasActivities: !!data?.activities,
      activitiesCount: data?.activities?.length || 0,
      sampleFields: data ? Object.keys(data) : []
    }));
    return data;
  } catch (error) {
    console.warn(`Failed to fetch progress for user ${userId}, course ${courseId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function fetchAllCourseProgress(
  baseUrl: string,
  userId: string,
  accessToken: string,
  clientId: string
): Promise<CourseProgress[]> {
  const url = `${baseUrl}/v2/users/${userId}/progress`;
  try {
    console.log(`[User ${userId}] Calling all-courses progress URL: ${url}`);
    const data = await makeLearnWorldsRequest(url, accessToken, clientId);

    let list: any[] = [];
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data?.data)) list = data.data;
    else if (Array.isArray(data?.items)) list = data.items;
    else if (Array.isArray(data?.courses)) list = data.courses;

    console.log(`[User ${userId}] All-courses progress count: ${list.length}`);
    if (list.length > 0) {
      console.log(`[User ${userId}] Progress sample keys:`, JSON.stringify(Object.keys(list[0] || {})));
    }

    return list as CourseProgress[];
  } catch (error) {
    console.warn(`[User ${userId}] All-courses progress endpoint failed:`, error instanceof Error ? error.message : error);
    return [];
  }
}

// ============= DATA AGGREGATION =============
function extractExamScores(progress: CourseProgress, userId: string, courseId: string): { score: number; count: number; lastActivity: string | null } {
  let totalScore = 0;
  let examCount = 0;
  let lastActivity: string | null = null;

  if (!progress.activities || !Array.isArray(progress.activities)) {
    console.log(`[User ${userId}] [Course ${courseId}] No activities array found`);
    return { score: 0, count: 0, lastActivity: null };
  }

  console.log(`[User ${userId}] [Course ${courseId}] Inspecting ${progress.activities.length} activities`);
  
  for (const activity of progress.activities) {
    console.log(`[User ${userId}] [Course ${courseId}] Activity:`, JSON.stringify({
      id: activity.id,
      type: activity.type,
      status: activity.status,
      score: activity.score,
      max_score: activity.max_score,
      title: activity.title
    }));

    // Check if it's a completed exam
    if (
      activity.type === 'exam' &&
      activity.status === 'completed' &&
      typeof activity.score === 'number'
    ) {
      console.log(`[User ${userId}] [Course ${courseId}] ✓ EXAM FOUND: score=${activity.score}`);
      totalScore += activity.score;
      examCount++;

      // Track most recent activity
      if (activity.completed_at) {
        const activityTime = normalizeTimestamp(activity.completed_at);
        if (activityTime && (!lastActivity || activityTime > lastActivity)) {
          lastActivity = activityTime;
        }
      }
    }
  }

  console.log(`[User ${userId}] [Course ${courseId}] Exam extraction complete: ${examCount} exams, ${totalScore} total score`);
  return { score: totalScore, count: examCount, lastActivity };
}

function normalizeTimestamp(timestamp: string | number | null | undefined): string | null {
  if (!timestamp) return null;

  try {
    if (typeof timestamp === 'number') {
      const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
      return new Date(ms).toISOString();
    }

    if (typeof timestamp === 'string') {
      const num = Number(timestamp);
      if (!Number.isNaN(num)) {
        const ms = num < 1e12 ? num * 1000 : num;
        return new Date(ms).toISOString();
      }
      // Assume it's already ISO string
      return timestamp;
    }
  } catch (error) {
    console.warn('Failed to normalize timestamp:', timestamp);
  }

  return null;
}

async function aggregateUserData(
  user: LearnWorldsUser,
  baseUrl: string,
  accessToken: string,
  clientId: string,
  rateLimiter: RateLimiter,
  courseIds: string[]
): Promise<AggregatedUserData> {
  const userId = String(user.id);
  const username = user.username || user.name || user.email?.split('@')[0] || 'Unknown';
  const email = user.email || null;

  console.log(`\n=== Processing User: ${username} (${userId}) ===`);
  console.log(`[User ${userId}] Fetching progress for ${courseIds.length} courses`);

  let totalScore = 0;
  let totalExams = 0;
  let latestActivity: string | null = null;
  let coursesProcessed = 0;

  for (const courseId of courseIds) {
    const progress = await rateLimiter.run(() =>
      fetchCourseProgress(baseUrl, userId, courseId, accessToken, clientId)
    );

    if (progress) {
      coursesProcessed++;
      const examData = extractExamScores(progress, userId, courseId);
      totalScore += examData.score;
      totalExams += examData.count;

      if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
        latestActivity = examData.lastActivity;
      }
    }
  }

  const averageScore = totalExams > 0 ? totalScore / totalExams : 0;

  console.log(`[User ${userId}] Processed ${coursesProcessed}/${courseIds.length} courses. FINAL: ${totalExams} exams, ${totalScore} total score, ${averageScore.toFixed(1)} avg`);

  return {
    user_id: userId,
    username,
    email,
    total_score: totalScore,
    exam_count: totalExams,
    average_score: Math.round(averageScore * 10) / 10,
    last_activity: latestActivity,
  };
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // API call counter
  let apiCallCount = 0;
  const makeTrackedRequest = async (url: string, accessToken: string, clientId: string) => {
    apiCallCount++;
    return makeLearnWorldsRequest(url, accessToken, clientId);
  };

  try {
    console.log('=== Starting Leaderboard Fetch ===');

    // Parse body options (optional)
    let options: any = {};
    if (req.method === 'POST') {
      try { options = await req.json(); } catch (_) { /* no-op */ }
    }
    const limitUsers = Number(options?.options?.limitUsers ?? 0);
    const limitCourses = Number(options?.options?.limitCourses ?? 0);
    const filterUserIds: string[] = Array.isArray(options?.options?.userIds) ? options.options.userIds.map(String) : [];
    const isSelectiveRefresh = filterUserIds.length > 0;

    if (isSelectiveRefresh) {
      console.log(`SELECTIVE REFRESH: Processing ${filterUserIds.length} specific user(s)`);
    } else {
      console.log(`FULL REFRESH: Processing all users`);
    }

    // Get configuration
    const apiBase = Deno.env.get('LEARNWORLDS_BASE_URL');
    const accessToken = Deno.env.get('LEARNWORLDS_ACCESS_TOKEN');
    const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');

    if (!apiBase || !accessToken || !clientId) {
      throw new Error('Missing required LearnWorlds configuration');
    }

    const baseUrl = apiBase.replace(/\/$/, '');
    console.log('API Base URL:', baseUrl);
    console.log('Options:', { limitUsers, limitCourses, filterUserIdsCount: filterUserIds.length });

    // Initialize rate limiter
    const rateLimiter = new RateLimiter(2); // Reduce concurrency to reduce 429s

    // Optimization: For selective refresh, skip fetching all courses and all users
    let courseIds: string[] = [];
    let users: LearnWorldsUser[] = [];

    if (isSelectiveRefresh) {
      // For selective refresh: fetch only the specific users
      console.log('Fetching specific users for selective refresh...');
      for (const userId of filterUserIds) {
        try {
          const url = `${baseUrl}/v2/users/${userId}`;
          const userData = await makeTrackedRequest(url, accessToken, clientId);
          users.push(userData);
        } catch (error) {
          console.warn(`Failed to fetch user ${userId}:`, error);
        }
      }
      // For selective refresh, we'll use the all-courses progress endpoint per user (1 call per user)
      // So we don't need to fetch all courses upfront
    } else {
      // Full refresh: fetch all courses and all users
      courseIds = await fetchAllCourses(baseUrl, accessToken, clientId);
      apiCallCount++; // Count the courses fetch
      
      if (courseIds.length === 0) {
        console.warn('No courses found');
        return new Response(
          JSON.stringify({ success: true, leaderboard: [], count: 0, message: 'No courses found', apiCalls: apiCallCount }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (limitCourses > 0) courseIds = courseIds.slice(0, limitCourses);

      users = await fetchAllUsers(baseUrl, accessToken, clientId);
      apiCallCount++; // Count the users fetch
      if (limitUsers > 0) users = users.slice(0, limitUsers);
    }
    
    if (users.length === 0) {
      console.warn('No users found');
      return new Response(
        JSON.stringify({ success: true, leaderboard: [], count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduplicate users by id to avoid DB unique constraint conflicts
    const uniqueUsersMap = new Map<string, LearnWorldsUser>();
    for (const u of users) uniqueUsersMap.set(String(u.id), u);
    const uniqueUsers = Array.from(uniqueUsersMap.values());
    if (uniqueUsers.length !== users.length) {
      console.log(`Deduplicated users: ${users.length} -> ${uniqueUsers.length}`);
    }

    // Step 3: Process users in small batches and upsert incrementally
    console.log('Aggregating exam scores for users...');
    const batchSize = 3;
    const leaderboardData: AggregatedUserData[] = [];

    for (let i = 0; i < uniqueUsers.length; i += batchSize) {
      const batch = uniqueUsers.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueUsers.length / batchSize)} (users ${i + 1}-${Math.min(i + batchSize, uniqueUsers.length)})`);
      
      // For selective refresh, use optimized single-call progress fetch
      const batchResults = await Promise.all(
        batch.map(async (user) => {
          if (isSelectiveRefresh) {
            // Optimized: Use all-courses progress endpoint (1 API call per user)
            const userId = String(user.id);
            const username = user.username || user.name || user.email?.split('@')[0] || 'Unknown';
            const email = user.email || null;
            
            console.log(`\n=== Processing User (Selective): ${username} (${userId}) ===`);
            
            const allProgress = await rateLimiter.run(() => {
              apiCallCount++;
              return fetchAllCourseProgress(baseUrl, userId, accessToken, clientId);
            });
            
            let totalScore = 0;
            let totalExams = 0;
            let latestActivity: string | null = null;
            
            for (const progress of allProgress) {
              const examData = extractExamScores(progress, userId, 'unknown');
              totalScore += examData.score;
              totalExams += examData.count;
              
              if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
                latestActivity = examData.lastActivity;
              }
            }
            
            const averageScore = totalExams > 0 ? totalScore / totalExams : 0;
            console.log(`[User ${userId}] FINAL: ${totalExams} exams, ${totalScore} total score, ${averageScore.toFixed(1)} avg`);
            
            return {
              user_id: userId,
              username,
              email,
              total_score: totalScore,
              exam_count: totalExams,
              average_score: Math.round(averageScore * 10) / 10,
              last_activity: latestActivity,
            };
          } else {
            // Full refresh: Use per-course progress fetch
            return aggregateUserData(user, baseUrl, accessToken, clientId, rateLimiter, courseIds);
          }
        })
      );
      
      // Track API calls for the full refresh path
      if (!isSelectiveRefresh) {
        apiCallCount += batchResults.length * courseIds.length;
      }
      
      leaderboardData.push(...batchResults);

      // Upsert partial batch to DB to avoid timeouts
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { error: upsertError } = await supabase
        .from('leaderboard_cache')
        .upsert(batchResults, { onConflict: 'user_id' });
      if (upsertError) {
        console.error('Database upsert error (batch):', upsertError);
      } else {
        console.log(`Batch upserted: ${batchResults.length} records`);
      }
    }

    // Step 4: Re-rank ALL users in the database (critical for selective refresh)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch ALL users from database to calculate proper ranks
    const { data: allUsersData, error: fetchError } = await supabase
      .from('leaderboard_cache')
      .select('*')
      .order('total_score', { ascending: false });

    if (fetchError) {
      console.error('Error fetching all users for ranking:', fetchError);
    } else if (allUsersData && allUsersData.length > 0) {
      // Assign ranks based on total_score (highest score = rank 1)
      const rankedData = allUsersData.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

      // Update ranks for all users
      const { error: rankUpdateError } = await supabase
        .from('leaderboard_cache')
        .upsert(rankedData, { onConflict: 'user_id' });
      
      if (rankUpdateError) {
        console.error('Error updating ranks:', rankUpdateError);
      } else {
        console.log(`Successfully ranked ${rankedData.length} users`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        leaderboard: leaderboardData,
        count: leaderboardData.length,
        limits: { limitUsers, limitCourses },
        apiCalls: apiCallCount,
        isSelectiveRefresh,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('=== Error in fetch-leaderboard ===');
    console.error(error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
