-- Add columns to track demotion history for re-promotion lockout
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_demotion_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS demoted_from_category text;

-- Create category_history table for tracking all category changes
CREATE TABLE IF NOT EXISTS public.category_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  previous_category text,
  new_category text,
  change_type text NOT NULL CHECK (change_type IN ('promotion', 'demotion', 'initial')),
  change_reason text,
  warning_id uuid REFERENCES public.performance_warnings(id),
  performance_snapshot jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.category_history ENABLE ROW LEVEL SECURITY;

-- Create policies for category_history
CREATE POLICY "Category history is publicly readable" 
ON public.category_history 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage category history" 
ON public.category_history 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_category_history_user_id ON public.category_history(user_id);
CREATE INDEX IF NOT EXISTS idx_category_history_created_at ON public.category_history(created_at DESC);