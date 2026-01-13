import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface QuestionnaireResult {
  id: string;
  questionnaire_id?: string;
  questionnaire_title?: string;
  title?: string;
  name?: string;
  score?: number;
  score_percentage?: number;
  grade?: number;
  finished_at?: string;
  completed_at?: string;
  submitted_at?: string;
  created?: string;
  course_id?: string;
  course_title?: string;
}

interface SyncResult {
  user_id: string;
  success: boolean;
  exams_count: number;
  error?: string;
}

async function makeLearnWorldsRequest(url: string): Promise<any> {
  // Verify secrets are loaded (do not log actual values)
  console.log("Client ID loaded:", !!Deno.env.get("LEARNWORLDS_CLIENT_ID"));
  console.log(
    "API Key loaded:",
    !!Deno.env.get("LEARNWORLDS_API_KEY") || !!Deno.env.get("LEARNWORLDS_ACCESS_TOKEN")
  );
  console.log("Full Target URL:", url);

  const clientId = Deno.env.get("LEARNWORLDS_CLIENT_ID");
  const apiKey = Deno.env.get("LEARNWORLDS_API_KEY") ?? Deno.env.get("LEARNWORLDS_ACCESS_TOKEN");

  if (!clientId) throw new Error("Missing LEARNWORLDS_CLIENT_ID secret");
  if (!apiKey) throw new Error("Missing LEARNWORLDS_API_KEY (or LEARNWORLDS_ACCESS_TOKEN) secret");

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Lw-Client-Id": clientId,
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API error ${resp.status}: ${text}`);
  }

  return resp.json();
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const subdomain = Deno.env.get('LEARNWORLDS_SUBDOMAIN')!;

    // Construct the base API URL from subdomain
    // LEARNWORLDS_SUBDOMAIN should be just the slug (e.g., "my-school")
    // OR a custom domain (e.g., "academy.mycompany.com")
    const isCustomDomain = subdomain.includes('.');
    const baseUrl = isCustomDomain 
      ? `https://${subdomain}/admin/api`
      : `https://${subdomain}.learnworlds.com/admin/api`;
    
    console.log(`[sync-learnworlds] Using subdomain: ${subdomain}, Base URL: ${baseUrl}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 30;

    console.log(`[sync-learnworlds] Starting sync for batch of ${batchSize} users`);

    // Get pending users from sync_queue
    const { data: pendingUsers, error: queueError } = await supabase
      .from('sync_queue')
      .select('user_id')
      .eq('status', 'pending')
      .limit(batchSize);

    if (queueError) {
      throw new Error(`Failed to fetch sync queue: ${queueError.message}`);
    }

    if (!pendingUsers || pendingUsers.length === 0) {
      console.log('[sync-learnworlds] No pending users in queue');
      return new Response(JSON.stringify({ 
        message: 'No pending users',
        processed: 0,
        remaining: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-learnworlds] Processing ${pendingUsers.length} users`);

    // Mark users as processing
    const userIds = pendingUsers.map(u => u.user_id);
    await supabase
      .from('sync_queue')
      .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
      .in('user_id', userIds);

    // Fetch user info from users table
    const { data: usersData } = await supabase
      .from('users')
      .select('user_id, username, email')
      .in('user_id', userIds);

    const userMap = new Map((usersData || []).map(u => [u.user_id, u]));

    const results: SyncResult[] = [];
    const allExamResults: any[] = [];

    // Process each user - call the questionnaires endpoint
    for (const { user_id } of pendingUsers) {
      try {
        const url = `${baseUrl}/v2/users/${user_id}/questionnaires`;
        console.log(`[User ${user_id}] Fetching questionnaires from: ${url}`);

        const data = await makeLearnWorldsRequest(url);
        const questionnaires: QuestionnaireResult[] = data.data || data || [];

        console.log(`[User ${user_id}] Found ${questionnaires.length} questionnaire results`);
        if (questionnaires.length > 0) {
          console.log(`[User ${user_id}] Sample questionnaire:`, JSON.stringify(questionnaires[0]));
        }

        const userInfo = userMap.get(user_id);
        let examCount = 0;

        for (const q of questionnaires) {
          // Extract exam title - try multiple fields
          const examTitle = q.questionnaire_title || q.title || q.name || 'Untitled Exam';
          
          // Extract score - try multiple fields
          let score: number | null = null;
          if (typeof q.score_percentage === 'number') {
            score = q.score_percentage;
          } else if (typeof q.score === 'number') {
            score = q.score;
          } else if (typeof q.grade === 'number') {
            score = q.grade;
          }

          // Extract completion time
          const completedAt = normalizeTimestamp(
            q.finished_at || q.completed_at || q.submitted_at || q.created
          );

          // Extract exam ID
          const examId = q.questionnaire_id || q.id || `${user_id}-${examTitle}`;

          if (score !== null && completedAt) {
            allExamResults.push({
              user_id: user_id,
              username: userInfo?.username || user_id,
              email: userInfo?.email || null,
              exam_id: String(examId),
              exam_title: examTitle,
              score: score,
              completed_at: completedAt,
              course_id: q.course_id || 'unknown',
              course_title: q.course_title || 'Unknown Course',
            });
            examCount++;
          }
        }

        // Mark as completed
        await supabase
          .from('sync_queue')
          .update({ status: 'completed', error_message: null })
          .eq('user_id', user_id);

        results.push({ user_id, success: true, exams_count: examCount });
        console.log(`[User ${user_id}] ✓ Completed with ${examCount} exams`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[User ${user_id}] ✗ Error:`, errorMessage);

        await supabase
          .from('sync_queue')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('user_id', user_id);

        results.push({ user_id, success: false, exams_count: 0, error: errorMessage });
      }
    }

    // Upsert exam results in batch
    if (allExamResults.length > 0) {
      console.log(`[sync-learnworlds] Upserting ${allExamResults.length} exam results`);
      
      const { error: upsertError } = await supabase
        .from('exam_results')
        .upsert(allExamResults, { 
          onConflict: 'user_id,exam_id',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error('[sync-learnworlds] Upsert error:', upsertError.message);
      }

      // Update leaderboard cache for processed users
      console.log('[sync-learnworlds] Updating leaderboard cache...');
      for (const userId of userIds) {
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
      }
    }

    // Count remaining pending users
    const { count: remaining } = await supabase
      .from('sync_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalExams = results.reduce((sum, r) => sum + r.exams_count, 0);

    console.log(`[sync-learnworlds] Batch complete: ${successCount} success, ${failCount} failed, ${totalExams} exams, ${remaining || 0} remaining`);

    return new Response(JSON.stringify({
      processed: pendingUsers.length,
      success: successCount,
      failed: failCount,
      exams_synced: totalExams,
      remaining: remaining || 0,
      results,
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
