-- Rename tags column to aruhaz
ALTER TABLE public.users RENAME COLUMN tags TO aruhaz;

-- Add beosztas column for cf_munkakorod tags
ALTER TABLE public.users ADD COLUMN beosztas text[] DEFAULT NULL;