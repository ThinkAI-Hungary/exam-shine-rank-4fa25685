-- Update leaderboard_cache table to match exam-based scoring model
ALTER TABLE public.leaderboard_cache 
  RENAME COLUMN total_points TO total_score;

ALTER TABLE public.leaderboard_cache 
  RENAME COLUMN course_completions TO exam_count;

-- Add average_score column
ALTER TABLE public.leaderboard_cache 
  ADD COLUMN IF NOT EXISTS average_score numeric DEFAULT 0;

-- Update comment to reflect new purpose
COMMENT ON TABLE public.leaderboard_cache IS 'Stores aggregated exam scores from all courses in LearnWorlds';