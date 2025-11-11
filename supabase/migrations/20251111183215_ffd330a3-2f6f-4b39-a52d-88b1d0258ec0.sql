-- Create exam_results table to track individual exam completions
CREATE TABLE IF NOT EXISTS public.exam_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  username text NOT NULL,
  email text,
  course_id text NOT NULL,
  course_title text NOT NULL,
  exam_id text NOT NULL,
  exam_title text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  completed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Exam results are publicly readable" 
ON public.exam_results 
FOR SELECT 
USING (true);

-- Create index for better query performance
CREATE INDEX idx_exam_results_user_id ON public.exam_results(user_id);
CREATE INDEX idx_exam_results_course_id ON public.exam_results(course_id);
CREATE INDEX idx_exam_results_completed_at ON public.exam_results(completed_at DESC);