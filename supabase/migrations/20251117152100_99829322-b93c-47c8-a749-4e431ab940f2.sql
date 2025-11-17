-- Create users table to store all user information
CREATE TABLE IF NOT EXISTS public.users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Make users table publicly readable
CREATE POLICY "Users are publicly readable"
ON public.users
FOR SELECT
USING (true);

-- Migrate existing data from leaderboard_cache to users table
INSERT INTO public.users (user_id, username, email)
SELECT DISTINCT user_id, username, email
FROM public.leaderboard_cache
ON CONFLICT (user_id) DO UPDATE
SET username = EXCLUDED.username,
    email = EXCLUDED.email,
    updated_at = now();

-- Remove username and email columns from leaderboard_cache
ALTER TABLE public.leaderboard_cache 
DROP COLUMN IF EXISTS username,
DROP COLUMN IF EXISTS email;