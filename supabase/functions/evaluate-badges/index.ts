import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BadgeDefinition {
  id: string;
  badge_type: 'category' | 'monthly_star' | 'progress' | 'aspirant';
  badge_name: string;
  badge_level: string | null;
  criteria: {
    years?: number;
    exam_perf?: number;
    training_activity?: number;
    overall?: number;
    min_score?: number;
    rank?: number;
    months?: number;
    period?: string;
  };
  evaluation_period: string;
}

interface UserMetrics {
  user_id: string;
  exam_performance_pct: number;
  training_activity_pct: number;
  overall_performance_pct: number;
  years_of_service: number;
  successful_exams_count: number;
  period_start: string;
  period_end: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, evaluation_type } = await req.json();
    
    console.log(`Starting badge evaluation for user: ${user_id || 'all'}, type: ${evaluation_type || 'all'}`);

    // Get badge definitions
    const { data: badges, error: badgesError } = await supabase
      .from('badge_definitions')
      .select('*');

    if (badgesError) throw badgesError;

    // Get users to evaluate
    let usersToEvaluate: string[] = [];
    if (user_id) {
      usersToEvaluate = [user_id];
    } else {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('user_id');
      if (usersError) throw usersError;
      usersToEvaluate = users.map(u => u.user_id);
    }

    let totalAwarded = 0;
    let totalRevoked = 0;

    for (const userId of usersToEvaluate) {
      console.log(`Evaluating badges for user: ${userId}`);

      // Update performance metrics first
      await supabase.rpc('update_user_performance_metrics', {
        p_user_id: userId,
        p_evaluation_period: 'current_month'
      });

      await supabase.rpc('update_user_performance_metrics', {
        p_user_id: userId,
        p_evaluation_period: 'last_6_months'
      });

      await supabase.rpc('update_user_performance_metrics', {
        p_user_id: userId,
        p_evaluation_period: 'last_year'
      });

      // Get user's current metrics
      const { data: metrics, error: metricsError } = await supabase
        .from('user_performance_metrics')
        .select('*')
        .eq('user_id', userId);

      if (metricsError) {
        console.error(`Error fetching metrics for ${userId}:`, metricsError);
        continue;
      }

      // Get current metrics by period
      const currentMonthMetrics = metrics?.find(m => m.evaluation_period === 'current_month');
      const last6MonthsMetrics = metrics?.find(m => m.evaluation_period === 'last_6_months');
      const lastYearMetrics = metrics?.find(m => m.evaluation_period === 'last_year');

      if (!currentMonthMetrics) {
        console.log(`No metrics found for user ${userId}, skipping`);
        continue;
      }

      // Get user's current badges
      const { data: currentBadges, error: currentBadgesError } = await supabase
        .from('user_badges')
        .select('*, badge_definitions(*)')
        .eq('user_id', userId)
        .is('revoked_at', null);

      if (currentBadgesError) throw currentBadgesError;

      const currentBadgeIds = new Set(currentBadges?.map(b => b.badge_id) || []);

      // Evaluate Category Badges
      const categoryBadges = badges.filter(b => b.badge_type === 'category') as BadgeDefinition[];
      const eligibleCategory = evaluateCategoryBadges(currentMonthMetrics, categoryBadges);
      
      if (eligibleCategory) {
        const hasCategory = currentBadges?.find(b => b.badge_definitions.badge_type === 'category' && !b.revoked_at);
        
        if (!hasCategory || hasCategory.badge_id !== eligibleCategory.id) {
          // Award new category badge
          await awardBadge(supabase, userId, eligibleCategory.id, currentMonthMetrics);
          totalAwarded++;
          
          // Revoke old category badges
          if (hasCategory) {
            await revokeBadge(supabase, hasCategory.id);
            totalRevoked++;
          }

          // Update user's current category
          await supabase
            .from('users')
            .update({ 
              current_category: eligibleCategory.badge_level,
              category_achieved_at: new Date().toISOString()
            })
            .eq('user_id', userId);
        }
      }

      // Evaluate Aspirant Badges
      const aspirantBadges = badges.filter(b => b.badge_type === 'aspirant') as BadgeDefinition[];
      const eligibleAspirant = evaluateAspirantBadges(currentMonthMetrics, aspirantBadges, eligibleCategory);
      
      if (eligibleAspirant) {
        const hasAspirant = currentBadges?.find(b => b.badge_id === eligibleAspirant.id);
        if (!hasAspirant) {
          await awardBadge(supabase, userId, eligibleAspirant.id, currentMonthMetrics);
          totalAwarded++;
        }
      } else {
        // Revoke aspirant badges if no longer eligible
        const currentAspirantBadges = currentBadges?.filter(b => b.badge_definitions.badge_type === 'aspirant');
        for (const badge of currentAspirantBadges || []) {
          await revokeBadge(supabase, badge.id);
          totalRevoked++;
        }
      }

      // Evaluate Monthly Star Badges (only if requested or it's the first of the month)
      if (!evaluation_type || evaluation_type === 'monthly' || new Date().getDate() === 1) {
        await evaluateMonthlyBadges(supabase, userId, badges, currentMonthMetrics, currentBadges);
      }

      // Evaluate Progress Badges
      if (last6MonthsMetrics && lastYearMetrics) {
        await evaluateProgressBadges(supabase, userId, badges, last6MonthsMetrics, lastYearMetrics, currentBadges);
      }
    }

    console.log(`Badge evaluation complete. Awarded: ${totalAwarded}, Revoked: ${totalRevoked}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        users_evaluated: usersToEvaluate.length,
        badges_awarded: totalAwarded,
        badges_revoked: totalRevoked
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in evaluate-badges:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function evaluateCategoryBadges(metrics: UserMetrics, badges: BadgeDefinition[]): BadgeDefinition | null {
  // Sort by level (Gold > Silver > Bronze)
  const sortedBadges = [...badges].sort((a, b) => (b.criteria.years || 0) - (a.criteria.years || 0));
  
  for (const badge of sortedBadges) {
    const meetsYears = metrics.years_of_service >= (badge.criteria.years || 0);
    const meetsExam = metrics.exam_performance_pct >= (badge.criteria.exam_perf || 0);
    const meetsTraining = metrics.training_activity_pct >= (badge.criteria.training_activity || 0);
    
    if (meetsYears && meetsExam && meetsTraining) {
      return badge;
    }
  }
  
  return null;
}

function evaluateAspirantBadges(
  metrics: UserMetrics, 
  badges: BadgeDefinition[], 
  currentCategory: BadgeDefinition | null
): BadgeDefinition | null {
  // Don't award aspirant badge if user already has the full category
  if (currentCategory) return null;
  
  // Sort by level (Gold > Silver > Bronze)
  const sortedBadges = [...badges].sort((a, b) => {
    const aLevel = a.badge_name.includes('Gold') ? 3 : a.badge_name.includes('Silver') ? 2 : 1;
    const bLevel = b.badge_name.includes('Gold') ? 3 : b.badge_name.includes('Silver') ? 2 : 1;
    return bLevel - aLevel;
  });
  
  for (const badge of sortedBadges) {
    const meetsExam = metrics.exam_performance_pct >= (badge.criteria.exam_perf || 0);
    const meetsTraining = metrics.training_activity_pct >= (badge.criteria.training_activity || 0);
    
    if (meetsExam && meetsTraining) {
      return badge;
    }
  }
  
  return null;
}

async function evaluateMonthlyBadges(
  supabase: any,
  userId: string,
  allBadges: BadgeDefinition[],
  metrics: UserMetrics,
  currentBadges: any[]
) {
  const monthlyBadges = allBadges.filter(b => b.badge_type === 'monthly_star');
  
  // Expire old monthly badges
  const oldMonthlyBadges = currentBadges?.filter(b => 
    b.badge_definitions.badge_type === 'monthly_star' && 
    b.expires_at && new Date(b.expires_at) < new Date()
  );
  
  for (const badge of oldMonthlyBadges || []) {
    await revokeBadge(supabase, badge.id);
  }
  
  // Check for "Starter Success" badge (complete all exams with 80%+ in first 3 months)
  const starterBadge = monthlyBadges.find(b => b.badge_name === 'Kezdő Siker' || b.badge_name === 'Starter Success');
  if (starterBadge) {
    const hasStarter = currentBadges?.find(b => b.badge_id === starterBadge.id);
    
    if (!hasStarter && metrics.years_of_service <= 0.25) {
      // Get user's employment start date
      const { data: userData } = await supabase
        .from('users')
        .select('start_of_empl')
        .eq('user_id', userId)
        .single();
      
      if (userData?.start_of_empl) {
        const startDate = new Date(userData.start_of_empl);
        const threeMonthsLater = new Date(startDate);
        threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
        const now = new Date();
        
        // Only evaluate if within first 3 months
        if (now <= threeMonthsLater) {
          // Get all unique exams in the system
          const { data: allExams } = await supabase
            .from('exam_results')
            .select('exam_id')
            .eq('user_id', userId);
          
          // Get all available exams
          const { data: availableExams } = await supabase
            .from('exam_results')
            .select('exam_id');
          
          const uniqueAvailableExams = [...new Set(availableExams?.map((e: any) => e.exam_id) || [])];
          const userCompletedExams = [...new Set(allExams?.map((e: any) => e.exam_id) || [])];
          
          // Check if completed all exams with 80%+ average
          if (userCompletedExams.length === uniqueAvailableExams.length && 
              metrics.exam_performance_pct >= 80) {
            await awardBadge(supabase, userId, starterBadge.id, metrics);
          }
        }
      }
    }
  }
  
  // Check for "Training Champion" badge (100% training participation)
  const trainingChampBadge = monthlyBadges.find(b => b.badge_name === 'Training Champion');
  if (trainingChampBadge && metrics.training_activity_pct === 100) {
    const hasChamp = currentBadges?.find(b => b.badge_id === trainingChampBadge.id);
    if (!hasChamp) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      await awardBadge(supabase, userId, trainingChampBadge.id, metrics, nextMonth.toISOString());
    }
  }
  
  // "Exam Master of the Month" is handled separately (requires ranking across all users)
}

async function evaluateProgressBadges(
  supabase: any,
  userId: string,
  allBadges: BadgeDefinition[],
  last6MonthsMetrics: UserMetrics,
  lastYearMetrics: UserMetrics,
  currentBadges: any[]
) {
  const progressBadges = allBadges.filter(b => b.badge_type === 'progress');
  
  for (const badge of progressBadges) {
    const metricsToUse = badge.criteria.period === 'half_yearly' ? last6MonthsMetrics : lastYearMetrics;
    const meetsExam = metricsToUse.exam_performance_pct >= (badge.criteria.exam_perf || 0);
    const meetsTraining = metricsToUse.training_activity_pct >= (badge.criteria.training_activity || 0);
    
    const hasBadge = currentBadges?.find(b => b.badge_id === badge.id);
    
    if (meetsExam && meetsTraining && !hasBadge) {
      await awardBadge(supabase, userId, badge.id, metricsToUse);
    } else if ((!meetsExam || !meetsTraining) && hasBadge) {
      await revokeBadge(supabase, hasBadge.id);
    }
  }
}

async function awardBadge(
  supabase: any, 
  userId: string, 
  badgeId: string, 
  metrics: UserMetrics,
  expiresAt?: string
) {
  console.log(`Awarding badge ${badgeId} to user ${userId}`);
  
  const { error } = await supabase
    .from('user_badges')
    .insert({
      user_id: userId,
      badge_id: badgeId,
      awarded_at: new Date().toISOString(),
      expires_at: expiresAt || null,
      evaluation_period_start: metrics.period_start,
      evaluation_period_end: metrics.period_end,
      performance_data: {
        exam_performance: metrics.exam_performance_pct,
        training_activity: metrics.training_activity_pct,
        years_of_service: metrics.years_of_service
      }
    });
  
  if (error) {
    console.error(`Error awarding badge:`, error);
  }
}

async function revokeBadge(supabase: any, userBadgeId: string) {
  console.log(`Revoking badge ${userBadgeId}`);
  
  const { error } = await supabase
    .from('user_badges')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', userBadgeId);
  
  if (error) {
    console.error(`Error revoking badge:`, error);
  }
}
