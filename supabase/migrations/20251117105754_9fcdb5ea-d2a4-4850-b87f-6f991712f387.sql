-- Remove score_source column from leaderboard_cache as it's no longer needed
ALTER TABLE public.leaderboard_cache 
DROP COLUMN IF EXISTS score_source;