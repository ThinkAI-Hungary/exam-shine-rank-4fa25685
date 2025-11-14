import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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
  course_id?: string;
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
  score_source?: 'exact' | 'estimated';
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
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 500; // keep small to avoid timeouts

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
      const rawBackoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
      const backoff = Math.min(rawBackoff, 1500); // clamp to 1.5s max to avoid timeouts
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
    const url = `${baseUrl}/v2/users/${userId}/courses/${courseId}/progress`;
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

async function fetchCourseGrades(
  baseUrl: string,
  courseId: string,
  accessToken: string,
  clientId: string
): Promise<any> {
  try {
    const url = `${baseUrl}/v2/courses/${courseId}/grades`;
    console.log(`[Course ${courseId}] Fetching all grades from: ${url}`);
    const data = await makeLearnWorldsRequest(url, accessToken, clientId);
    console.log(`[Course ${courseId}] Grades response structure:`, JSON.stringify({
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : [],
      dataLength: Array.isArray(data?.data) ? data.data.length : 'N/A',
      sampleEntry: data?.data?.[0] ? Object.keys(data.data[0]) : []
    }));
    return data;
  } catch (error) {
    console.warn(`Failed to fetch grades for course ${courseId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// ============= DATA AGGREGATION =============
interface ExamResult {
  exam_id: string;
  exam_title: string;
  score: number;
  completed_at: string;
  course_id: string;
  course_title: string;
  user_id: string;
  username: string;
  email: string | null;
  score_source?: 'exact' | 'estimated';
}

/**
 * Count completed assessments from progress_per_section_unit
 */
function countCompletedAssessments(progressData: any): number {
  let assessmentCount = 0;
  
  if (progressData.progress_per_section_unit && Array.isArray(progressData.progress_per_section_unit)) {
    for (const section of progressData.progress_per_section_unit) {
      if (section.units && Array.isArray(section.units)) {
        for (const unit of section.units) {
          if (unit.unit_type === 'assessmentV2' && unit.unit_status === 'completed') {
            assessmentCount++;
          }
        }
      }
    }
  }
  
  return assessmentCount;
}

/**
 * Extract exam scores from course grades endpoint data
 * The grades endpoint returns all users' grades for a course
 */
function extractExamScoresFromGrades(
  gradesData: any,
  userId: string,
  username: string,
  email: string | null,
  courseId: string
): { score: number; count: number; lastActivity: string | null; exams: ExamResult[] } {
  console.log(`[User ${userId}] [Course ${courseId}] Extracting exam scores from grades data`);
  
  if (!gradesData || !gradesData.data || !Array.isArray(gradesData.data)) {
    console.log(`[User ${userId}] [Course ${courseId}] No grades data found`);
    return { score: 0, count: 0, lastActivity: null, exams: [] };
  }
  
  // Find this user's grades in the data
  const userGrades = gradesData.data.find((entry: any) => String(entry.user_id) === userId);
  
  if (!userGrades) {
    console.log(`[User ${userId}] [Course ${courseId}] User not found in grades data`);
    return { score: 0, count: 0, lastActivity: null, exams: [] };
  }
  
  console.log(`[User ${userId}] [Course ${courseId}] Found user grades:`, JSON.stringify({
    keys: Object.keys(userGrades),
    hasAssessments: !!userGrades.assessments,
    assessmentCount: Array.isArray(userGrades.assessments) ? userGrades.assessments.length : 'N/A'
  }));
  
  let totalScore = 0;
  let examCount = 0;
  let lastActivity: string | null = null;
  const exams: ExamResult[] = [];
  const courseTitle = userGrades.course_title || userGrades.course_name || courseId;
  
  // Parse assessments/exams from the grades data
  if (userGrades.assessments && Array.isArray(userGrades.assessments)) {
    for (const assessment of userGrades.assessments) {
      console.log(`[User ${userId}] [Course ${courseId}] Assessment:`, JSON.stringify({
        id: assessment.id,
        title: assessment.title || assessment.name,
        type: assessment.type,
        score: assessment.score,
        grade: assessment.grade,
        completed_at: assessment.completed_at
      }));
      
      // Check if this is a valid exam/assessment with a score
      const score = typeof assessment.score === 'number' ? assessment.score : 
                    typeof assessment.grade === 'number' ? assessment.grade : null;
      
      if (score !== null) {
        const completedAt = normalizeTimestamp(assessment.completed_at || assessment.submitted_at);
        console.log(`[User ${userId}] [Course ${courseId}] ✓ EXAM FOUND (from grades): score=${score}, title=${assessment.title || assessment.name}`);
        
        totalScore += score;
        examCount++;
        
        if (completedAt) {
          exams.push({
            exam_id: String(assessment.id || assessment.assessment_id || `${courseId}-${assessment.title}`),
            exam_title: assessment.title || assessment.name || 'Untitled Exam',
            score: score,
            completed_at: completedAt,
            course_id: courseId,
            course_title: courseTitle,
            user_id: userId,
            username: username,
            email: email,
            score_source: 'exact',
          });
          
          if (!lastActivity || completedAt > lastActivity) {
            lastActivity = completedAt;
          }
        }
      }
    }
  }
  
  console.log(`[User ${userId}] [Course ${courseId}] Grades extraction complete: ${examCount} exams, ${totalScore} total score`);
  return { score: totalScore, count: examCount, lastActivity, exams };
}

function extractExamScores(progress: CourseProgress, userId: string, username: string, email: string | null, courseId: string): { score: number; count: number; lastActivity: string | null; exams: ExamResult[] } {
  let totalScore = 0;
  let examCount = 0;
  let lastActivity: string | null = null;
  const exams: ExamResult[] = [];

  if (!progress.activities || !Array.isArray(progress.activities)) {
    console.log(`[User ${userId}] [Course ${courseId}] No activities array found`);
    return { score: 0, count: 0, lastActivity: null, exams: [] };
  }

  console.log(`[User ${userId}] [Course ${courseId}] Inspecting ${progress.activities.length} activities`);
  
  const courseTitle = courseId; // Course title not available in progress object
  
  
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
      const completedAt = normalizeTimestamp(activity.completed_at);
      console.log(`[User ${userId}] [Course ${courseId}] ✓ EXAM FOUND: score=${activity.score}, title=${activity.title}`);
      totalScore += activity.score;
      examCount++;

      // Store exam result
      if (completedAt) {
        exams.push({
          exam_id: String(activity.id || `${courseId}-${activity.title}`),
          exam_title: activity.title || 'Untitled Exam',
          score: activity.score,
          completed_at: completedAt,
          course_id: courseId,
          course_title: courseTitle,
          user_id: userId,
          username: username,
          email: email,
        });
      }

      // Track most recent activity
      if (completedAt && (!lastActivity || completedAt > lastActivity)) {
        lastActivity = completedAt;
      }
    }
  }

  console.log(`[User ${userId}] [Course ${courseId}] Exam extraction complete: ${examCount} exams, ${totalScore} total score`);
  return { score: totalScore, count: examCount, lastActivity, exams };
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
  courseIds: string[],
  apiCallTracker: { count: number },
  allExamResults: ExamResult[],
  courseGradesCache: Map<string, any>
): Promise<AggregatedUserData> {
  const userId = String(user.id);
  const username = user.username || user.name || user.email?.split('@')[0] || 'Unknown';
  const email = user.email || null;

  console.log(`\n=== Processing User: ${username} (${userId}) ===`);
  
  // Step 1: Fetch all course progress to get list of courses (1 API call)
  const allProgress = await rateLimiter.run(() => {
    apiCallTracker.count++;
    return fetchAllCourseProgress(baseUrl, userId, accessToken, clientId);
  });
  
  console.log(`[User ${userId}] All-courses progress count: ${allProgress.length}`);
  
  // ENHANCED LOGGING: Inspect full progress structure
  if (allProgress.length > 0) {
    const sampleProgress = allProgress[0];
    console.log(`[User ${userId}] Progress sample keys: ${JSON.stringify(Object.keys(sampleProgress))}`);
    
    // Log full structure for debugging
    if (username.includes('Benke') || allProgress.length <= 3) {
      console.log(`[User ${userId}] FULL PROGRESS SAMPLE:\n${JSON.stringify(sampleProgress, null, 2)}`);
    }
    
    // Specifically examine progress_per_section_unit
    if ('progress_per_section_unit' in sampleProgress) {
      console.log(`[User ${userId}] progress_per_section_unit type: ${typeof sampleProgress.progress_per_section_unit}`);
      console.log(`[User ${userId}] progress_per_section_unit structure:\n${JSON.stringify(sampleProgress.progress_per_section_unit, null, 2)}`);
    } else {
      console.log(`[User ${userId}] ⚠️ progress_per_section_unit field NOT FOUND in progress data`);
    }
    
    // Check for any fields that might contain exam/activity data
    const possibleActivityFields = ['activities', 'assessments', 'exams', 'units', 'sections', 'progress_per_section_unit'];
    const foundFields = possibleActivityFields.filter(field => field in sampleProgress);
    console.log(`[User ${userId}] Found potential activity fields: ${foundFields.join(', ') || 'NONE'}`);
  }
  
  let totalScore = 0;
  let totalExams = 0;
  let latestActivity: string | null = null;
  
  // Step 2: For each course, fetch detailed progress with activities (1 API call per course)
  let cachedEnrollments: Enrollment[] | null = null;
  for (const courseProgress of allProgress) {
    const courseId = courseProgress.course_id;
    
    // Skip if no course_id
    if (!courseId) {
      console.log(`[User ${userId}] Skipping progress entry without course_id`);
      continue;
    }
    
    // Skip if not in allowed course list (when filtering is active)
    if (courseIds.length > 0 && !courseIds.includes(courseId)) {
      console.log(`[User ${userId}] Skipping course ${courseId} (not in filter list)`);
      continue;
    }
    
    // Try to get exam scores from grades cache first (more efficient and accurate)
    let examData: { score: number; count: number; lastActivity: string | null; exams: ExamResult[] } = { 
      score: 0, 
      count: 0, 
      lastActivity: null, 
      exams: [] 
    };
    const gradesData = courseGradesCache.get(courseId);
    
    if (gradesData) {
      console.log(`[User ${userId}] [Course ${courseId}] Trying grades cache first`);
      examData = extractExamScoresFromGrades(gradesData, userId, username, email, courseId);
    }
    
    // If no exam data from grades, fall back to detailed progress endpoint
    if (examData.count === 0) {
      console.log(`[User ${userId}] [Course ${courseId}] Falling back to detailed progress endpoint`);
      const detailedProgress = await rateLimiter.run(() => {
        apiCallTracker.count++;
        return fetchCourseProgress(baseUrl, userId, courseId, accessToken, clientId);
      });
      
      if (detailedProgress) {
        examData = extractExamScores(detailedProgress, userId, username, email, courseId);
      }
    }
    
    // Add exam data to totals
    if (examData.count > 0) {
      totalScore += examData.score;
      totalExams += examData.count;
      
      // Collect exam results for bulk insert
      for (const exam of examData.exams) {
        allExamResults.push({
          ...exam,
          user_id: userId,
          username,
          email,
        } as any);
      }
      
      if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
        latestActivity = examData.lastActivity;
      }
    } else if (courseIds.length > 0) {
      // Fallback: try enrollment product_ids
      if (!cachedEnrollments) {
        cachedEnrollments = await rateLimiter.run(() => {
          apiCallTracker.count++;
          return fetchUserEnrollments(baseUrl, userId, accessToken, clientId);
        });
        console.log(`[User ${userId}] Fallback enrollments: ${cachedEnrollments.length}`);
      }
      let matchedFromEnrollments = false;
      for (const enr of cachedEnrollments) {
        if (!enr?.product_id) continue;
        const altProgress = await rateLimiter.run(() => {
          apiCallTracker.count++;
          return fetchCourseProgress(baseUrl, userId, String(enr.product_id), accessToken, clientId);
        });
        if (altProgress?.activities && altProgress.activities.length > 0) {
          console.log(`[User ${userId}] Fallback matched course ${courseId} -> ${enr.product_id}`);
          const examData = extractExamScores(altProgress, userId, username, email, String(enr.product_id));
          totalScore += examData.score;
          totalExams += examData.count;
          for (const exam of examData.exams) {
            allExamResults.push({
              ...exam,
              user_id: userId,
              username,
              email,
            } as any);
          }
          if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
            latestActivity = examData.lastActivity;
          }
          matchedFromEnrollments = true;
          break;
        }
      }
      if (!matchedFromEnrollments) {
        const avg = Number((courseProgress as any).average_score_rate ?? 0);
        if (avg > 0) {
          // Enhanced fallback: count completed assessments
          const completedExamCount = countCompletedAssessments(courseProgress);
          
          if (completedExamCount > 0) {
            // Use counted exams with average score
            const estimatedTotal = avg * completedExamCount;
            totalScore += estimatedTotal;
            totalExams += completedExamCount;
            
            console.log(
              `[User ${userId}] ESTIMATED from ${completedExamCount} assessments: ` +
              `course=${courseId}, avg=${avg}%, total=${estimatedTotal}`
            );
          } else {
            // Last resort: use average_score_rate with 1 exam assumption
            totalScore += avg;
            totalExams += 1;
            
            console.log(`[User ${userId}] Derived score from progress (no activities): course=${courseId}, avg=${avg}`);
          }
          
          const derivedTs = normalizeTimestamp((courseProgress as any).completed_at);
          if (derivedTs && (!latestActivity || derivedTs > latestActivity)) {
            latestActivity = derivedTs;
          }
        }
      }
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
    score_source: (allExamResults.length > 0 ? 'exact' : 'estimated') as 'exact' | 'estimated',
  };
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // API call counter (using object to pass by reference)
  const apiCallTracker = { count: 0 };
  const makeTrackedRequest = async (url: string, accessToken: string, clientId: string) => {
    apiCallTracker.count++;
    return makeLearnWorldsRequest(url, accessToken, clientId);
  };

  // Helper to resolve course IDs by matching title substring (case-insensitive)
  const fetchCourseIdsByTitleSubstring = async (
    baseUrl: string,
    term: string,
    accessToken: string,
    clientId: string
  ): Promise<string[]> => {
    const ids: string[] = [];
    let page = 1;
    let hasMore = true;
    const needle = term.toLowerCase();

    while (hasMore) {
      const url = `${baseUrl}/v2/courses?page=${page}&per_page=50`;
      try {
        const data = await makeTrackedRequest(url, accessToken, clientId);
        const courses = data.data || data || [];
        if (!Array.isArray(courses) || courses.length === 0) {
          hasMore = false;
        } else {
          for (const c of courses) {
            const title = String(c.title || c.name || '').toLowerCase();
            if (title.includes(needle)) {
              const id = c.id || c.course_id;
              if (id && !ids.includes(id)) ids.push(id);
            }
          }
          page++;
          if (page > 20) {
            console.warn('Reached course page limit while title-matching');
            hasMore = false;
          }
        }
      } catch (e) {
        console.warn('Failed fetching courses page for title match:', e);
        hasMore = false;
      }
    }

    console.log(`Course title filter matched ${ids.length} course IDs for "${term}": ${JSON.stringify(ids)}`);
    return ids;
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
    let filterCourseIds: string[] = Array.isArray(options?.options?.courseIds) ? options.options.courseIds.map(String) : [];
    const courseTitleContains: string = typeof options?.options?.courseTitleContains === 'string' ? String(options.options.courseTitleContains) : '';
    const isSelectiveRefresh = filterUserIds.length > 0;
    
    if (filterCourseIds.length > 0) {
      console.log(`COURSE FILTER: Only processing courses: ${filterCourseIds.join(', ')}`);
    } else if (courseTitleContains) {
      console.log(`COURSE TITLE FILTER: Matching courses with title containing: "${courseTitleContains}"`);
    }

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

    // Resolve course title filter to concrete IDs if needed
    if (filterCourseIds.length === 0 && courseTitleContains) {
      filterCourseIds = await fetchCourseIdsByTitleSubstring(baseUrl, courseTitleContains, accessToken, clientId);
      if (filterCourseIds.length === 0) {
        console.warn(`No courses matched title filter "${courseTitleContains}"`);
      } else {
        console.log(`✅ RESOLVED TITLE "${courseTitleContains}" TO ${filterCourseIds.length} COURSE(S): ${filterCourseIds.join(', ')}`);
      }
    }

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
      // Full refresh: fetch users and only the filtered courses (if provided)
      if (filterCourseIds.length > 0) {
        courseIds = filterCourseIds;
        console.log(`Using filtered course IDs (${courseIds.length}): ${courseIds.join(', ')}`);
      } else {
        // No filter provided -> fetch all courses
        courseIds = await fetchAllCourses(baseUrl, accessToken, clientId);
        apiCallTracker.count++; // Count the courses fetch
        if (courseIds.length === 0) {
          console.warn('No courses found');
          return new Response(
            JSON.stringify({ success: true, leaderboard: [], count: 0, message: 'No courses found', apiCalls: apiCallTracker.count }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (limitCourses > 0) courseIds = courseIds.slice(0, limitCourses);
      }

      users = await fetchAllUsers(baseUrl, accessToken, clientId);
      apiCallTracker.count++; // Count the users fetch
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

    // Step 3: Fetch course grades for all courses (more efficient than per-user calls)
    console.log('Fetching course grades...');
    const courseGradesCache = new Map<string, any>();
    
    if (courseIds.length > 0) {
      for (const courseId of courseIds) {
        const grades = await rateLimiter.run(() => {
          apiCallTracker.count++;
          return fetchCourseGrades(baseUrl, courseId, accessToken, clientId);
        });
        
        if (grades) {
          courseGradesCache.set(courseId, grades);
          console.log(`[Course ${courseId}] Cached grades for ${grades?.data?.length || 0} users`);
        }
      }
    }
    
    console.log(`Cached grades for ${courseGradesCache.size} courses`);

    // Step 4: Process users in small batches and upsert incrementally
    console.log('Aggregating exam scores for users...');
    const batchSize = 3;
    const leaderboardData: AggregatedUserData[] = [];
    const allExamResults: any[] = [];

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
              apiCallTracker.count++;
              return fetchAllCourseProgress(baseUrl, userId, accessToken, clientId);
            });
            
            console.log(`[User ${userId}] All-courses progress count: ${allProgress.length}`);
            
            // ENHANCED LOGGING: Inspect full progress structure (selective refresh)
            if (allProgress.length > 0) {
              const sampleProgress = allProgress[0];
              console.log(`[User ${userId}] Progress sample keys: ${JSON.stringify(Object.keys(sampleProgress))}`);
              
              // Log full structure for debugging
              if (username.includes('Benke') || allProgress.length <= 3) {
                console.log(`[User ${userId}] FULL PROGRESS SAMPLE:\n${JSON.stringify(sampleProgress, null, 2)}`);
              }
              
              // Specifically examine progress_per_section_unit
              if ('progress_per_section_unit' in sampleProgress) {
                console.log(`[User ${userId}] progress_per_section_unit type: ${typeof sampleProgress.progress_per_section_unit}`);
                console.log(`[User ${userId}] progress_per_section_unit structure:\n${JSON.stringify(sampleProgress.progress_per_section_unit, null, 2)}`);
              } else {
                console.log(`[User ${userId}] ⚠️ progress_per_section_unit field NOT FOUND in progress data`);
              }
              
              // Check for any fields that might contain exam/activity data
              const possibleActivityFields = ['activities', 'assessments', 'exams', 'units', 'sections', 'progress_per_section_unit'];
              const foundFields = possibleActivityFields.filter(field => field in sampleProgress);
              console.log(`[User ${userId}] Found potential activity fields: ${foundFields.join(', ') || 'NONE'}`);
            }
            
            let totalScore = 0;
            let totalExams = 0;
            let latestActivity: string | null = null;
            
            // Filter to only allowed courses (when course filter is active)
            const filteredProgress = filterCourseIds.length > 0
              ? allProgress.filter(p => p.course_id && filterCourseIds.includes(p.course_id))
              : allProgress;
            
            console.log(`[User ${userId}] Processing ${filteredProgress.length}/${allProgress.length} courses after filter`);
            
            // DEBUG: Log all course IDs for this user
            if (filteredProgress.length > 0) {
              console.log(`[User ${userId}] Filtered course IDs:`, filteredProgress.map(p => p.course_id).join(', '));
            }
            if (allProgress.length > 0 && username.includes('Benke')) {
              console.log(`[DEBUG Benke Viktor] ALL course IDs:`, allProgress.map(p => p.course_id).join(', '));
            }
            
            let cachedEnrollments: Enrollment[] | null = null;
            
            for (const courseProgress of filteredProgress) {
              const courseId = courseProgress.course_id;
              if (!courseId) continue;
              
              // Fetch detailed progress for this course to get activities
              const detailedProgress = await rateLimiter.run(() => {
                apiCallTracker.count++;
                return fetchCourseProgress(baseUrl, userId, courseId, accessToken, clientId);
              });
              
              if (detailedProgress) {
                const examData = extractExamScores(detailedProgress, userId, username, email, courseId);
                totalScore += examData.score;
                totalExams += examData.count;
                
                // Collect exam results
                for (const exam of examData.exams) {
                  allExamResults.push({
                    ...exam,
                    user_id: userId,
                    username,
                    email,
                  });
                }
                
                if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
                  latestActivity = examData.lastActivity;
                }
              } else {
                // Fallback: try enrollment product_ids in case progress endpoint expects a different ID
                if (!cachedEnrollments) {
                  cachedEnrollments = await rateLimiter.run(() => {
                    apiCallTracker.count++;
                    return fetchUserEnrollments(baseUrl, userId, accessToken, clientId);
                  });
                  console.log(`[User ${userId}] Fallback enrollments: ${cachedEnrollments.length}`);
                }
                let matchedFromEnrollments = false;
                for (const enr of cachedEnrollments) {
                  if (!enr?.product_id) continue;
                  const altProgress = await rateLimiter.run(() => {
                    apiCallTracker.count++;
                    return fetchCourseProgress(baseUrl, userId, String(enr.product_id), accessToken, clientId);
                  });
                  if (altProgress?.activities && altProgress.activities.length > 0) {
                    console.log(`[User ${userId}] Fallback matched course ${courseId} -> ${enr.product_id}`);
                    const examData = extractExamScores(altProgress, userId, username, email, String(enr.product_id));
                    totalScore += examData.score;
                    totalExams += examData.count;
                    for (const exam of examData.exams) {
                      allExamResults.push({ ...exam, user_id: userId, username, email });
                    }
                    if (examData.lastActivity && (!latestActivity || examData.lastActivity > latestActivity)) {
                      latestActivity = examData.lastActivity;
                    }
                    matchedFromEnrollments = true;
                    break;
                  }
                }
                if (!matchedFromEnrollments) {
                  const avg = Number((courseProgress as any).average_score_rate ?? 0);
                  if (avg > 0) {
                    // Enhanced fallback: count completed assessments
                    const completedExamCount = countCompletedAssessments(courseProgress);
                    
                    if (completedExamCount > 0) {
                      // Use counted exams with average score
                      const estimatedTotal = avg * completedExamCount;
                      totalScore += estimatedTotal;
                      totalExams += completedExamCount;
                      
                      console.log(
                        `[User ${userId}] ESTIMATED from ${completedExamCount} assessments: ` +
                        `course=${courseId}, avg=${avg}%, total=${estimatedTotal}`
                      );
                    } else {
                      // Last resort: use average_score_rate with 1 exam assumption
                      totalScore += avg;
                      totalExams += 1;
                      
                      console.log(`[User ${userId}] Derived score from progress (no activities): course=${courseId}, avg=${avg}`);
                    }
                    
                    const derivedTs = normalizeTimestamp((courseProgress as any).completed_at);
                    if (derivedTs && (!latestActivity || derivedTs > latestActivity)) {
                      latestActivity = derivedTs;
                    }
                  }
                }
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
              score_source: (allExamResults.length > 0 ? 'exact' : 'estimated') as 'exact' | 'estimated',
            };
          } else {
            // Full refresh: Use per-course progress fetch
            return aggregateUserData(user, baseUrl, accessToken, clientId, rateLimiter, filterCourseIds, apiCallTracker, allExamResults, courseGradesCache);
          }
        })
      );
      
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

    // Step 3.5: Insert all exam results into exam_results table
    if (allExamResults.length > 0) {
      console.log(`Inserting ${allExamResults.length} exam results into database...`);
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // First, clear existing exam results for processed users if this is a selective refresh
      if (isSelectiveRefresh && filterUserIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('exam_results')
          .delete()
          .in('user_id', filterUserIds);
        if (deleteError) {
          console.error('Error deleting old exam results:', deleteError);
        } else {
          console.log(`Cleared old exam results for ${filterUserIds.length} users`);
        }
      }
      
      // Insert new exam results
      const { error: examInsertError } = await supabase
        .from('exam_results')
        .insert(allExamResults);
      if (examInsertError) {
        console.error('Error inserting exam results:', examInsertError);
      } else {
        console.log(`Successfully inserted ${allExamResults.length} exam results`);
      }
    } else {
      console.log('No exam results to insert');
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
        apiCalls: apiCallTracker.count,
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
