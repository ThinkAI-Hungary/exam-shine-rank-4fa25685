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
  tags?: string[];
  munkaviszonyod_kezdete?: string;
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
 * Each entry in data[] is a single grade/exam result
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
  
  // Filter all grade entries for this user (each entry is one exam)
  const userGradeEntries = gradesData.data.filter((entry: any) => String(entry.user_id) === userId);
  
  if (userGradeEntries.length === 0) {
    console.log(`[User ${userId}] [Course ${courseId}] User not found in grades data`);
    return { score: 0, count: 0, lastActivity: null, exams: [] };
  }
  
  console.log(`[User ${userId}] [Course ${courseId}] Found ${userGradeEntries.length} grade entries for user`);
  
  let totalScore = 0;
  let examCount = 0;
  let lastActivity: string | null = null;
  const exams: ExamResult[] = [];
  
  // Process each grade entry (each is one exam/assessment)
  for (const gradeEntry of userGradeEntries) {
    console.log(`[User ${userId}] [Course ${courseId}] Grade entry:`, JSON.stringify({
      id: gradeEntry.id,
      grade: gradeEntry.grade,
      learningUnit: gradeEntry.learningUnit?.title || gradeEntry.learningUnit?.name,
      created: gradeEntry.created,
      submittedTimestamp: gradeEntry.submittedTimestamp
    }));
    
    // Extract score from the grade field (number or numeric string)
    let score: number | null = null;
    if (typeof gradeEntry.grade === 'number') {
      score = gradeEntry.grade;
    } else if (typeof gradeEntry.grade === 'string') {
      const parsed = parseFloat(gradeEntry.grade);
      score = isNaN(parsed) ? null : parsed;
    }
    
    if (score !== null) {
      const completedAt = normalizeTimestamp(gradeEntry.submittedTimestamp || gradeEntry.created || gradeEntry.modified);
      const examTitle = gradeEntry.learningUnit?.title || gradeEntry.learningUnit?.name || 'Untitled Exam';
      
      console.log(`[User ${userId}] [Course ${courseId}] ✓ EXAM FOUND (from grades): score=${score}, title=${examTitle}`);
      
      totalScore += score;
      examCount++;
      
      if (completedAt) {
        exams.push({
          exam_id: String(gradeEntry.id || `${courseId}-${examTitle}`),
          exam_title: examTitle,
          score: score,
          completed_at: completedAt,
          course_id: courseId,
          course_title: courseId, // Course title not in grade entry
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
  const tags = user.tags || [];

  console.log(`\n=== Processing User: ${username} (${userId}), Tags: ${JSON.stringify(tags)} ===`);
  
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      // For selective refresh, also fetch all courses to use course grades endpoint
      // This is more reliable than the progress endpoint which doesn't always return activities
      console.log('Fetching all courses for selective refresh...');
      courseIds = await fetchAllCourses(baseUrl, accessToken, clientId);
      apiCallTracker.count++;
      console.log(`Fetched ${courseIds.length} courses for selective refresh`);
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
            // Use course grades (same as full refresh) - more reliable than progress endpoint
            const userId = String(user.id);
            const username = user.username || user.name || user.email?.split('@')[0] || 'Unknown';
            const email = user.email || null;
            
            console.log(`\n=== Processing User (Selective): ${username} (${userId}) ===`);
            
            let totalScore = 0;
            let totalExams = 0;
            let latestActivity: string | null = null;
            
            // Use course grades cache (already fetched above)
            for (const [courseId, gradesData] of courseGradesCache.entries()) {
              const examData = extractExamScoresFromGrades(gradesData, userId, username, email, courseId);
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
            return aggregateUserData(user, baseUrl, accessToken, clientId, rateLimiter, filterCourseIds, apiCallTracker, allExamResults, courseGradesCache);
          }
        })
      );
      
      leaderboardData.push(...batchResults);
    }

    // Step 3: Insert all exam results into exam_results table (source of truth)
    if (allExamResults.length > 0) {
      console.log(`\nUpserting ${allExamResults.length} exam results into database...`);
      
      // Upsert exam results (omit non-existent columns like score_source)
      const sanitizedExamResults = allExamResults.map((e) => ({
        exam_id: e.exam_id,
        exam_title: e.exam_title,
        score: e.score,
        completed_at: e.completed_at,
        course_id: e.course_id,
        course_title: e.course_title,
        user_id: e.user_id,
        username: e.username,
        email: e.email ?? null,
      }));

      const { error: examInsertError } = await supabase
        .from('exam_results')
        .upsert(sanitizedExamResults, {
          onConflict: 'user_id,exam_id'
        });
      if (examInsertError) {
        console.error('Error upserting exam results:', examInsertError);
      } else {
        console.log(`Successfully upserted ${allExamResults.length} exam results`);
      }
    } else {
      console.log('No exam results to upsert');
    }

    // Step 3.5: Fetch existing users from DB to compare tags and start_of_empl
    console.log('\nFetching existing users to check for tag and employment date changes...');
    const { data: existingUsers } = await supabase
      .from('users')
      .select('user_id, tags, start_of_empl')
      .in('user_id', uniqueUsers.map(u => u.id));
    
    const existingUserMap = new Map<string, { tags: string[]; start_of_empl: string | null }>(
      (existingUsers || []).map((u: any) => [u.user_id, { tags: u.tags || [], start_of_empl: u.start_of_empl || null }])
    );
    
    // Fetch detailed user data (including tags) only for users with missing or potentially changed tags
    console.log('\nFetching detailed user data with tags...');
    const usersWithTags: LearnWorldsUser[] = [];
    
    // Fetch detailed user data for all users in batches to get tags
    const userBatchSize = 10;
    for (let i = 0; i < uniqueUsers.length; i += userBatchSize) {
      const userBatch = uniqueUsers.slice(i, i + userBatchSize);
      console.log(`Fetching detailed data for batch ${Math.floor(i/userBatchSize) + 1}/${Math.ceil(uniqueUsers.length/userBatchSize)} (users ${i+1}-${Math.min(i+userBatchSize, uniqueUsers.length)})`);
      
      const batchResults = await Promise.all(
        userBatch.map(async (user) => {
          try {
            const detail = await rateLimiter.run(() => {
              apiCallTracker.count++;
              const url = `${baseUrl}/v2/users/${user.id}`;
              return makeTrackedRequest(url, accessToken, clientId);
            });
            const du = (detail || {}) as any;
            
            // Log all available fields for the first user to help debug
            if (i === 0 && userBatch[0] === user) {
              console.log('Sample user object fields:', JSON.stringify(Object.keys(du)));
              console.log('Sample user object:', JSON.stringify(du));
            }
            
            const tags = Array.isArray(du.tags) ? du.tags : [];
            
            // Get employment start date from fields object
            const munkaviszonyod_kezdete = du.fields?.cf_munkaviszonyodkezdete || null;
            
            if (munkaviszonyod_kezdete) {
              console.log(`Found employment start date for user ${user.id}: ${munkaviszonyod_kezdete}`);
            }
            
            const merged: LearnWorldsUser = {
              id: String(user.id),
              username: du.username ?? (user as any).username,
              email: du.email ?? (user as any).email,
              name: du.name ?? (user as any).name,
              tags,
              munkaviszonyod_kezdete,
            } as LearnWorldsUser;
            return merged;
          } catch (error) {
            console.warn(`Failed to fetch detailed user ${user.id}:`, error);
            return user; // fallback to basic user data
          }
        })
      );
      
      usersWithTags.push(...batchResults);
    }

    // Step 3.6: Only upsert users whose tags or employment date have changed
    console.log('\nChecking for tag and employment date changes and upserting only modified users...');
    const usersToUpdate = usersWithTags.filter((user) => {
      const userId = String(user.id);
      const newTags = ((user as any).tags || [])
        .filter((tag: string) => typeof tag === 'string' && tag.startsWith('cf_aruhaz_'))
        .sort();
      const existingData = existingUserMap.get(userId) || { tags: [], start_of_empl: null };
      const existingTags = existingData.tags.sort();
      
      // Parse new employment date if available (convert to date format YYYY-MM-DD)
      const newStartOfEmpl = user.munkaviszonyod_kezdete 
        ? new Date(user.munkaviszonyod_kezdete).toISOString().split('T')[0]
        : null;
      
      // Check if tags have changed
      const tagsChanged = JSON.stringify(newTags) !== JSON.stringify(existingTags);
      
      // Check if employment date has changed
      const emplDateChanged = newStartOfEmpl !== existingData.start_of_empl;
      
      if (tagsChanged) {
        console.log(`Tags changed for user ${userId}: [${existingTags.join(', ')}] -> [${newTags.join(', ')}]`);
      }
      if (emplDateChanged) {
        console.log(`Employment date changed for user ${userId}: ${existingData.start_of_empl} -> ${newStartOfEmpl}`);
      }
      
      return tagsChanged || emplDateChanged;
    });

    const userDataToUpsert = usersToUpdate.map((user) => {
      const startOfEmpl = user.munkaviszonyod_kezdete 
        ? new Date(user.munkaviszonyod_kezdete).toISOString().split('T')[0]  // Convert to YYYY-MM-DD format
        : null;
      
      return {
        user_id: String(user.id),
        username: user.username || (user as any).name || (user as any).email?.split('@')[0] || 'Unknown',
        email: (user as any).email || null,
        tags: ((user as any).tags || []).filter((tag: string) => typeof tag === 'string' && tag.startsWith('cf_aruhaz_')),
        start_of_empl: startOfEmpl,
        updated_at: new Date().toISOString(),
      };
    });

    if (userDataToUpsert.length > 0) {
      const { error: userUpsertError } = await supabase
        .from('users')
        .upsert(userDataToUpsert, {
          onConflict: 'user_id'
        });
      
      if (userUpsertError) {
        console.error('Error upserting user data:', userUpsertError);
      } else {
        console.log(`Successfully upserted ${userDataToUpsert.length} users with changed data (skipped ${usersWithTags.length - userDataToUpsert.length} unchanged)`);
      }
    } else {
      console.log('No changes detected in tags or employment dates, skipping user updates');
    }


    // Step 4: Recalculate leaderboard_cache from exam_results (the source of truth)
    console.log('\nRecalculating leaderboard_cache from exam_results...');
    const uniqueUserIds = [...new Set(leaderboardData.map(u => u.user_id))];
    
    for (const userId of uniqueUserIds) {
      // Get all exam results for this user
      const { data: userExams, error: examsError } = await supabase
        .from('exam_results')
        .select('*')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false });

      if (examsError) {
        console.error(`Error fetching exam results for user ${userId}:`, examsError);
        continue;
      }

      if (!userExams || userExams.length === 0) {
        console.log(`No exam results found for user ${userId}, skipping`);
        continue;
      }

      // Deduplicate retaken exams - keep only the latest attempt for each exam
      // Use exam_title instead of exam_id since retakes may have different IDs
      const examMap = new Map<string, any>();
      for (const exam of userExams) {
        const examKey = `${exam.course_id}-${exam.exam_title}`;
        if (!examMap.has(examKey)) {
          examMap.set(examKey, exam);
        }
      }
      
      const uniqueExams = Array.from(examMap.values());
      console.log(`[User ${userId}] Deduplication: ${userExams.length} total attempts -> ${uniqueExams.length} unique exams`);

      // Calculate totals from deduplicated exam_results
      const totalScore = uniqueExams.reduce((sum, exam) => sum + (exam.score || 0), 0);
      const examCount = uniqueExams.length;
      const averageScore = examCount > 0 ? totalScore / examCount : 0;
      const lastActivity = uniqueExams[0]?.completed_at || null;

      // Update leaderboard_cache with calculated values (only metrics, no user data)
      const { error: updateError } = await supabase
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

      if (updateError) {
        console.error(`Error updating leaderboard_cache for user ${userId}:`, updateError);
      } else {
        console.log(`Updated leaderboard_cache for user ${userId}: ${totalScore} points from ${examCount} exams`);
      }
    }

    // Step 5: Re-rank ALL users in the database (critical for selective refresh)
    // Fetch ALL users from database to calculate proper ranks
    const { data: allUsersData, error: fetchError } = await supabase
      .from('leaderboard_cache')
      .select('*')
      .order('average_score', { ascending: false });

    if (fetchError) {
      console.error('Error fetching all users for ranking:', fetchError);
    } else if (allUsersData && allUsersData.length > 0) {
      // Assign ranks based on average_score (highest score = rank 1)
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
