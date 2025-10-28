-- First check and drop the leaderboard_cache if it exists
DROP TABLE IF EXISTS public.leaderboard_cache CASCADE;

-- Drop existing auth-related tables
DROP TABLE IF EXISTS public.scores CASCADE;
DROP TABLE IF EXISTS public.exams CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create a simple table to cache leaderboard data for better performance
CREATE TABLE public.leaderboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  total_points INTEGER DEFAULT 0,
  course_completions INTEGER DEFAULT 0,
  last_activity TIMESTAMPTZ,
  rank INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Enable RLS but allow public read access
ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;

-- Public read policy
CREATE POLICY "Leaderboard is publicly readable"
  ON public.leaderboard_cache FOR SELECT
  USING (true);

-- Create index for performance
CREATE INDEX idx_leaderboard_rank ON public.leaderboard_cache(rank);
CREATE INDEX idx_leaderboard_points ON public.leaderboard_cache(total_points DESC);