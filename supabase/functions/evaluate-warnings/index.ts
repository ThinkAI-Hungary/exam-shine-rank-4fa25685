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

const CATEGORY_REQUIREMENTS: CategoryRequirements = {
  bronze: { exam_perf: 80, training_activity: 70 },
  silver: { exam_perf: 85, training_activity: 80 },
  gold: { exam_perf: 90, training_activity: 90 }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id } = await req.json();
    
    console.log(`Starting warning evaluation for user: ${user_id || 'all'}`);

    // Get users to evaluate
    let usersToEvaluate: Array<{ user_id: string; current_category: string | null }> = [];
    if (user_id) {
      const { data: user, error } = await supabase
        .from('users')
        .select('user_id, current_category')
        .eq('user_id', user_id)
        .single();
      if (error) throw error;
      usersToEvaluate = [user];
    } else {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('user_id, current_category')
        .not('current_category', 'is', null);
      if (usersError) throw usersError;
      usersToEvaluate = users;
    }

    let yellowCardsIssued = 0;
    let redCardsIssued = 0;
    let downgrades = 0;

    for (const user of usersToEvaluate) {
      const userId = user.user_id;
      const currentCategory = user.current_category;

      if (!currentCategory) continue;

      console.log(`Evaluating warnings for user: ${userId} (category: ${currentCategory})`);

      // Update performance metrics for last year
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

      if (meetsRequirements) {
        // User meets requirements - resolve any active warnings
        const { data: activeWarnings } = await supabase
          .from('performance_warnings')
          .select('*')
          .eq('user_id', userId)
          .eq('resolved', false);

        for (const warning of activeWarnings || []) {
          await supabase
            .from('performance_warnings')
            .update({ 
              resolved: true, 
              resolved_at: new Date().toISOString() 
            })
            .eq('id', warning.id);
        }
        continue;
      }

      // User doesn't meet requirements - check for existing warnings
      const { data: existingWarnings } = await supabase
        .from('performance_warnings')
        .select('*')
        .eq('user_id', userId)
        .eq('resolved', false)
        .order('created_at', { ascending: false });

      const hasYellowCard = existingWarnings?.some(w => w.warning_type === 'yellow_card');
      const hasRedCard = existingWarnings?.some(w => w.warning_type === 'red_card');

      if (hasRedCard) {
        // Already has red card, check if action plan period has passed
        const redCard = existingWarnings?.find(w => w.warning_type === 'red_card');
        if (redCard && redCard.action_plan_due_date) {
          const dueDate = new Date(redCard.action_plan_due_date);
          if (new Date() > dueDate && !meetsRequirements) {
            // Action plan period passed and still not meeting requirements - downgrade
            await downgradeCategory(supabase, userId, currentCategory, metrics);
            await supabase
              .from('performance_warnings')
              .update({ 
                resulted_in_downgrade: true,
                resolved: true,
                resolved_at: new Date().toISOString()
              })
              .eq('id', redCard.id);
            downgrades++;
            console.log(`Downgraded user ${userId} from ${currentCategory}`);
          }
        }
      } else if (hasYellowCard) {
        // Has yellow card, check if action plan period has passed
        const yellowCard = existingWarnings?.find(w => w.warning_type === 'yellow_card');
        if (yellowCard && yellowCard.action_plan_due_date) {
          const dueDate = new Date(yellowCard.action_plan_due_date);
          if (new Date() > dueDate && !meetsRequirements) {
            // Action plan period passed and still not meeting requirements - issue red card
            await issueRedCard(supabase, userId, currentCategory, metrics);
            redCardsIssued++;
            console.log(`Issued red card to user ${userId}`);
          }
        }
      } else {
        // No existing warnings - issue yellow card
        await issueYellowCard(supabase, userId, currentCategory, metrics);
        yellowCardsIssued++;
        console.log(`Issued yellow card to user ${userId}`);
      }
    }

    console.log(`Warning evaluation complete. Yellow cards: ${yellowCardsIssued}, Red cards: ${redCardsIssued}, Downgrades: ${downgrades}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        users_evaluated: usersToEvaluate.length,
        yellow_cards_issued: yellowCardsIssued,
        red_cards_issued: redCardsIssued,
        downgrades: downgrades
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
      action_plan_notes: `3-month action plan to improve performance and maintain ${currentCategory} category`,
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
  metrics: UserMetrics
) {
  const actionPlanDueDate = new Date();
  actionPlanDueDate.setMonth(actionPlanDueDate.getMonth() + 3); // 3-month action plan before downgrade

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
      action_plan_notes: `Final warning: Must improve performance within 3 months or face downgrade`,
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
) {
  const downgradeTo = getDowngradeCategory(currentCategory);
  
  if (!downgradeTo) {
    console.log(`Cannot downgrade from ${currentCategory}`);
    return;
  }

  // Update user's category
  await supabase
    .from('users')
    .update({ 
      current_category: downgradeTo,
      category_achieved_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  // Revoke current category badge
  const { data: categoryBadges } = await supabase
    .from('user_badges')
    .select('id, badge_definitions!inner(badge_type, badge_level)')
    .eq('user_id', userId)
    .eq('badge_definitions.badge_type', 'category')
    .is('revoked_at', null);

  for (const badge of categoryBadges || []) {
    await supabase
      .from('user_badges')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', badge.id);
  }

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
}

function getDowngradeCategory(currentCategory: string): string | null {
  const categoryMap: Record<string, string | null> = {
    'gold': 'silver',
    'silver': 'bronze',
    'bronze': null // Cannot downgrade from bronze
  };
  
  return categoryMap[currentCategory.toLowerCase()] || null;
}
