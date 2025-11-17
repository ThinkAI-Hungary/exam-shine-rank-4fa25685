-- Add unique constraint to prevent duplicate exam results for same user and exam
ALTER TABLE public.exam_results 
ADD CONSTRAINT exam_results_user_exam_unique UNIQUE (user_id, exam_id);