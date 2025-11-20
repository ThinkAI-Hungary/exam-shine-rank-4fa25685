-- Add start_of_empl column to users table
ALTER TABLE public.users 
ADD COLUMN start_of_empl timestamp with time zone;