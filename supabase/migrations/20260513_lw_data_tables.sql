-- =============================================
-- LearnWorlds adatszinkron táblák
-- Futtatás: Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Kurzuskatalógus cache
CREATE TABLE IF NOT EXISTS lw_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lw_course_id TEXT UNIQUE NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT,
  price DECIMAL,
  categories TEXT[],
  sections JSONB,
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Beiratkozások
CREATE TABLE IF NOT EXISTS lw_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  lw_course_id TEXT NOT NULL,
  enrolled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_percentage DECIMAL DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, lw_course_id)
);

-- 3. Tanúsítványok
CREATE TABLE IF NOT EXISTS lw_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  lw_course_id TEXT,
  certificate_id TEXT,
  issued_at TIMESTAMPTZ,
  certificate_url TEXT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, certificate_id)
);

-- Indexek a gyakori lekérdezésekhez
CREATE INDEX IF NOT EXISTS idx_lw_enrollments_user ON lw_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_lw_enrollments_course ON lw_enrollments(lw_course_id);
CREATE INDEX IF NOT EXISTS idx_lw_certificates_user ON lw_certificates(user_id);

-- RLS (Row Level Security) - admin olvasás
ALTER TABLE lw_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lw_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lw_certificates ENABLE ROW LEVEL SECURITY;

-- Policy: bárki olvashat (a frontenden úgyis admin check van)
CREATE POLICY "Allow read access to lw_courses" ON lw_courses FOR SELECT USING (true);
CREATE POLICY "Allow read access to lw_enrollments" ON lw_enrollments FOR SELECT USING (true);
CREATE POLICY "Allow read access to lw_certificates" ON lw_certificates FOR SELECT USING (true);

-- Policy: service role (Edge Functions) írhat
CREATE POLICY "Allow service role insert on lw_courses" ON lw_courses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update on lw_courses" ON lw_courses FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert on lw_enrollments" ON lw_enrollments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update on lw_enrollments" ON lw_enrollments FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert on lw_certificates" ON lw_certificates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update on lw_certificates" ON lw_certificates FOR UPDATE USING (true);
