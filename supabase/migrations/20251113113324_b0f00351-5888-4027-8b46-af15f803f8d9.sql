-- Create refresh logs table to track leaderboard refresh events
CREATE TABLE IF NOT EXISTS public.refresh_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_identifier text,
  api_calls integer,
  error_message text,
  is_selective_refresh boolean NOT NULL DEFAULT false,
  selected_user_id text,
  timestamp timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.refresh_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert logs (since there's no auth system)
CREATE POLICY "Anyone can insert refresh logs" 
ON public.refresh_logs 
FOR INSERT 
WITH CHECK (true);

-- Allow anyone to read logs (for transparency)
CREATE POLICY "Refresh logs are publicly readable" 
ON public.refresh_logs 
FOR SELECT 
USING (true);

-- Create index for faster timestamp queries
CREATE INDEX IF NOT EXISTS idx_refresh_logs_timestamp ON public.refresh_logs(timestamp DESC);