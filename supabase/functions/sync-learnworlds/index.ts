import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// ============= TYPES =============
interface CourseContent {
  id: string;
  title?: string;
  name?: string;
  type?: string;
}

interface GradeEntry {
  id: string;
  user_id: string;
  grade?: number | string;
  score_percentage?: number;
  finished_at?: number;
  submittedTimestamp?: number;
  created?: number;
  modified?: number;
  learningUnit?: {
    id?: string;
    title?: string;
    name?: string;
  };
  user?: {
    id?: string;
    username?: string;
    email?: string;
    name?: string;
  };
}

interface ExamResult {
  user_id: string;
  username: string;
  email: string | null;
  course_id: string;
  course_title: string;
  exam_id: string;
  exam_title: string;
  score: number;
  completed_at: string;
  time_spent_seconds: number | null;
}

// ============= API HELPERS =============

// Use global LearnWorlds API cluster - school identification via Lw-Client-Id header
const API_BASE = 'https://api.eu-w3.learnworlds.com/v2';

async function makeLearnWorldsRequest(
  url: string,
  accessToken: string,
  clientId: string,
  opts: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<any> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  // Safety log before fetch
  console.log(`Calling LearnWorlds API: ${url}`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let resp: Response | null = null;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Lw-Client-Id': clientId.trim(),
          'Authorization': `Bearer ${accessToken.trim()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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

    // Check response status before parsing
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Status: ${resp.status}. Body snippet: ${text.substring(0, 500)}`);

      // Handle rate limit
      if (resp.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(resp.headers.get('Retry-After'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5000)
          : Math.min(baseDelayMs * Math.pow(2, attempt), 5000);
        console.warn(`429 Too Many Requests for ${url}. Waiting ${backoff}ms before retry.`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      // Retry on transient 5xx
      if (resp.status >= 500 && resp.status < 600 && attempt < maxRetries) {
        const backoff = baseDelayMs * Math.pow(2, attempt);
        console.warn(`Server ${resp.status} for ${url}. Retry in ${backoff}ms.`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      throw new Error(`LearnWorlds API returned ${resp.status}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const body = await resp.text();
      console.error('Expected JSON but got HTML. First 200 chars:', body.substring(0, 200));
      throw new Error('API redirected to a non-JSON page. Check subdomain/auth.');
    }

    return await resp.json();
  }

  throw new Error('Unreachable');
}

// Fetch all courses with pagination
async function fetchAllCourses(
  baseUrl: string,
  accessToken: string,
  clientId: string
): Promise<Array<{ id: string; title: string }>> {
  console.log('Fetching all courses...');
  const allCourses: Array<{ id: string; title: string }> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}/courses?page=${page}&per_page=50`;
    try {
      const data = await makeLearnWorldsRequest(url, accessToken, clientId);
      const courses = data.data || data || [];
      
      if (!Array.isArray(courses) || courses.length === 0) {
        hasMore = false;
      } else {
        for (const c of courses) {
          const id = c.id || c.course_id;
          const title = c.title || c.name || id;
          if (id) {
            allCourses.push({ id, title });
          }
        }
        console.log(`Fetched courses page ${page}: ${courses.length} courses`);
        page++;
        
        if (page > 20) {
          console.warn('Reached course page limit of 20');
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

// Fetch course content to get unit titles (assessments/questionnaires)
async function fetchCourseContent(
  baseUrl: string,
  courseId: string,
  accessToken: string,
  clientId: string
): Promise<Map<string, string>> {
  const unitTitleMap = new Map<string, string>();
  
  try {
    const url = `${baseUrl}/courses/${courseId}/content`;
    console.log(`[Course ${courseId}] Fetching content from: ${url}`);
    const data = await makeLearnWorldsRequest(url, accessToken, clientId);
    
    // The content endpoint returns sections with units
    const sections = data.sections || data.data || data || [];
    
    // Process sections to find assessments and questionnaires
    const processItems = (items: any[], depth = 0) => {
      if (!Array.isArray(items)) return;
      
      for (const item of items) {
        const itemType = item.type || item.unit_type || '';
        const itemId = item.id || item.unit_id;
        const itemTitle = item.title || item.name || 'Untitled';
        
        // Check if it's an assessment or questionnaire
        if (itemId && (
          itemType.toLowerCase().includes('assessment') ||
          itemType.toLowerCase().includes('questionnaire') ||
          itemType.toLowerCase().includes('exam') ||
          itemType.toLowerCase().includes('quiz')
        )) {
          unitTitleMap.set(String(itemId), itemTitle);
          console.log(`[Course ${courseId}] Found assessment: ${itemId} -> "${itemTitle}"`);
        }
        
        // Also store all units as fallback
        if (itemId && itemTitle) {
          unitTitleMap.set(String(itemId), itemTitle);
        }
        
        // Recurse into nested items
        if (item.units) processItems(item.units, depth + 1);
        if (item.items) processItems(item.items, depth + 1);
        if (item.children) processItems(item.children, depth + 1);
        if (item.learning_units) processItems(item.learning_units, depth + 1);
      }
    };
    
    processItems(sections);
    
    console.log(`[Course ${courseId}] Content mapping complete: ${unitTitleMap.size} units mapped`);
  } catch (error) {
    console.warn(`[Course ${courseId}] Failed to fetch content:`, error instanceof Error ? error.message : error);
  }
  
  return unitTitleMap;
}

// Fetch all grades for a course (returns all students' results)
async function fetchCourseGrades(
  baseUrl: string,
  courseId: string,
  accessToken: string,
  clientId: string
): Promise<GradeEntry[]> {
  const allGrades: GradeEntry[] = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const url = `${baseUrl}/courses/${courseId}/grades?page=${page}&per_page=50`;
      console.log(`[Course ${courseId}] Fetching grades page ${page}: ${url}`);
      const data = await makeLearnWorldsRequest(url, accessToken, clientId);
      
      const grades = data.data || data || [];
      
      if (!Array.isArray(grades) || grades.length === 0) {
        hasMore = false;
      } else {
        allGrades.push(...grades);
        console.log(`[Course ${courseId}] Fetched grades page ${page}: ${grades.length} entries`);
        page++;
        
        if (page > 50) {
          console.warn(`[Course ${courseId}] Reached grades page limit of 50`);
          hasMore = false;
        }
      }
    } catch (error) {
      console.warn(`[Course ${courseId}] Failed to fetch grades page ${page}:`, error instanceof Error ? error.message : error);
      hasMore = false;
    }
  }
  
  console.log(`[Course ${courseId}] Total grades fetched: ${allGrades.length}`);
  return allGrades;
}

// Normalize timestamp to ISO string
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
      return timestamp;
    }
  } catch (error) {
    console.warn('Failed to normalize timestamp:', timestamp);
  }

  return null;
}

// Process grades and create exam results
function processGrades(
  grades: GradeEntry[],
  courseId: string,
  courseTitle: string,
  unitTitleMap: Map<string, string>
): ExamResult[] {
  const results: ExamResult[] = [];
  
  for (const grade of grades) {
    // Extract user info
    const userId = String(grade.user_id || grade.user?.id || '');
    if (!userId) {
      console.log(`[Course ${courseId}] Skipping grade without user_id`);
      continue;
    }
    
    const username = grade.user?.username || grade.user?.name || grade.user?.email?.split('@')[0] || 'Unknown';
    const email = grade.user?.email || null;
    
    // Extract score
    let score: number | null = null;
    if (typeof grade.score_percentage === 'number') {
      score = grade.score_percentage;
    } else if (typeof grade.grade === 'number') {
      score = grade.grade;
    } else if (typeof grade.grade === 'string') {
      const parsed = parseFloat(grade.grade);
      score = isNaN(parsed) ? null : parsed;
    }
    
    if (score === null) {
      console.log(`[Course ${courseId}] Skipping grade without score for user ${userId}`);
      continue;
    }
    
    // Extract exam ID and title
    const learningUnitId = String(grade.learningUnit?.id || grade.id || '');
    const gradeTitle = grade.learningUnit?.title || grade.learningUnit?.name;
    
    // Look up title from content mapping, fallback to grade data
    let examTitle = unitTitleMap.get(learningUnitId) || gradeTitle || 'Untitled Exam';
    
    // Extract completed timestamp
    const completedAt = normalizeTimestamp(
      grade.finished_at || grade.submittedTimestamp || grade.created || grade.modified
    );
    
    if (!completedAt) {
      console.log(`[Course ${courseId}] Skipping grade without timestamp for user ${userId}`);
      continue;
    }
    
    // Create unique exam_id
    const examId = learningUnitId || `${courseId}-${grade.id}`;
    
    results.push({
      user_id: userId,
      username,
      email,
      course_id: courseId,
      course_title: courseTitle,
      exam_id: examId,
      exam_title: examTitle,
      score,
      completed_at: completedAt,
      time_spent_seconds: null, // LearnWorlds doesn't provide this in grades
    });
    
    console.log(`[Course ${courseId}] ✓ Exam result: user=${username}, exam="${examTitle}", score=${score}`);
  }
  
  return results;
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let apiCallCount = 0;
  let coursesProcessed = 0;
  let totalExamResults = 0;

  try {
    // Get credentials from environment
    const subdomain = Deno.env.get('LEARNWORLDS_SUBDOMAIN');
    const clientId = Deno.env.get('LEARNWORLDS_CLIENT_ID');
    const accessToken = Deno.env.get('LEARNWORLDS_ACCESS_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!clientId || !accessToken) {
      throw new Error('Missing LearnWorlds credentials (LEARNWORLDS_CLIENT_ID or LEARNWORLDS_ACCESS_TOKEN)');
    }

    // Use global API cluster - school identification via Lw-Client-Id header
    const baseUrl = API_BASE;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('=== Starting Course-Based Sync ===');
    console.log(`Client ID: ${clientId.substring(0, 8)}...`);
    console.log(`API Base: ${baseUrl}`);

    // Parse options
    let options: { courseTitleContains?: string } = {};
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        options = body.options || body || {};
      } catch (_) { /* no-op */ }
    }

    // Step 1: Fetch all courses
    console.log('\n--- Step 1: Fetching All Courses ---');
    const allCourses = await fetchAllCourses(baseUrl, accessToken, clientId);
    apiCallCount += Math.ceil(allCourses.length / 50); // Estimate API calls for course fetch
    
    // Filter courses if needed
    let coursesToProcess = allCourses;
    if (options.courseTitleContains) {
      const filter = options.courseTitleContains.toLowerCase();
      coursesToProcess = allCourses.filter(c => c.title.toLowerCase().includes(filter));
      console.log(`Filtered to ${coursesToProcess.length} courses containing "${options.courseTitleContains}"`);
    }

    console.log(`Will process ${coursesToProcess.length} courses`);

    // Step 2 & 3: Iterate through courses
    const allExamResults: ExamResult[] = [];
    
    for (const course of coursesToProcess) {
      console.log(`\n--- Processing Course: ${course.title} (${course.id}) ---`);
      
      // 2A: Fetch course content to get unit titles
      const unitTitleMap = await fetchCourseContent(baseUrl, course.id, accessToken, clientId);
      apiCallCount++;
      
      // 2B: Fetch all grades for this course
      const grades = await fetchCourseGrades(baseUrl, course.id, accessToken, clientId);
      apiCallCount += Math.ceil(grades.length / 50) || 1;
      
      // 2C: Process grades and create exam results
      const examResults = processGrades(grades, course.id, course.title, unitTitleMap);
      allExamResults.push(...examResults);
      
      coursesProcessed++;
      console.log(`[Course ${course.id}] Processed: ${examResults.length} exam results`);
    }

    console.log(`\n--- Step 3: Saving ${allExamResults.length} Exam Results ---`);
    totalExamResults = allExamResults.length;

    // Batch upsert exam results
    if (allExamResults.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < allExamResults.length; i += batchSize) {
        const batch = allExamResults.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('exam_results')
          .upsert(
            batch.map(r => ({
              user_id: r.user_id,
              username: r.username,
              email: r.email,
              course_id: r.course_id,
              course_title: r.course_title,
              exam_id: r.exam_id,
              exam_title: r.exam_title,
              score: r.score,
              completed_at: r.completed_at,
              time_spent_seconds: r.time_spent_seconds,
            })),
            { onConflict: 'user_id,exam_id' }
          );
        
        if (error) {
          console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
        } else {
          console.log(`Upserted batch ${i / batchSize + 1}: ${batch.length} records`);
        }
      }
    }

    // Update leaderboard cache
    console.log('\n--- Step 4: Updating Leaderboard Cache ---');
    
    // Aggregate scores by user
    const userScores = new Map<string, {
      username: string;
      email: string | null;
      total_score: number;
      exam_count: number;
      last_activity: string | null;
    }>();
    
    for (const result of allExamResults) {
      const existing = userScores.get(result.user_id) || {
        username: result.username,
        email: result.email,
        total_score: 0,
        exam_count: 0,
        last_activity: null,
      };
      
      existing.total_score += result.score;
      existing.exam_count += 1;
      
      if (!existing.last_activity || result.completed_at > existing.last_activity) {
        existing.last_activity = result.completed_at;
      }
      
      userScores.set(result.user_id, existing);
    }
    
    // Upsert to leaderboard_cache
    const leaderboardEntries = Array.from(userScores.entries()).map(([user_id, data]) => ({
      user_id,
      total_score: Math.round(data.total_score),
      exam_count: data.exam_count,
      average_score: data.exam_count > 0 ? Math.round((data.total_score / data.exam_count) * 10) / 10 : 0,
      last_activity: data.last_activity,
    }));
    
    if (leaderboardEntries.length > 0) {
      const { error } = await supabase
        .from('leaderboard_cache')
        .upsert(leaderboardEntries, { onConflict: 'user_id' });
      
      if (error) {
        console.error('Error updating leaderboard cache:', error);
      } else {
        console.log(`Updated leaderboard cache for ${leaderboardEntries.length} users`);
      }
      
      // Update ranks
      const { data: allLeaderboard } = await supabase
        .from('leaderboard_cache')
        .select('id, average_score')
        .order('average_score', { ascending: false });
      
      if (allLeaderboard) {
        for (let i = 0; i < allLeaderboard.length; i++) {
          await supabase
            .from('leaderboard_cache')
            .update({ rank: i + 1 })
            .eq('id', allLeaderboard[i].id);
        }
        console.log(`Updated ranks for ${allLeaderboard.length} users`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n=== Sync Complete ===`);
    console.log(`Duration: ${duration}ms`);
    console.log(`API calls: ${apiCallCount}`);
    console.log(`Courses processed: ${coursesProcessed}`);
    console.log(`Exam results saved: ${totalExamResults}`);

    return new Response(
      JSON.stringify({
        success: true,
        apiCalls: apiCallCount,
        coursesProcessed,
        examResultsSaved: totalExamResults,
        usersUpdated: userScores.size,
        durationMs: duration,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Sync failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        apiCalls: apiCallCount,
        coursesProcessed,
        examResultsSaved: totalExamResults,
        durationMs: Date.now() - startTime,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
