import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface Course {
  id: string;
  title: string;
}

interface ContentUnit {
  id: string;
  title: string;
  type: string;
}

interface GradeResult {
  user_id: string;
  user_email?: string;
  learningUnit?: {
    id: string;
    type: string;
  };
  grade?: number;
  score?: number;
  score_percentage?: number;
  completed_at?: string;
  finished_at?: string;
  submitted_at?: string;
  created?: number;
}

// Map to store unit_id -> unit_title for assessments/questionnaires
const unitTitleMap = new Map<string, string>();

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getLearnWorldsAccessToken(_subdomain: string): Promise<string> {
  // In some LearnWorlds setups the token endpoint is not accessible from server-to-server.
  // We therefore rely on a pre-generated access token / API key stored as secrets.
  const token = Deno.env.get("LEARNWORLDS_ACCESS_TOKEN")?.trim();
  const apiKey = Deno.env.get("LEARNWORLDS_API_KEY")?.trim();

  const bearer = token || apiKey;
  if (!bearer) {
    throw new Error("Missing LEARNWORLDS_ACCESS_TOKEN (or LEARNWORLDS_API_KEY) secret");
  }

  return bearer;
}

async function makeLearnWorldsRequest(baseUrl: string, endpoint: string, subdomain: string): Promise<any> {
  const isAdminApi = baseUrl.includes("/admin/");

  // Public API mode (e.g. https://api.learnworlds.com/v2 or https://{school}.learnworlds.com/api/v2)
  if (!isAdminApi) {
    const bearer = Deno.env.get("LEARNWORLDS_API_KEY")?.trim() || Deno.env.get("LEARNWORLDS_ACCESS_TOKEN")?.trim();
    if (!bearer) throw new Error("Missing LEARNWORLDS_API_KEY (or LEARNWORLDS_ACCESS_TOKEN) secret");

    const url = `${baseUrl}${endpoint}`;
    console.log(`[API Request] ${url}`);

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    const contentType = resp.headers.get("content-type") || "";
    const responseText = await resp.text();

    if (!resp.ok) {
      console.error(`[API Error] ${resp.status} (${contentType}): ${responseText.substring(0, 500)}`);
      throw new Error(`API error ${resp.status}: ${responseText.substring(0, 200)}`);
    }

    if (!contentType.includes("application/json")) {
      console.error(`[API Error] Expected JSON but got ${contentType}: ${responseText.substring(0, 500)}`);
      throw new Error(`API returned non-JSON response (${contentType})`);
    }

    return JSON.parse(responseText);
  }

  // Admin API mode (requires client_id)
  const clientId = Deno.env.get("LEARNWORLDS_CLIENT_ID")?.trim();
  if (!clientId) throw new Error("Missing LEARNWORLDS_CLIENT_ID secret");

  const bearer = await getLearnWorldsAccessToken(subdomain);

  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${baseUrl}${endpoint}${separator}client_id=${encodeURIComponent(clientId)}`;

  console.log(`[API Request] ${url}`);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Lw-Client": clientId,
      "Authorization": `Bearer ${bearer}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  const contentType = resp.headers.get("content-type") || "";
  const responseText = await resp.text();

  if (!resp.ok) {
    console.error(`[API Error] ${resp.status} (${contentType}): ${responseText.substring(0, 500)}`);
    throw new Error(`API error ${resp.status}: ${responseText.substring(0, 200)}`);
  }

  if (!contentType.includes("application/json")) {
    console.error(`[API Error] Expected JSON but got ${contentType}: ${responseText.substring(0, 500)}`);
    throw new Error(`API returned non-JSON response (${contentType})`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    console.error(`[API Error] Failed to parse JSON: ${responseText.substring(0, 500)}`);
    throw new Error(`Failed to parse API response as JSON`);
  }
}

function normalizeTimestamp(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts === 'number') {
    return new Date(ts * 1000).toISOString();
  }
  if (typeof ts === 'string') {
    const parsed = new Date(ts);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function parseLearnWorldsSubdomain(raw: string): string {
  let s = (raw || '').trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/\/$/, '');
  s = s.replace(/\.learnworlds\.com\b/i, '');
  s = s.split('/')[0] ?? s;
  s = s.split('.')[0] ?? s;
  return s;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const subdomain = parseLearnWorldsSubdomain(Deno.env.get("LEARNWORLDS_SUBDOMAIN")?.trim() ?? "");

    if (!subdomain) throw new Error("Missing LEARNWORLDS_SUBDOMAIN secret");

    const configuredBaseUrl = (Deno.env.get("LEARNWORLDS_BASE_URL") || "").trim().replace(/\/+$/, "");

    // Prefer configured base URL if provided, otherwise fall back to the admin API base.
    const baseUrl = configuredBaseUrl || `https://${subdomain}.learnworlds.com/admin/api/v2`;

    console.log(`[sync-learnworlds] Course-centric sync starting. Base URL: ${baseUrl}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch all courses
    console.log('[Step 1] Fetching all courses...');
    const coursesData = await makeLearnWorldsRequest(baseUrl, '/courses', subdomain);
    const courses: Course[] = coursesData.data || coursesData || [];
    console.log(`[Step 1] Found ${courses.length} courses`);

    if (courses.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No courses found',
        courses_processed: 0,
        exams_synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pre-fetch user data from our database for username/email lookup
    const { data: allUsers } = await supabase
      .from('users')
      .select('user_id, username, email');
    const userMap = new Map((allUsers || []).map(u => [u.user_id, u]));

    const allExamResults: any[] = [];
    let coursesProcessed = 0;
    let totalGrades = 0;

    // Step 2: Process each course
    for (const course of courses) {
      const courseId = course.id;
      const courseTitle = course.title || 'Unknown Course';

      console.log(`[Course ${coursesProcessed + 1}/${courses.length}] Processing: ${courseTitle} (${courseId})`);

      try {
        // Step 2a: Fetch course content to get unit titles
        console.log(`  -> Fetching content for course ${courseId}...`);
        const contentData = await makeLearnWorldsRequest(baseUrl, `/courses/${courseId}/content`, subdomain);
        const contentUnits: ContentUnit[] = contentData.data || contentData || [];

        // Store unit titles for assessments and questionnaires
        for (const unit of contentUnits) {
          if (unit.type === 'assessment' || unit.type === 'questionnaire' || unit.type === 'exam' || unit.type === 'quiz') {
            unitTitleMap.set(unit.id, unit.title || 'Untitled Assessment');
          }
        }
        console.log(`  -> Found ${contentUnits.length} content units, ${unitTitleMap.size} are assessments`);

        // Step 2b: Fetch all grades for this course
        console.log(`  -> Fetching grades for course ${courseId}...`);
        const gradesData = await makeLearnWorldsRequest(baseUrl, `/courses/${courseId}/grades`, subdomain);
        const grades: GradeResult[] = gradesData.data || gradesData || [];

        console.log(`  -> Found ${grades.length} grade records`);

        // Process each grade result
        for (const grade of grades) {
          const userId = grade.user_id;
          if (!userId) continue;

          // Get unit info
          const unitId = grade.learningUnit?.id || '';
          const unitType = grade.learningUnit?.type || '';

          // Only process assessments/questionnaires/exams
          if (!['assessment', 'questionnaire', 'exam', 'quiz'].includes(unitType)) {
            continue;
          }

          // Get the real title from our map
          let examTitle = unitTitleMap.get(unitId);
          if (!examTitle || examTitle === 'null' || examTitle === 'undefined') {
            examTitle = `${courseTitle} - Assessment`;
          }

          // Extract score
          let score: number | null = null;
          if (typeof grade.score_percentage === 'number') {
            score = grade.score_percentage;
          } else if (typeof grade.score === 'number') {
            score = grade.score;
          } else if (typeof grade.grade === 'number') {
            score = grade.grade;
          }

          // Extract completion time
          const completedAt = normalizeTimestamp(
            grade.completed_at || grade.finished_at || grade.submitted_at || grade.created
          );

          // Only add if we have a valid score and completion date
          if (score !== null && completedAt) {
            const userInfo = userMap.get(userId);

            allExamResults.push({
              user_id: userId,
              username: userInfo?.username || userId,
              email: userInfo?.email || grade.user_email || null,
              exam_id: unitId || `${courseId}-${unitType}`,
              exam_title: examTitle,
              score: score,
              completed_at: completedAt,
              course_id: courseId,
              course_title: courseTitle,
            });
            totalGrades++;
          }
        }

        coursesProcessed++;
        console.log(`[Course ${coursesProcessed}/${courses.length}] ✓ Completed: ${courseTitle}`);

      } catch (courseError) {
        const errorMsg = courseError instanceof Error ? courseError.message : String(courseError);
        console.error(`[Course ${courseId}] ✗ Error: ${errorMsg}`);
        // Continue with next course even if one fails
        coursesProcessed++;
      }
    }

    // Step 3: Upsert all exam results in batch
    console.log(`[Step 3] Upserting ${allExamResults.length} exam results...`);

    if (allExamResults.length > 0) {
      // Process in chunks of 500 to avoid payload size limits
      const chunkSize = 500;
      for (let i = 0; i < allExamResults.length; i += chunkSize) {
        const chunk = allExamResults.slice(i, i + chunkSize);
        
        const { error: upsertError } = await supabase
          .from('exam_results')
          .upsert(chunk, { 
            onConflict: 'user_id,exam_id',
            ignoreDuplicates: false 
          });

        if (upsertError) {
          console.error(`[Upsert chunk ${i / chunkSize + 1}] Error:`, upsertError.message);
        } else {
          console.log(`[Upsert chunk ${i / chunkSize + 1}] ✓ Inserted ${chunk.length} records`);
        }
      }

      // Step 4: Update leaderboard cache for all affected users
      console.log('[Step 4] Updating leaderboard cache...');
      const uniqueUserIds = [...new Set(allExamResults.map(r => r.user_id))];

      for (const userId of uniqueUserIds) {
        try {
          const { data: userExams } = await supabase
            .from('exam_results')
            .select('score, completed_at')
            .eq('user_id', userId);

          if (userExams && userExams.length > 0) {
            const totalScore = userExams.reduce((sum, e) => sum + (e.score || 0), 0);
            const avgScore = totalScore / userExams.length;
            const lastActivity = userExams
              .map(e => e.completed_at)
              .filter(Boolean)
              .sort()
              .pop();

            await supabase
              .from('leaderboard_cache')
              .upsert({
                user_id: userId,
                total_score: totalScore,
                exam_count: userExams.length,
                average_score: Math.round(avgScore * 100) / 100,
                last_activity: lastActivity,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id' });
          }
        } catch (cacheError) {
          console.warn(`[Cache] Error updating user ${userId}:`, cacheError);
        }
      }

      console.log(`[Step 4] ✓ Updated leaderboard for ${uniqueUserIds.length} users`);
    }

    // Clear sync queue (mark all as completed since we synced everyone)
    await supabase
      .from('sync_queue')
      .update({ status: 'completed', error_message: null })
      .eq('status', 'pending');

    console.log(`[sync-learnworlds] ✓ Complete! Processed ${coursesProcessed} courses, synced ${allExamResults.length} exam results`);

    return new Response(JSON.stringify({
      success: true,
      courses_processed: coursesProcessed,
      total_courses: courses.length,
      exams_synced: allExamResults.length,
      unique_users: [...new Set(allExamResults.map(r => r.user_id))].length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sync-learnworlds] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
