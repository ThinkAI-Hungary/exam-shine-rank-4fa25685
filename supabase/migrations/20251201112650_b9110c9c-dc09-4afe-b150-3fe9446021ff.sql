-- Add time_spent_seconds to exam_results table
ALTER TABLE public.exam_results 
ADD COLUMN time_spent_seconds integer DEFAULT NULL;

COMMENT ON COLUMN public.exam_results.time_spent_seconds IS 'Time spent on exam in seconds';

-- Create a new table to track overall course time spent
CREATE TABLE IF NOT EXISTS public.course_time_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  course_id text NOT NULL,
  course_title text NOT NULL,
  total_time_spent_seconds integer DEFAULT 0,
  last_activity_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, course_id)
);

-- Enable RLS on course_time_tracking
ALTER TABLE public.course_time_tracking ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Course time tracking is publicly readable" 
ON public.course_time_tracking 
FOR SELECT 
USING (true);

-- Create index for efficient queries
CREATE INDEX idx_course_time_tracking_user_id ON public.course_time_tracking(user_id);
CREATE INDEX idx_course_time_tracking_course_id ON public.course_time_tracking(course_id);

COMMENT ON TABLE public.course_time_tracking IS 'Tracks total time spent by users on each course';
COMMENT ON COLUMN public.course_time_tracking.total_time_spent_seconds IS 'Total time spent on the course in seconds';