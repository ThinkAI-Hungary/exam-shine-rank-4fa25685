-- Fix security warnings: Set search_path for all performance calculation functions

-- Function 1: Calculate Exam Performance (with search_path)
CREATE OR REPLACE FUNCTION public.calculate_exam_performance(
  p_user_id TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg_score NUMERIC;
BEGIN
  SELECT COALESCE(AVG(score), 0)
  INTO v_avg_score
  FROM public.exam_results
  WHERE user_id = p_user_id
    AND completed_at::DATE BETWEEN p_start_date AND p_end_date
    AND score >= 80;
  
  RETURN ROUND(v_avg_score, 2);
END;
$$;

-- Function 2: Calculate Training Activity (with search_path)
CREATE OR REPLACE FUNCTION public.calculate_training_activity(
  p_user_id TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_count INTEGER;
  v_available_count INTEGER;
  v_activity_pct NUMERIC;
  v_start_of_empl DATE;
  v_has_start_program BOOLEAN;
  v_is_first_year BOOLEAN;
BEGIN
  SELECT start_of_empl INTO v_start_of_empl
  FROM public.users
  WHERE user_id = p_user_id;
  
  v_is_first_year := (v_start_of_empl IS NOT NULL AND 
                      p_end_date <= v_start_of_empl + INTERVAL '1 year');
  
  SELECT EXISTS(
    SELECT 1 FROM public.training_activities
    WHERE user_id = p_user_id
      AND training_type = 'START_program'
      AND completed = true
  ) INTO v_has_start_program;
  
  IF v_is_first_year AND v_has_start_program THEN
    RETURN 100.00;
  END IF;
  
  SELECT COUNT(*)
  INTO v_completed_count
  FROM public.training_activities
  WHERE user_id = p_user_id
    AND is_required = true
    AND completed = true
    AND completion_date BETWEEN p_start_date AND p_end_date;
  
  SELECT COUNT(*)
  INTO v_available_count
  FROM public.training_activities
  WHERE user_id = p_user_id
    AND is_required = true
    AND created_at::DATE <= p_end_date;
  
  IF v_available_count > 0 THEN
    v_activity_pct := (v_completed_count::NUMERIC / v_available_count::NUMERIC) * 100;
  ELSE
    v_activity_pct := 0;
  END IF;
  
  RETURN ROUND(v_activity_pct, 2);
END;
$$;

-- Function 3: Calculate Years of Service (with search_path)
CREATE OR REPLACE FUNCTION public.calculate_years_of_service(
  p_user_id TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE;
  v_years NUMERIC;
BEGIN
  SELECT start_of_empl INTO v_start_date
  FROM public.users
  WHERE user_id = p_user_id;
  
  IF v_start_date IS NULL THEN
    RETURN 0;
  END IF;
  
  v_years := EXTRACT(YEAR FROM AGE(p_as_of_date, v_start_date)) + 
             (EXTRACT(MONTH FROM AGE(p_as_of_date, v_start_date)) / 12.0) +
             (EXTRACT(DAY FROM AGE(p_as_of_date, v_start_date)) / 365.0);
  
  RETURN ROUND(v_years, 2);
END;
$$;

-- Function 4: Update User Performance Metrics (with search_path)
CREATE OR REPLACE FUNCTION public.update_user_performance_metrics(
  p_user_id TEXT,
  p_evaluation_period evaluation_period,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_exam_perf NUMERIC;
  v_training_activity NUMERIC;
  v_overall_perf NUMERIC;
  v_years_service NUMERIC;
  v_successful_exams INTEGER;
  v_total_exams INTEGER;
  v_completed_trainings INTEGER;
  v_available_trainings INTEGER;
BEGIN
  v_period_end := COALESCE(p_period_end, CURRENT_DATE);
  
  CASE p_evaluation_period
    WHEN 'current_month' THEN
      v_period_start := DATE_TRUNC('month', v_period_end)::DATE;
    WHEN 'last_6_months' THEN
      v_period_start := (v_period_end - INTERVAL '6 months')::DATE;
    WHEN 'last_year' THEN
      v_period_start := (v_period_end - INTERVAL '1 year')::DATE;
    ELSE
      v_period_start := COALESCE(p_period_start, (v_period_end - INTERVAL '1 year')::DATE);
  END CASE;
  
  v_exam_perf := calculate_exam_performance(p_user_id, v_period_start, v_period_end);
  v_training_activity := calculate_training_activity(p_user_id, v_period_start, v_period_end);
  v_overall_perf := ROUND((v_exam_perf + v_training_activity) / 2.0, 2);
  v_years_service := calculate_years_of_service(p_user_id, v_period_end);
  
  SELECT 
    COUNT(*) FILTER (WHERE score >= 80),
    COUNT(*)
  INTO v_successful_exams, v_total_exams
  FROM public.exam_results
  WHERE user_id = p_user_id
    AND completed_at::DATE BETWEEN v_period_start AND v_period_end;
  
  SELECT 
    COUNT(*) FILTER (WHERE completed = true AND completion_date BETWEEN v_period_start AND v_period_end),
    COUNT(*) FILTER (WHERE created_at::DATE <= v_period_end)
  INTO v_completed_trainings, v_available_trainings
  FROM public.training_activities
  WHERE user_id = p_user_id
    AND is_required = true;
  
  INSERT INTO public.user_performance_metrics (
    user_id, evaluation_period, period_start, period_end,
    exam_performance_pct, training_activity_pct, overall_performance_pct,
    successful_exams_count, total_exams_count,
    completed_trainings_count, available_trainings_count,
    years_of_service, updated_at
  ) VALUES (
    p_user_id, p_evaluation_period, v_period_start, v_period_end,
    v_exam_perf, v_training_activity, v_overall_perf,
    v_successful_exams, v_total_exams,
    v_completed_trainings, v_available_trainings,
    v_years_service, NOW()
  )
  ON CONFLICT (user_id, evaluation_period, period_start, period_end)
  DO UPDATE SET
    exam_performance_pct = EXCLUDED.exam_performance_pct,
    training_activity_pct = EXCLUDED.training_activity_pct,
    overall_performance_pct = EXCLUDED.overall_performance_pct,
    successful_exams_count = EXCLUDED.successful_exams_count,
    total_exams_count = EXCLUDED.total_exams_count,
    completed_trainings_count = EXCLUDED.completed_trainings_count,
    available_trainings_count = EXCLUDED.available_trainings_count,
    years_of_service = EXCLUDED.years_of_service,
    updated_at = NOW();
END;
$$;

-- Function 5: Batch Update (with search_path)
CREATE OR REPLACE FUNCTION public.update_all_users_performance_metrics(
  p_evaluation_period evaluation_period DEFAULT 'current_month'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_updated_count INTEGER := 0;
BEGIN
  FOR v_user_record IN 
    SELECT DISTINCT user_id FROM public.users WHERE user_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM update_user_performance_metrics(
        v_user_record.user_id,
        p_evaluation_period
      );
      v_updated_count := v_updated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error updating metrics for user %: %', v_user_record.user_id, SQLERRM;
    END;
  END LOOP;
  
  RETURN v_updated_count;
END;
$$;