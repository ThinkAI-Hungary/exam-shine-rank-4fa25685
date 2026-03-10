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

// LearnWorlds EU cluster API host (school context is provided via headers)
const API_BASE = 'https://api.eu-w3.learnworlds.com/v2';

// Previously we injected client_id into the URL; for the EU cluster we rely on headers.
function withClientId(url: string, _clientId: string): string {
  return url;
}

async function makeLearnWorldsRequest(
  url: string,
  accessToken: string,
  clientId: string,
  opts: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<any> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  // Safety logs before fetch
  console.log('Full URL:', url);
  console.log(`Calling LearnWorlds API: ${url}`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let resp: Response | null = null;
    try {
      const headers = {
        'Lw-Client': clientId.trim(),
        'Lw-Client-Id': clientId.trim(),
        'client_id': clientId.trim(),
        'Authorization': `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      // Log headers (mask token) so we can verify names are not stripped
      const maskedHeaders = {
        ...headers,
        Authorization: headers.Authorization ? 'Bearer ***' : '',
      };
      console.log('Request headers:', maskedHeaders);

      resp = await fetch(url, {
        method: 'GET',
        // Safety: do NOT follow 301/302 to HTML pages.
        redirect: 'manual',
        headers,
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

    // Block redirects explicitly (do not attempt to parse their HTML)
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      const body = await resp.text();
      console.error(`Redirect response ${resp.status} for ${url}. Location: ${location ?? '(none)'}`);
      console.error('Redirect body snippet (first 200 chars):', body.substring(0, 200));
      throw new Error(`LearnWorlds API redirected (${resp.status}). Refusing to follow.`);
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
    const url = withClientId(`${baseUrl}/courses?page=${page}&per_page=50`, clientId);
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

// Fetch bundles and find the course IDs belonging to a specific bundle by name
async function fetchBundleCourseIds(
  baseUrl: string,
  accessToken: string,
  clientId: string,
  bundleName: string
): Promise<string[]> {
  console.log(`Fetching bundles to find "${bundleName}"...`);
  const courseIds: string[] = [];
  let page = 1;
  let hasMore = true;
  let foundBundle: any = null;

  while (hasMore && !foundBundle) {
    const url = withClientId(`${baseUrl}/bundles?page=${page}&per_page=50`, clientId);
    try {
      const data = await makeLearnWorldsRequest(url, accessToken, clientId);
      const bundles = data.data || data || [];
      
      console.log(`[Bundles] Page ${page}: ${Array.isArray(bundles) ? bundles.length : 0} bundles`);
      
      if (!Array.isArray(bundles) || bundles.length === 0) {
        hasMore = false;
      } else {
        for (const bundle of bundles) {
          const title = bundle.title || bundle.name || '';
          const id = bundle.id || '';
          console.log(`[Bundle] id=${id}, title="${title}"`);
          
          if (title.toLowerCase().includes(bundleName.toLowerCase())) {
            foundBundle = bundle;
            console.log(`[Bundle] Found matching bundle: "${title}" (${id})`);
            console.log(`[Bundle] Full bundle data (first 2000 chars):`, JSON.stringify(bundle).substring(0, 2000));
            break;
          }
        }
        page++;
        if (page > 10) hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching bundles page ${page}:`, error);
      hasMore = false;
    }
  }

  if (!foundBundle) {
    console.error(`Bundle "${bundleName}" not found!`);
    return [];
  }

  // Extract course IDs from the bundle
  // LearnWorlds bundles typically have a "courses" array or "products" array
  const courses = foundBundle.courses || foundBundle.products || foundBundle.course_ids || [];
  if (Array.isArray(courses)) {
    for (const c of courses) {
      const cId = typeof c === 'string' ? c : (c.id || c.course_id || '');
      if (cId) courseIds.push(cId);
    }
  }
  
  // If no courses found in bundle data, try fetching bundle details
  if (courseIds.length === 0 && foundBundle.id) {
    console.log(`[Bundle] No courses in list response, fetching bundle details for ${foundBundle.id}...`);
    try {
      const detailUrl = withClientId(`${baseUrl}/bundles/${foundBundle.id}`, clientId);
      const detail = await makeLearnWorldsRequest(detailUrl, accessToken, clientId);
      console.log(`[Bundle] Detail response (first 2000 chars):`, JSON.stringify(detail).substring(0, 2000));
      
      const detailCourses = detail.courses || detail.products || detail.course_ids || detail.data?.courses || [];
      if (Array.isArray(detailCourses)) {
        for (const c of detailCourses) {
          const cId = typeof c === 'string' ? c : (c.id || c.course_id || '');
          if (cId) courseIds.push(cId);
        }
      }
    } catch (error) {
      console.error(`Error fetching bundle details:`, error);
    }
  }

  console.log(`[Bundle] "${bundleName}" contains ${courseIds.length} courses: ${JSON.stringify(courseIds)}`);
  return courseIds;
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
    const url = withClientId(`${baseUrl}/courses/${courseId}/content`, clientId);
    console.log(`[Course ${courseId}] Fetching content from: ${url}`);
    const data = await makeLearnWorldsRequest(url, accessToken, clientId);
    
    // DEBUG: Log raw content response structure
    console.log(`[DEBUG][Course ${courseId}] Content response keys:`, JSON.stringify(Object.keys(data)));
    console.log(`[DEBUG][Course ${courseId}] Content response (first 1500 chars):`, JSON.stringify(data).substring(0, 1500));
    
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
    
    console.log(`[DEBUG][Course ${courseId}] unitTitleMap size: ${unitTitleMap.size}`);
    if (unitTitleMap.size > 0) {
      const entries = Array.from(unitTitleMap.entries()).slice(0, 5);
      console.log(`[DEBUG][Course ${courseId}] unitTitleMap sample:`, JSON.stringify(entries));
    }
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
      const url = withClientId(`${baseUrl}/courses/${courseId}/grades?page=${page}&per_page=50`, clientId);
      console.log(`[Course ${courseId}] Fetching grades page ${page}: ${url}`);
      const data = await makeLearnWorldsRequest(url, accessToken, clientId);
      
      const grades = data.data || data || [];
      
      // DEBUG: Log first grade entry structure (only on first page of first fetch)
      if (page === 1 && Array.isArray(grades) && grades.length > 0) {
        console.log(`[DEBUG][Course ${courseId}] First grade entry keys:`, JSON.stringify(Object.keys(grades[0])));
        console.log(`[DEBUG][Course ${courseId}] First grade entry (first 1000 chars):`, JSON.stringify(grades[0]).substring(0, 1000));
        console.log(`[DEBUG][Course ${courseId}] learningUnit exists:`, !!grades[0].learningUnit);
        if (grades[0].learningUnit) {
          console.log(`[DEBUG][Course ${courseId}] learningUnit keys:`, JSON.stringify(Object.keys(grades[0].learningUnit)));
          console.log(`[DEBUG][Course ${courseId}] learningUnit value:`, JSON.stringify(grades[0].learningUnit));
        }
      }
      
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
    let examTitle = unitTitleMap.get(learningUnitId) || gradeTitle || `${courseTitle} - Vizsga`;
    
    // Extract completed timestamp
    const completedAt = normalizeTimestamp(
      grade.finished_at || grade.submittedTimestamp || grade.created || grade.modified
    );
    
    if (!completedAt) {
      console.log(`[Course ${courseId}] Skipping grade without timestamp for user ${userId}`);
      continue;
    }
    
    // Create unique exam_id using grade.id (unique per attempt)
    const examId = String(grade.id || learningUnitId || `${courseId}-unknown`);
    
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
    // Hardcode Client ID for this test to eliminate any secret mismatch.
    const clientId = '68664e416816e727f0a2d038';
    const accessToken = Deno.env.get('LEARNWORLDS_ACCESS_TOKEN')?.trim() || '';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!accessToken) {
      throw new Error('Missing LearnWorlds credentials (LEARNWORLDS_ACCESS_TOKEN)');
    }

    // Use the EU cluster API host.
    const baseUrl = API_BASE;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('=== Starting Course-Based Sync ===');
    console.log('Targeting EU Cluster with Client ID:', clientId);
    console.log('API Base:', baseUrl);

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

    // Deduplicate: keep last entry for each unique (user_id, exam_id, completed_at)
    const deduped = new Map<string, ExamResult>();
    for (const r of allExamResults) {
      const key = `${r.user_id}|${r.exam_id}|${r.completed_at}`;
      deduped.set(key, r); // last one wins
    }
    const dedupedResults = Array.from(deduped.values());
    totalExamResults = dedupedResults.length;

    // Track debug info for response
    const debugInfo: any = {
      totalResultsRaw: allExamResults.length,
      totalAfterDedup: dedupedResults.length,
      uniqueUsers: new Set(dedupedResults.map(r => r.user_id)).size,
      sampleResults: dedupedResults.slice(0, 3).map(r => ({
        user_id: r.user_id, exam_id: r.exam_id, score: r.score, completed_at: r.completed_at
      })),
      batchResults: [] as any[],
      upsertErrors: 0,
      upsertSuccess: 0,
      dbCountAfter: 0,
    };

    // Batch upsert deduplicated exam results
    if (dedupedResults.length > 0) {
      const batchSize = 100;
      
      for (let i = 0; i < dedupedResults.length; i += batchSize) {
        const batch = dedupedResults.slice(i, i + batchSize);
        
        const { data, error } = await supabase
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
            { onConflict: 'user_id,exam_id,completed_at' }
          )
          .select('id');
        
        const batchNum = Math.floor(i / batchSize) + 1;
        if (error) {
          debugInfo.upsertErrors++;
          debugInfo.batchResults.push({ batch: batchNum, error: JSON.stringify(error) });
        } else {
          debugInfo.upsertSuccess += data?.length || 0;
          debugInfo.batchResults.push({ batch: batchNum, sent: batch.length, returned: data?.length || 0 });
        }
      }
      
      // Verify actual count in DB
      const { count } = await supabase
        .from('exam_results')
        .select('*', { count: 'exact', head: true });
      debugInfo.dbCountAfter = count;
    }

    // Update leaderboard cache from the ACTUAL exam_results table (not just this sync batch)
    console.log('\n--- Step 4: Updating Leaderboard Cache ---');
    
    // Query actual aggregated stats from exam_results table
    const { data: aggregatedStats, error: aggError } = await supabase
      .from('exam_results')
      .select('user_id, username, score, completed_at');
    
    if (aggError) {
      console.error('Error fetching exam_results for leaderboard:', aggError);
    } else {
      // IMPORTANT: clear the cache first so users with 0 exams don't keep stale values
      const { error: clearError } = await supabase
        .from('leaderboard_cache')
        .delete()
        .neq('user_id', '');

      if (clearError) {
        console.error('Error clearing leaderboard cache:', clearError);
      } else {
        console.log('Cleared leaderboard_cache');
      }

      if (!aggregatedStats || aggregatedStats.length === 0) {
        console.log('No exam_results found; leaderboard_cache left empty.');
      } else {
        // Aggregate in memory
        const userScores = new Map<string, {
          username: string;
          total_score: number;
          exam_count: number;
          last_activity: string | null;
        }>();

        for (const row of aggregatedStats) {
          const existing = userScores.get(row.user_id) || {
            username: row.username,
            total_score: 0,
            exam_count: 0,
            last_activity: null,
          };

          existing.total_score += Number(row.score) || 0;
          existing.exam_count += 1;

          if (!existing.last_activity || row.completed_at > existing.last_activity) {
            existing.last_activity = row.completed_at;
          }

          userScores.set(row.user_id, existing);
        }

        // Build leaderboard entries
        const leaderboardEntries = Array.from(userScores.entries()).map(([user_id, data]) => ({
          user_id,
          total_score: Math.round(data.total_score),
          exam_count: data.exam_count,
          average_score: data.exam_count > 0 ? Math.round((data.total_score / data.exam_count) * 10) / 10 : 0,
          last_activity: data.last_activity,
        }));

        // Insert back into leaderboard_cache
        const { error } = await supabase
          .from('leaderboard_cache')
          .upsert(leaderboardEntries, { onConflict: 'user_id' });

        if (error) {
          console.error('Error updating leaderboard cache:', error);
        } else {
          console.log(`Updated leaderboard cache for ${leaderboardEntries.length} users`);
        }

        // Update ranks (sort by average_score descending)
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
    }

    // Step 5: Fetch ALL users from LearnWorlds list endpoint (paginated, ~20/page)
    // This is much more efficient than individual detail calls (100 pages vs 2000 calls for 2000 users)
    console.log('\n--- Step 5: Syncing User Tags via List Endpoint ---');
    let usersUpdated = 0;
    
    try {
      const allLearnWorldsUsers: any[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const url = `${API_BASE}/users?page=${page}&per_page=100`;
        console.log(`Fetching users list page ${page}...`);
        
        try {
          const data = await makeLearnWorldsRequest(url, accessToken, clientId);
          apiCallCount++;
          
          const users = data.data || data || [];
          
          if (!Array.isArray(users) || users.length === 0) {
            hasMore = false;
          } else {
            allLearnWorldsUsers.push(...users);
            console.log(`Fetched users page ${page}: ${users.length} users (total so far: ${allLearnWorldsUsers.length})`);
            page++;
            
            // Safety limit for very large platforms
            if (page > 200) {
              console.warn('Reached user page limit of 200 (4000 users)');
              hasMore = false;
            }
          }
        } catch (error) {
          console.error(`Error fetching users page ${page}:`, error instanceof Error ? error.message : error);
          hasMore = false;
        }
      }
      
      console.log(`Total LearnWorlds users fetched: ${allLearnWorldsUsers.length} in ${page - 1} pages / ${page - 1} API calls`);
      
      // Map user data for upsert
      const userDataToUpsert: any[] = [];
      
      for (const user of allLearnWorldsUsers) {
        const userId = String(user.id || user.user_id || '');
        if (!userId) continue;
        
        const tags = Array.isArray(user.tags) ? user.tags : [];
        const aruhaz = tags.filter((tag: string) => typeof tag === 'string' && tag.startsWith('cf_aruhaz_'));
        const beosztas = tags.filter((tag: string) => typeof tag === 'string' && tag.startsWith('cf_munkakorod'));
        
        // Extract employment start date from fields
        const fields = user.fields || {};
        const munkaviszonyod_kezdete = fields.cf_munkaviszonyodkezdete 
          || fields.cf_munkaviszonyod_kezdete
          || fields['cf_munkaviszonyodkezdete']
          || null;
        let startOfEmpl: string | null = null;
        if (munkaviszonyod_kezdete) {
          try {
            startOfEmpl = new Date(munkaviszonyod_kezdete).toISOString().split('T')[0];
          } catch (_) { /* invalid date */ }
        }
        
        userDataToUpsert.push({
          user_id: userId,
          username: user.username || user.name || user.email?.split('@')[0] || 'Unknown',
          email: user.email || null,
          aruhaz,
          beosztas,
          start_of_empl: startOfEmpl,
          updated_at: new Date().toISOString(),
        });
      }
      
      // Deduplicate by user_id (API can return duplicates across pages)
      const userMap = new Map<string, any>();
      for (const u of userDataToUpsert) {
        userMap.set(u.user_id, u); // last occurrence wins
      }
      const dedupedUsers = Array.from(userMap.values());
      
      console.log(`Prepared ${userDataToUpsert.length} users, deduplicated to ${dedupedUsers.length}`);
      
      if (dedupedUsers.length > 0) {
        // Log sample for debugging
        console.log('Sample user data:', JSON.stringify(dedupedUsers[0]));
        
        // Upsert in batches of 100
        const upsertBatchSize = 100;
        for (let i = 0; i < dedupedUsers.length; i += upsertBatchSize) {
          const batch = dedupedUsers.slice(i, i + upsertBatchSize);
          const { error: userUpsertError } = await supabase
            .from('users')
            .upsert(batch, { onConflict: 'user_id' });
          
          if (userUpsertError) {
            console.error(`Error upserting user batch ${Math.floor(i / upsertBatchSize) + 1}:`, JSON.stringify(userUpsertError));
          } else {
            console.log(`Upserted user batch ${Math.floor(i / upsertBatchSize) + 1}: ${batch.length} users`);
          }
        }
        
        usersUpdated = dedupedUsers.length;
        console.log(`Successfully synced ${usersUpdated} users`);
        
        const withAruhaz = dedupedUsers.filter((u: any) => u.aruhaz.length > 0);
        const withBeosztas = dedupedUsers.filter((u: any) => u.beosztas.length > 0);
        console.log(`Users with aruhaz tags: ${withAruhaz.length}, with beosztas tags: ${withBeosztas.length}`);
      }
    } catch (error) {
      console.error('User tag sync failed:', error instanceof Error ? error.message : error);
    }

    const duration = Date.now() - startTime;
    console.log(`\n=== Sync Complete ===`);
    console.log(`Duration: ${duration}ms`);
    console.log(`API calls: ${apiCallCount}`);
    console.log(`Courses processed: ${coursesProcessed}`);
    console.log(`Exam results saved: ${totalExamResults}`);
    console.log(`Users updated: ${usersUpdated}`);

    return new Response(
      JSON.stringify({
        success: true,
        apiCalls: apiCallCount,
        coursesProcessed,
        examResultsSaved: totalExamResults,
        usersUpdated,
        durationMs: duration,
        debug: debugInfo,
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
