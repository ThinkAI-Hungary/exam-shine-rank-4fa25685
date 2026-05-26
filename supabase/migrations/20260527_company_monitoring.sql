-- ============================================================
-- OPTEN Company Monitoring Tables
-- ============================================================

-- Master table: monitored companies
CREATE TABLE IF NOT EXISTS company_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  tax_number TEXT NOT NULL,
  current_employee_count INTEGER,
  previous_employee_count INTEGER,
  last_checked_at TIMESTAMPTZ,
  last_change_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tax_number)
);

-- Historical log: every check result
CREATE TABLE IF NOT EXISTS company_monitoring_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES company_monitoring(id) ON DELETE CASCADE,
  employee_count INTEGER NOT NULL,
  previous_count INTEGER,
  changed BOOLEAN DEFAULT false,
  checked_at TIMESTAMPTZ DEFAULT now(),
  raw_response JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cm_tax ON company_monitoring(tax_number);
CREATE INDEX IF NOT EXISTS idx_cm_active ON company_monitoring(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cml_company ON company_monitoring_log(company_id);
CREATE INDEX IF NOT EXISTS idx_cml_checked ON company_monitoring_log(checked_at DESC);

-- RLS
ALTER TABLE company_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_monitoring_log ENABLE ROW LEVEL SECURITY;

-- Read: authenticated users
CREATE POLICY "Allow read access to company_monitoring"
  ON company_monitoring FOR SELECT USING (true);

CREATE POLICY "Allow read access to company_monitoring_log"
  ON company_monitoring_log FOR SELECT USING (true);

-- Write: service role only (edge functions)
CREATE POLICY "Allow service role insert on company_monitoring"
  ON company_monitoring FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update on company_monitoring"
  ON company_monitoring FOR UPDATE USING (true);

CREATE POLICY "Allow service role delete on company_monitoring"
  ON company_monitoring FOR DELETE USING (true);

CREATE POLICY "Allow service role insert on company_monitoring_log"
  ON company_monitoring_log FOR INSERT WITH CHECK (true);
