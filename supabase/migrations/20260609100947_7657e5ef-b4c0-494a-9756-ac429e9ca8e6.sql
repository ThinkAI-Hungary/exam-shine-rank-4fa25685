ALTER TABLE public.company_monitoring REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_monitoring;