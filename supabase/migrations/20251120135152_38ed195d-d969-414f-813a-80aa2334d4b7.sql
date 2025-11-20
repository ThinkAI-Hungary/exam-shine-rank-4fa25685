-- Change start_of_empl column to date type
ALTER TABLE public.users 
ALTER COLUMN start_of_empl TYPE date;