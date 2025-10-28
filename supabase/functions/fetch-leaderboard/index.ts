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
  clientId: string
): Promise<any> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Lw-Client': clientId,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed (${response.status}): ${text}`);
  }

  return await response.json();
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
  rateLimiter: RateLimiter
): Promise<AggregatedUserData> {
  const userId = String(user.id);
  const username = user.username || user.name || user.email?.split('@')[0] || 'Unknown';
  const email = user.email || null;

  console.log(`\n=== Processing User: ${username} (${userId}) ===`);

  // Fetch enrollments
  const enrollments = await rateLimiter.run(() =>
    fetchUserEnrollments(baseUrl, userId, accessToken, clientId)
  );

  if (enrollments.length === 0) {
    console.log(`[User ${userId}] No enrollments found - trying all-courses progress endpoint`);
    const allProgress = await rateLimiter.run(() =>
      fetchAllCourseProgress(baseUrl, userId, accessToken, clientId)
    );

    if (allProgress.length === 0) {
      console.log(`[User ${userId}] No progress returned from all-courses endpoint - returning zero scores`);
      return {
        user_id: userId,
        username,
        email,
        total_score: 0,
        exam_count: 0,
        average_score: 0,
        last_activity: null,
      };
    }

    let totalScore = 0;
    let totalExams = 0;
    let latestActivity: string | null = null;

    for (const cp of allProgress) {
      const courseId = (cp as any).course_id || 'unknown';
      const examData = extractExamScores(cp, userId, courseId);
      totalScore += examData.score;
      totalExams += examData.count;
      if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
        latestActivity = examData.lastActivity;
      }
    }

    const averageScore = totalExams > 0 ? totalScore / totalExams : 0;
    console.log(`[User ${userId}] FINAL (fallback) AGGREGATION: ${totalExams} exams, ${totalScore} total score, ${averageScore.toFixed(1)} avg`);

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

  // Fetch progress for each enrollment
  let totalScore = 0;
  let totalExams = 0;
  let latestActivity: string | null = null;
  let coursesProcessed = 0;

  for (const enrollment of enrollments) {
    if (enrollment.product_type !== 'course') {
      console.log(`[User ${userId}] Skipping non-course enrollment: ${enrollment.product_type}`);
      continue;
    }

    coursesProcessed++;
    console.log(`[User ${userId}] Processing course ${coursesProcessed}/${enrollments.filter((e: any) => e.product_type === 'course').length}: ${enrollment.product_id}`);

    const progress = await rateLimiter.run(() =>
      fetchCourseProgress(baseUrl, userId, enrollment.product_id, accessToken, clientId)
    );

    if (progress) {
      const examData = extractExamScores(progress, userId, enrollment.product_id);
      totalScore += examData.score;
      totalExams += examData.count;

      if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
        latestActivity = examData.lastActivity;
      }
    } else {
      console.log(`[User ${userId}] [Course ${enrollment.product_id}] No progress data returned`);
    }
  }

  const averageScore = totalExams > 0 ? totalScore / totalExams : 0;

  console.log(`[User ${userId}] FINAL AGGREGATION: ${totalExams} exams, ${totalScore} total score, ${averageScore.toFixed(1)} avg`);

  return {
    user_id: userId,
    username,
    email,
    total_score: totalScore,
    exam_count: totalExams,
    average_score: Math.round(averageScore * 10) / 10, // Round to 1 decimal
    last_activity: latestActivity,
  };
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Starting Leaderboard Fetch ===');

    // Get configuration
    const apiBase = Deno.env.get('LEARNWORLDS_BASE_URL');
    const accessToken = Deno.env.get('LEARNWORLDS_ACCESS_TOKEN');
    const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');

    if (!apiBase || !accessToken || !clientId) {
      throw new Error('Missing required LearnWorlds configuration');
    }

    const baseUrl = apiBase.replace(/\/$/, '');
    console.log('API Base URL:', baseUrl);

    // Initialize rate limiter
    const rateLimiter = new RateLimiter(5); // Max 5 concurrent requests

    // Step 1: Fetch all users
    const users = await fetchAllUsers(baseUrl, accessToken, clientId);
    
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

    // Step 2: Process users in batches
    console.log('Aggregating exam scores for all users...');
    const batchSize = 10;
    const leaderboardData: AggregatedUserData[] = [];

    for (let i = 0; i < uniqueUsers.length; i += batchSize) {
      const batch = uniqueUsers.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueUsers.length / batchSize)}`);
      
      const batchResults = await Promise.all(
        batch.map(user => aggregateUserData(user, baseUrl, accessToken, clientId, rateLimiter))
      );
      
      leaderboardData.push(...batchResults);
    }

    // Step 3: Sort and rank
    const rankedData = leaderboardData
      .sort((a, b) => b.total_score - a.total_score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    console.log(`Aggregation complete: ${rankedData.length} users processed`);
    console.log(`Total exams found: ${rankedData.reduce((sum, u) => sum + u.exam_count, 0)}`);

    // Step 4: Update database cache
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Clear cache
    await supabase.from('leaderboard_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new data
    if (rankedData.length > 0) {
      const { error: upsertError } = await supabase
        .from('leaderboard_cache')
        .upsert(rankedData, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('Database upsert error:', upsertError);
        throw upsertError;
      }

      console.log('Cache updated successfully');
    }

    return new Response(
      JSON.stringify({
        success: true,
        leaderboard: rankedData,
        count: rankedData.length,
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
