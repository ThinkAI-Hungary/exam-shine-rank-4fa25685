-- Create sync_queue table for managing background sync process
CREATE TABLE public.sync_queue (
  user_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  last_attempt_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- Allow public read for progress tracking
CREATE POLICY "Sync queue is publicly readable"
ON public.sync_queue
FOR SELECT
USING (true);

-- Allow anyone to insert/update for sync process
CREATE POLICY "Sync queue can be managed"
ON public.sync_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime for sync_queue to track progress
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_queue;