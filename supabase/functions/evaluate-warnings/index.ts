import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserMetrics {
  user_id: string;
  exam_performance_pct: number;
  training_activity_pct: number;
  years_of_service: number;
}

interface CategoryRequirements {
  bronze: { exam_perf: number; training_activity: number };
  silver: { exam_perf: number; training_activity: number };
  gold: { exam_perf: number; training_activity: number };
}

// Category requirements - must meet ALL three conditions
const CATEGORY_REQUIREMENTS: CategoryRequirements = {
  bronze: { exam_perf: 80, training_activity: 70 },
  silver: { exam_perf: 85, training_activity: 80 },
  gold: { exam_perf: 90, training_activity: 90 }
};

const BATCH_SIZE = 50; // Process 50 users at a time

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let user_id: string | undefined;
    
    try {
      const body = await req.text();
      if (body && body.trim()) {
        const parsed = JSON.parse(body);
        user_id = parsed.user_id;
      }
    } catch {
      console.log('No valid JSON body provided, evaluating all users');
    }
    
    console.log(`Starting warning evaluation for user: ${user_id || 'all'}`);

    // Get users to evaluate - only those with a current category
    let usersToEvaluate: Array<{ 
      user_id: string; 
      current_category: string | null;
      last_demotion_date: string | null;
      demoted_from_category: string | null;
    }> = [];
    
    if (user_id) {
      const { data: user, error } = await supabase
        .from('users')
        .select('user_id, current_category, last_demotion_date, demoted_from_category')
        .eq('user_id', user_id)
        .single();
      if (error) throw error;
      usersToEvaluate = [user];
    } else {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('user_id, current_category, last_demotion_date, demoted_from_category')
        .not('current_category', 'is', null);
      if (usersError) throw usersError;
      usersToEvaluate = users || [];
    }

    let yellowCardsIssued = 0;
    let redCardsIssued = 0;
    let downgrades = 0;
    let warningsResolved = 0;
    let totalProcessed = 0;

    // Process users in batches
    for (let i = 0; i < usersToEvaluate.length; i += BATCH_SIZE) {
      const batch = usersToEvaluate.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(usersToEvaluate.length / BATCH_SIZE)}`);

      for (const user of batch) {
        const userId = user.user_id;
        const currentCategory = user.current_category;

        if (!currentCategory) continue;

        console.log(`Evaluating warnings for user: ${userId} (category: ${currentCategory})`);

        // Update performance metrics for last year (the evaluation period)
        await supabase.rpc('update_user_performance_metrics', {
          p_user_id: userId,
          p_evaluation_period: 'last_year'
        });

        // Get user's yearly metrics
        const { data: metrics, error: metricsError } = await supabase
          .from('user_performance_metrics')
          .select('*')
          .eq('user_id', userId)
          .eq('evaluation_period', 'last_year')
          .single();

        if (metricsError || !metrics) {
          console.error(`Error fetching metrics for ${userId}:`, metricsError);
          continue;
        }

        // Get category requirements
        const requirements = CATEGORY_REQUIREMENTS[currentCategory.toLowerCase() as keyof CategoryRequirements];
        if (!requirements) {
          console.log(`Unknown category ${currentCategory} for user ${userId}`);
          continue;
        }

        // Check if user meets category requirements
        const meetsExamRequirement = metrics.exam_performance_pct >= requirements.exam_perf;
        const meetsTrainingRequirement = metrics.training_activity_pct >= requirements.training_activity;
        const meetsRequirements = meetsExamRequirement && meetsTrainingRequirement;

        // Get existing warnings
        const { data: existingWarnings } = await supabase
          .from('performance_warnings')
          .select('*')
          .eq('user_id', userId)
          .eq('resolved', false)
          .order('created_at', { ascending: false });

        if (meetsRequirements) {
          // ============= USER MEETS REQUIREMENTS - RESOLVE WARNINGS =============
          for (const warning of existingWarnings || []) {
            await supabase
              .from('performance_warnings')
              .update({ 
                resolved: true, 
                resolved_at: new Date().toISOString() 
              })
              .eq('id', warning.id);
            warningsResolved++;
          }
          console.log(`User ${userId} meets requirements, resolved ${existingWarnings?.length || 0} warnings`);
        } else {
          // ============= USER DOESN'T MEET REQUIREMENTS =============
          const hasYellowCard = existingWarnings?.find(w => w.warning_type === 'yellow_card');
          const hasRedCard = existingWarnings?.find(w => w.warning_type === 'red_card');

          if (hasRedCard) {
            // ============= RED CARD EXISTS - CHECK FOR DOWNGRADE =============
            if (hasRedCard.action_plan_due_date) {
              const dueDate = new Date(hasRedCard.action_plan_due_date);
              if (new Date() > dueDate) {
                // Action plan period passed - DOWNGRADE
                const downgradeResult = await downgradeCategory(supabase, userId, currentCategory, metrics);
                
                if (downgradeResult.success) {
                  await supabase
                    .from('performance_warnings')
                    .update({ 
                      resulted_in_downgrade: true,
                      resolved: true,
                      resolved_at: new Date().toISOString()
                    })
                    .eq('id', hasRedCard.id);
                  downgrades++;
                  console.log(`Downgraded user ${userId} from ${currentCategory} to ${downgradeResult.newCategory}`);
                }
              } else {
                console.log(`User ${userId} has active red card, due date: ${hasRedCard.action_plan_due_date}`);
              }
            }
          } else if (hasYellowCard) {
            // ============= YELLOW CARD EXISTS - CHECK FOR RED CARD =============
            if (hasYellowCard.action_plan_due_date) {
              const dueDate = new Date(hasYellowCard.action_plan_due_date);
              if (new Date() > dueDate) {
                // Action plan period passed - ISSUE RED CARD
                await issueRedCard(supabase, userId, currentCategory, metrics, hasYellowCard.id);
                
                // Resolve the yellow card
                await supabase
                  .from('performance_warnings')
                  .update({ 
                    resolved: true,
                    resolved_at: new Date().toISOString()
                  })
                  .eq('id', hasYellowCard.id);
                  
                redCardsIssued++;
                console.log(`Issued red card to user ${userId} (yellow card period expired)`);
              } else {
                console.log(`User ${userId} has active yellow card, due date: ${hasYellowCard.action_plan_due_date}`);
              }
            }
          } else {
            // ============= NO WARNINGS - ISSUE YELLOW CARD =============
            await issueYellowCard(supabase, userId, currentCategory, metrics);
            yellowCardsIssued++;
            console.log(`Issued yellow card to user ${userId}`);
          }
        }

        totalProcessed++;
      }
    }

    console.log(`Warning evaluation complete. Processed: ${totalProcessed}, Yellow: ${yellowCardsIssued}, Red: ${redCardsIssued}, Downgrades: ${downgrades}, Resolved: ${warningsResolved}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        users_evaluated: totalProcessed,
        yellow_cards_issued: yellowCardsIssued,
        red_cards_issued: redCardsIssued,
        downgrades: downgrades,
        warnings_resolved: warningsResolved
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in evaluate-warnings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function issueYellowCard(
  supabase: any,
  userId: string,
  currentCategory: string,
  metrics: UserMetrics
) {
  const actionPlanDueDate = new Date();
  actionPlanDueDate.setMonth(actionPlanDueDate.getMonth() + 3); // 3-month action plan

  const requirements = CATEGORY_REQUIREMENTS[currentCategory.toLowerCase() as keyof CategoryRequirements];
  
  const { error } = await supabase
    .from('performance_warnings')
    .insert({
      user_id: userId,
      warning_type: 'yellow_card',
      current_category: currentCategory,
      evaluation_date: new Date().toISOString().split('T')[0],
      exam_performance_pct: metrics.exam_performance_pct,
      training_activity_pct: metrics.training_activity_pct,
      action_plan_due_date: actionPlanDueDate.toISOString().split('T')[0],
      action_plan_notes: `WARNING: Performance below ${currentCategory} requirements.\n\n` +
        `Current: Exam ${metrics.exam_performance_pct?.toFixed(1) || 0}%, Training ${metrics.training_activity_pct?.toFixed(1) || 0}%\n` +
        `Required: Exam ${requirements?.exam_perf}%, Training ${requirements?.training_activity}%\n\n` +
        `3-month action plan to improve performance. Failure to improve will result in a Red Card.`,
      resolved: false
    });

  if (error) {
    console.error('Error issuing yellow card:', error);
  }
}

async function issueRedCard(
  supabase: any,
  userId: string,
  currentCategory: string,
  metrics: UserMetrics,
  previousYellowCardId: string
) {
  const actionPlanDueDate = new Date();
  actionPlanDueDate.setMonth(actionPlanDueDate.getMonth() + 3); // 3-month final warning

  const requirements = CATEGORY_REQUIREMENTS[currentCategory.toLowerCase() as keyof CategoryRequirements];
  const downgradeTo = getDowngradeCategory(currentCategory);

  const { error } = await supabase
    .from('performance_warnings')
    .insert({
      user_id: userId,
      warning_type: 'red_card',
      current_category: currentCategory,
      evaluation_date: new Date().toISOString().split('T')[0],
      exam_performance_pct: metrics.exam_performance_pct,
      training_activity_pct: metrics.training_activity_pct,
      action_plan_due_date: actionPlanDueDate.toISOString().split('T')[0],
      action_plan_notes: `FINAL WARNING: Category demotion imminent.\n\n` +
        `Current: Exam ${metrics.exam_performance_pct?.toFixed(1) || 0}%, Training ${metrics.training_activity_pct?.toFixed(1) || 0}%\n` +
        `Required: Exam ${requirements?.exam_perf}%, Training ${requirements?.training_activity}%\n\n` +
        `Previous yellow card was not addressed. Must improve within 3 months or face ` +
        `demotion from ${currentCategory} to ${downgradeTo || 'removal of category'}.`,
      resolved: false
    });

  if (error) {
    console.error('Error issuing red card:', error);
  }
}

async function downgradeCategory(
  supabase: any,
  userId: string,
  currentCategory: string,
  metrics: UserMetrics
): Promise<{ success: boolean; newCategory: string | null }> {
  const downgradeTo = getDowngradeCategory(currentCategory);
  
  if (downgradeTo === null) {
    // Cannot downgrade from bronze - remove category entirely
    console.log(`Cannot downgrade from ${currentCategory}, removing category`);
    
    await supabase
      .from('users')
      .update({ 
        current_category: null,
        last_demotion_date: new Date().toISOString(),
        demoted_from_category: currentCategory
      })
      .eq('user_id', userId);

    // Revoke all category badges
    await revokeAllCategoryBadges(supabase, userId);

    // Log to category history
    await supabase
      .from('category_history')
      .insert({
        user_id: userId,
        previous_category: currentCategory,
        new_category: null,
        change_type: 'demotion',
        change_reason: 'Failed to meet requirements after red card warning period',
        performance_snapshot: {
          exam_performance: metrics.exam_performance_pct,
          training_activity: metrics.training_activity_pct,
          years_of_service: metrics.years_of_service
        }
      });

    return { success: true, newCategory: null };
  }

  // Update user's category
  await supabase
    .from('users')
    .update({ 
      current_category: downgradeTo,
      category_achieved_at: new Date().toISOString(),
      last_demotion_date: new Date().toISOString(),
      demoted_from_category: currentCategory
    })
    .eq('user_id', userId);

  // Revoke old category badge
  await revokeAllCategoryBadges(supabase, userId);

  // Award new category badge
  const { data: newBadge } = await supabase
    .from('badge_definitions')
    .select('id')
    .eq('badge_type', 'category')
    .eq('badge_level', downgradeTo)
    .single();

  if (newBadge) {
    await supabase
      .from('user_badges')
      .insert({
        user_id: userId,
        badge_id: newBadge.id,
        awarded_at: new Date().toISOString(),
        performance_data: {
          exam_performance: metrics.exam_performance_pct,
          training_activity: metrics.training_activity_pct,
          years_of_service: metrics.years_of_service,
          downgraded_from: currentCategory
        }
      });
  }

  // Log to category history
  await supabase
    .from('category_history')
    .insert({
      user_id: userId,
      previous_category: currentCategory,
      new_category: downgradeTo,
      change_type: 'demotion',
      change_reason: 'Failed to meet requirements after red card warning period',
      performance_snapshot: {
        exam_performance: metrics.exam_performance_pct,
        training_activity: metrics.training_activity_pct,
        years_of_service: metrics.years_of_service
      }
    });

  return { success: true, newCategory: downgradeTo };
}

async function revokeAllCategoryBadges(supabase: any, userId: string) {
  const { data: categoryBadges } = await supabase
    .from('user_badges')
    .select('id, badge_definitions!inner(badge_type)')
    .eq('user_id', userId)
    .eq('badge_definitions.badge_type', 'category')
    .is('revoked_at', null);

  for (const badge of categoryBadges || []) {
    await supabase
      .from('user_badges')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', badge.id);
  }
}

function getDowngradeCategory(currentCategory: string): string | null {
  const categoryMap: Record<string, string | null> = {
    'gold': 'silver',
    'silver': 'bronze',
    'bronze': null // Cannot downgrade from bronze - category removed
  };
  
  return categoryMap[currentCategory.toLowerCase()] || null;
}
