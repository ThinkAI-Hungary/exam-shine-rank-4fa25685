-- ============================================================
-- Add company_code column to company_monitoring
-- Stores franchise codes like H000, H002, etc.
-- ============================================================

ALTER TABLE company_monitoring
  ADD COLUMN IF NOT EXISTS company_code TEXT;

CREATE INDEX IF NOT EXISTS idx_cm_code ON company_monitoring(company_code)
  WHERE company_code IS NOT NULL;
