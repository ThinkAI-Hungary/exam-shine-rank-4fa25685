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
    first_months?: number;
    complete_all?: boolean;
    training_activity_100?: boolean;
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
  total_exams_count: number;
  period_start: string;
  period_end: string;
}

interface UserData {
  user_id: string;
  start_of_empl: string | null;
  current_category: string | null;
  last_demotion_date: string | null;
  demoted_from_category: string | null;
}

const BATCH_SIZE = 50; // Process 50 users at a time to avoid timeouts

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body safely
    let user_id: string | undefined;
    let evaluation_type: string | undefined;
    
    try {
      const body = await req.text();
      if (body && body.trim()) {
        const parsed = JSON.parse(body);
        user_id = parsed.user_id;
        evaluation_type = parsed.evaluation_type;
      }
    } catch (parseError) {
      console.log('No valid JSON body provided, evaluating all users');
    }
    
    console.log(`Starting badge evaluation for user: ${user_id || 'all'}, type: ${evaluation_type || 'all'}`);

    // Get badge definitions
    const { data: badges, error: badgesError } = await supabase
      .from('badge_definitions')
      .select('*');

    if (badgesError) throw badgesError;

    // Get users to evaluate with their data
    let usersToEvaluate: UserData[] = [];
    if (user_id) {
      const { data: user, error } = await supabase
        .from('users')
        .select('user_id, start_of_empl, current_category, last_demotion_date, demoted_from_category')
        .eq('user_id', user_id)
        .single();
      if (error) throw error;
      usersToEvaluate = [user];
    } else {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('user_id, start_of_empl, current_category, last_demotion_date, demoted_from_category');
      if (usersError) throw usersError;
      usersToEvaluate = users || [];
    }

    let totalAwarded = 0;
    let totalRevoked = 0;
    let totalProcessed = 0;

    // Process users in batches
    for (let i = 0; i < usersToEvaluate.length; i += BATCH_SIZE) {
      const batch = usersToEvaluate.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(usersToEvaluate.length / BATCH_SIZE)}`);

      for (const userData of batch) {
        const userId = userData.user_id;
        console.log(`Evaluating badges for user: ${userId}`);

        // Update performance metrics first (parallel for different periods)
        await Promise.all([
          supabase.rpc('update_user_performance_metrics', {
            p_user_id: userId,
            p_evaluation_period: 'current_month'
          }),
          supabase.rpc('update_user_performance_metrics', {
            p_user_id: userId,
            p_evaluation_period: 'last_6_months'
          }),
          supabase.rpc('update_user_performance_metrics', {
            p_user_id: userId,
            p_evaluation_period: 'last_year'
          })
        ]);

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

        // ============= CATEGORY BADGES =============
        const categoryBadges = badges.filter(b => b.badge_type === 'category') as BadgeDefinition[];
        const eligibleCategory = evaluateCategoryBadges(currentMonthMetrics, categoryBadges);
        
        // Check re-promotion lockout (1-year waiting period after demotion)
        const canBePromoted = checkRePromotionEligibility(userData, eligibleCategory);
        
        if (eligibleCategory && canBePromoted) {
          const hasCategory = currentBadges?.find(b => 
            b.badge_definitions?.badge_type === 'category' && !b.revoked_at
          );
          
          if (!hasCategory || hasCategory.badge_id !== eligibleCategory.id) {
            // Check if this is a promotion
            const isPromotion = !hasCategory || 
              getCategoryRank(eligibleCategory.badge_level) > getCategoryRank(hasCategory?.badge_definitions?.badge_level);
            
            if (isPromotion || !hasCategory) {
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

              // Log category history
              await supabase
                .from('category_history')
                .insert({
                  user_id: userId,
                  previous_category: hasCategory?.badge_definitions?.badge_level || null,
                  new_category: eligibleCategory.badge_level,
                  change_type: hasCategory ? 'promotion' : 'initial',
                  change_reason: 'Met all category requirements',
                  performance_snapshot: {
                    exam_performance: currentMonthMetrics.exam_performance_pct,
                    training_activity: currentMonthMetrics.training_activity_pct,
                    years_of_service: currentMonthMetrics.years_of_service
                  }
                });
            }
          }
        }

        // ============= ASPIRANT BADGES =============
        const aspirantBadges = badges.filter(b => b.badge_type === 'aspirant') as BadgeDefinition[];
        const eligibleAspirant = evaluateAspirantBadges(currentMonthMetrics, aspirantBadges, eligibleCategory);
        
        if (eligibleAspirant) {
          const hasAspirant = currentBadges?.find(b => b.badge_id === eligibleAspirant.id);
          if (!hasAspirant) {
            // Revoke lower aspirant badges first
            const currentAspirantBadges = currentBadges?.filter(b => 
              b.badge_definitions?.badge_type === 'aspirant'
            );
            for (const badge of currentAspirantBadges || []) {
              await revokeBadge(supabase, badge.id);
              totalRevoked++;
            }
            
            await awardBadge(supabase, userId, eligibleAspirant.id, currentMonthMetrics);
            totalAwarded++;
          }
        } else {
          // Revoke aspirant badges if no longer eligible (e.g., got a full category)
          const currentAspirantBadges = currentBadges?.filter(b => 
            b.badge_definitions?.badge_type === 'aspirant'
          );
          for (const badge of currentAspirantBadges || []) {
            await revokeBadge(supabase, badge.id);
            totalRevoked++;
          }
        }

        // ============= MONTHLY STAR BADGES =============
        if (!evaluation_type || evaluation_type === 'monthly' || new Date().getDate() === 1) {
          const monthlyResult = await evaluateMonthlyBadges(
            supabase, userId, badges, currentMonthMetrics, currentBadges, userData
          );
          totalAwarded += monthlyResult.awarded;
          totalRevoked += monthlyResult.revoked;
        }

        // ============= PROGRESS BADGES =============
        if (last6MonthsMetrics && lastYearMetrics) {
          const progressResult = await evaluateProgressBadges(
            supabase, userId, badges, last6MonthsMetrics, lastYearMetrics, currentBadges
          );
          totalAwarded += progressResult.awarded;
          totalRevoked += progressResult.revoked;
        }

        totalProcessed++;
      }
    }

    // ============= EXAM MASTER OF THE MONTH (Cross-user ranking) =============
    if (!evaluation_type || evaluation_type === 'monthly') {
      const examMasterResult = await evaluateExamMasterOfMonth(supabase, badges);
      totalAwarded += examMasterResult.awarded;
    }

    console.log(`Badge evaluation complete. Processed: ${totalProcessed}, Awarded: ${totalAwarded}, Revoked: ${totalRevoked}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        users_evaluated: totalProcessed,
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

function getCategoryRank(level: string | null): number {
  if (!level) return 0;
  const ranks: Record<string, number> = { 'bronze': 1, 'silver': 2, 'gold': 3 };
  return ranks[level.toLowerCase()] || 0;
}

function checkRePromotionEligibility(userData: UserData, targetCategory: BadgeDefinition | null): boolean {
  if (!targetCategory || !userData.last_demotion_date || !userData.demoted_from_category) {
    return true; // No demotion history, eligible
  }

  const demotionDate = new Date(userData.last_demotion_date);
  const oneYearLater = new Date(demotionDate);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  // If trying to get back to the category they were demoted from
  if (targetCategory.badge_level?.toLowerCase() === userData.demoted_from_category.toLowerCase()) {
    if (new Date() < oneYearLater) {
      console.log(`User ${userData.user_id} still in 1-year lockout period for ${userData.demoted_from_category}`);
      return false;
    }
  }

  return true;
}

function evaluateCategoryBadges(metrics: UserMetrics, badges: BadgeDefinition[]): BadgeDefinition | null {
  // Sort by level (Gold > Silver > Bronze) to get highest eligible
  const sortedBadges = [...badges].sort((a, b) => 
    getCategoryRank(b.badge_level) - getCategoryRank(a.badge_level)
  );
  
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
  
  // Sort by level (Gold > Silver > Bronze) to get highest eligible
  const sortedBadges = [...badges].sort((a, b) => 
    getCategoryRank(b.badge_level) - getCategoryRank(a.badge_level)
  );
  
  for (const badge of sortedBadges) {
    const meetsExam = metrics.exam_performance_pct >= (badge.criteria.exam_perf || 0);
    const meetsTraining = metrics.training_activity_pct >= (badge.criteria.training_activity || 0);
    
    // Aspirant badges don't require years of service (that's the point)
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
  currentBadges: any[],
  userData: UserData
): Promise<{ awarded: number; revoked: number }> {
  const monthlyBadges = allBadges.filter(b => b.badge_type === 'monthly_star');
  let awarded = 0;
  let revoked = 0;
  
  // Expire old monthly badges
  const oldMonthlyBadges = currentBadges?.filter(b => 
    b.badge_definitions?.badge_type === 'monthly_star' && 
    b.expires_at && new Date(b.expires_at) < new Date()
  );
  
  for (const badge of oldMonthlyBadges || []) {
    await revokeBadge(supabase, badge.id);
    revoked++;
  }
  
  // ============= STARTER SUCCESS / KEZDŐ SIKER =============
  const starterBadge = monthlyBadges.find(b => 
    b.badge_name === 'Kezdő Siker' || b.badge_name === 'Starter Success'
  );
  
  if (starterBadge && userData.start_of_empl) {
    const hasStarter = currentBadges?.find(b => b.badge_id === starterBadge.id && !b.revoked_at);
    
    if (!hasStarter) {
      const startDate = new Date(userData.start_of_empl);
      const threeMonthsLater = new Date(startDate);
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      const now = new Date();
      
      // Only evaluate if within first 3 months AND has 80%+ exam performance
      if (now <= threeMonthsLater && metrics.exam_performance_pct >= 80) {
        console.log(`Awarding Starter Success badge to ${userId}`);
        await awardBadge(supabase, userId, starterBadge.id, metrics);
        awarded++;
      }
    }
  }
  
  // ============= TRAINING CHAMPION / KÉPZÉSI BAJNOK =============
  const trainingChampBadge = monthlyBadges.find(b => 
    b.badge_name === 'Training Champion' || b.badge_name === 'Képzési Bajnok'
  );
  
  if (trainingChampBadge && metrics.training_activity_pct === 100) {
    const hasChamp = currentBadges?.find(b => 
      b.badge_id === trainingChampBadge.id && !b.revoked_at &&
      b.expires_at && new Date(b.expires_at) > new Date()
    );
    
    if (!hasChamp) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      console.log(`Awarding Training Champion badge to ${userId}`);
      await awardBadge(supabase, userId, trainingChampBadge.id, metrics, nextMonth.toISOString());
      awarded++;
    }
  }
  
  return { awarded, revoked };
}

async function evaluateExamMasterOfMonth(
  supabase: any,
  allBadges: BadgeDefinition[]
): Promise<{ awarded: number }> {
  let awarded = 0;
  
  const examMasterBadge = allBadges.find(b => 
    b.badge_type === 'monthly_star' && 
    (b.badge_name === 'Hónap Vizsga Mestere' || b.badge_name === 'Exam Master of the Month')
  );
  
  if (!examMasterBadge) return { awarded: 0 };
  
  // Get the current month's date range
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  // Find the user with the highest average score this month (min 80% to qualify)
  const { data: topPerformer } = await supabase
    .from('exam_results')
    .select('user_id, score')
    .gte('completed_at', monthStart.toISOString())
    .lte('completed_at', monthEnd.toISOString())
    .gte('score', 80);
  
  if (!topPerformer || topPerformer.length === 0) {
    console.log('No qualifying exam results for Exam Master this month');
    return { awarded: 0 };
  }
  
  // Aggregate scores by user
  const userScores: Record<string, { totalScore: number; examCount: number; avgTime?: number }> = {};
  
  for (const result of topPerformer) {
    if (!userScores[result.user_id]) {
      userScores[result.user_id] = { totalScore: 0, examCount: 0 };
    }
    userScores[result.user_id].totalScore += result.score;
    userScores[result.user_id].examCount++;
  }
  
  // Find the user with highest average
  let topUserId: string | null = null;
  let topAverage = 0;
  
  for (const [userId, stats] of Object.entries(userScores)) {
    const avg = stats.totalScore / stats.examCount;
    if (avg > topAverage) {
      topAverage = avg;
      topUserId = userId;
    }
  }
  
  if (!topUserId) return { awarded: 0 };
  
  // Check if already awarded this month
  const { data: existingBadge } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', topUserId)
    .eq('badge_id', examMasterBadge.id)
    .gte('awarded_at', monthStart.toISOString())
    .is('revoked_at', null)
    .single();
  
  if (!existingBadge) {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    console.log(`Awarding Exam Master of the Month to ${topUserId} (avg: ${topAverage.toFixed(2)}%)`);
    
    const { error } = await supabase
      .from('user_badges')
      .insert({
        user_id: topUserId,
        badge_id: examMasterBadge.id,
        awarded_at: new Date().toISOString(),
        expires_at: nextMonth.toISOString(),
        performance_data: {
          average_score: topAverage,
          exam_count: userScores[topUserId].examCount
        }
      });
    
    if (!error) awarded++;
  }
  
  return { awarded };
}

async function evaluateProgressBadges(
  supabase: any,
  userId: string,
  allBadges: BadgeDefinition[],
  last6MonthsMetrics: UserMetrics,
  lastYearMetrics: UserMetrics,
  currentBadges: any[]
): Promise<{ awarded: number; revoked: number }> {
  const progressBadges = allBadges.filter(b => b.badge_type === 'progress');
  let awarded = 0;
  let revoked = 0;
  
  for (const badge of progressBadges) {
    const metricsToUse = badge.criteria.period === 'half_yearly' ? last6MonthsMetrics : lastYearMetrics;
    const meetsExam = metricsToUse.exam_performance_pct >= (badge.criteria.exam_perf || 0);
    const meetsTraining = metricsToUse.training_activity_pct >= (badge.criteria.training_activity || 0);
    
    const hasBadge = currentBadges?.find(b => b.badge_id === badge.id && !b.revoked_at);
    
    if (meetsExam && meetsTraining && !hasBadge) {
      await awardBadge(supabase, userId, badge.id, metricsToUse);
      awarded++;
    } else if ((!meetsExam || !meetsTraining) && hasBadge) {
      await revokeBadge(supabase, hasBadge.id);
      revoked++;
    }
  }
  
  return { awarded, revoked };
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
