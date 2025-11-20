-- Phase 1: Badge System Database Schema

-- Create enums for badge system
CREATE TYPE public.training_type AS ENUM ('START_program', 'online_training', 'video', 'learning_material');
CREATE TYPE public.badge_type AS ENUM ('category', 'monthly_star', 'progress', 'aspirant');
CREATE TYPE public.warning_type AS ENUM ('yellow_card', 'red_card');
CREATE TYPE public.evaluation_period AS ENUM ('current_month', 'last_6_months', 'last_year', 'monthly', 'half_yearly', 'yearly', 'permanent');

-- 1. Training Activities Table
CREATE TABLE public.training_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  training_type training_type NOT NULL,
  training_name TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completion_date DATE,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Badge Definitions Table
CREATE TABLE public.badge_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_type badge_type NOT NULL,
  badge_name TEXT NOT NULL,
  badge_level TEXT,
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL,
  color TEXT NOT NULL,
  criteria JSONB NOT NULL,
  evaluation_period evaluation_period NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. User Badges Table
CREATE TABLE public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  badge_id UUID REFERENCES badge_definitions(id) ON DELETE CASCADE,
  awarded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  evaluation_period_start DATE,
  evaluation_period_end DATE,
  performance_data JSONB,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. User Performance Metrics Table
CREATE TABLE public.user_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  evaluation_period evaluation_period NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  exam_performance_pct NUMERIC(5,2) DEFAULT 0,
  training_activity_pct NUMERIC(5,2) DEFAULT 0,
  overall_performance_pct NUMERIC(5,2) DEFAULT 0,
  successful_exams_count INTEGER DEFAULT 0,
  total_exams_count INTEGER DEFAULT 0,
  completed_trainings_count INTEGER DEFAULT 0,
  available_trainings_count INTEGER DEFAULT 0,
  years_of_service NUMERIC(5,2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, evaluation_period, period_start, period_end)
);

-- 5. Performance Warnings Table
CREATE TABLE public.performance_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  warning_type warning_type NOT NULL,
  current_category TEXT,
  evaluation_date DATE NOT NULL,
  exam_performance_pct NUMERIC(5,2),
  training_activity_pct NUMERIC(5,2),
  action_plan_due_date DATE,
  action_plan_notes TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resulted_in_downgrade BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Update Users Table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_category TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS category_achieved_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX idx_training_activities_user_id ON training_activities(user_id);
CREATE INDEX idx_training_activities_completion ON training_activities(user_id, completed, completion_date);
CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_user_badges_active ON user_badges(user_id, awarded_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_performance_user_period ON user_performance_metrics(user_id, evaluation_period);
CREATE INDEX idx_performance_warnings_user ON performance_warnings(user_id, resolved);

-- Enable Row Level Security
ALTER TABLE public.training_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_warnings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read access for transparency
CREATE POLICY "Training activities are publicly readable"
  ON public.training_activities FOR SELECT
  USING (true);

CREATE POLICY "Badge definitions are publicly readable"
  ON public.badge_definitions FOR SELECT
  USING (true);

CREATE POLICY "User badges are publicly readable"
  ON public.user_badges FOR SELECT
  USING (true);

CREATE POLICY "Performance metrics are publicly readable"
  ON public.user_performance_metrics FOR SELECT
  USING (true);

-- Performance warnings are admin-only (sensitive data)
CREATE POLICY "Admins can view all warnings"
  ON public.performance_warnings FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage warnings"
  ON public.performance_warnings FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Insert initial badge definitions
INSERT INTO public.badge_definitions (badge_type, badge_name, badge_level, description, icon_name, color, criteria, evaluation_period) VALUES
-- Category Badges
('category', 'Bronze', 'bronze', '3+ years, 80% exam performance, 70% training activity', 'Medal', '#CD7F32', '{"years": 3, "exam_perf": 80, "training_activity": 70, "overall": 75}', 'permanent'),
('category', 'Silver', 'silver', '5+ years, 85% exam performance, 80% training activity', 'Medal', '#C0C0C0', '{"years": 5, "exam_perf": 85, "training_activity": 80, "overall": 82.5}', 'permanent'),
('category', 'Gold', 'gold', '10+ years, 90% exam performance, 90% training activity', 'Award', '#FFD700', '{"years": 10, "exam_perf": 90, "training_activity": 90, "overall": 90}', 'permanent'),

-- Aspirant Badges
('aspirant', 'Future Bronze', 'bronze', 'Performance meets Bronze requirements, awaiting tenure', 'TrendingUp', '#B8860B', '{"years": 0, "exam_perf": 80, "training_activity": 70}', 'permanent'),
('aspirant', 'Future Silver', 'silver', 'Performance meets Silver requirements, awaiting tenure', 'TrendingUp', '#708090', '{"years": 0, "exam_perf": 85, "training_activity": 80}', 'permanent'),
('aspirant', 'Future Gold', 'gold', 'Performance meets Gold requirements, awaiting tenure', 'TrendingUp', '#DAA520', '{"years": 0, "exam_perf": 90, "training_activity": 90}', 'permanent'),

-- Monthly Star Badges
('monthly_star', 'Exam Master of the Month', null, 'Highest exam average this month', 'Star', '#FF6B6B', '{"min_score": 80, "rank": 1}', 'monthly'),
('monthly_star', 'Training Champion', null, '100% training participation this month', 'Trophy', '#4ECDC4', '{"training_activity": 100}', 'monthly'),
('monthly_star', 'Starter Success', null, 'New colleagues with 80%+ average in first 3 months', 'Rocket', '#95E1D3', '{"months": 3, "exam_perf": 80}', 'monthly'),

-- Half-Year Progress Badges
('progress', 'Consistent Performer', null, '75% exam performance, 65% training activity over 1 year', 'Target', '#A8E6CF', '{"exam_perf": 75, "training_activity": 65, "period": "yearly"}', 'yearly'),
('progress', 'Outstanding Progress', null, '85% exam performance, 75% training activity over 6 months', 'Zap', '#FFD93D', '{"exam_perf": 85, "training_activity": 75, "period": "half_yearly"}', 'half_yearly'),
('progress', 'Master Performance', null, '90% exam performance, 85% training activity over 1 year', 'Crown', '#6C5CE7', '{"exam_perf": 90, "training_activity": 85, "period": "yearly"}', 'yearly');