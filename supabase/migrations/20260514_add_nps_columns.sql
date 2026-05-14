-- Add NPS (Net Promoter Score) columns to users table
-- NPS data comes from LearnWorlds user profile API: nps_score (0-10) + nps_comment
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS nps_score SMALLINT,
ADD COLUMN IF NOT EXISTS nps_comment TEXT;

-- Create index for NPS analytics
CREATE INDEX IF NOT EXISTS idx_users_nps_score ON public.users (nps_score) WHERE nps_score IS NOT NULL;
