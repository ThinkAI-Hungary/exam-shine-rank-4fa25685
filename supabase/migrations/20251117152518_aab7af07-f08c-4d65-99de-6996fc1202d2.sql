-- Add foreign key relationship between leaderboard_cache and users
ALTER TABLE public.leaderboard_cache
ADD CONSTRAINT fk_leaderboard_cache_user
FOREIGN KEY (user_id) 
REFERENCES public.users(user_id)
ON DELETE CASCADE;