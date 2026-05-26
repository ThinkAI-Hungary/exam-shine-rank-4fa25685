-- ============================================================
-- OPTEN Company Monitoring - Schema Extensions
-- ============================================================

-- 1. Additional OPTEN data fields on master table
ALTER TABLE company_monitoring
  ADD COLUMN IF NOT EXISTS company_status TEXT,          -- cég státusz (aktív, felszámolás alatt, stb.)
  ADD COLUMN IF NOT EXISTS foundation_date TEXT,         -- alapítás dátuma
  ADD COLUMN IF NOT EXISTS main_activity TEXT,           -- fő tevékenység (TEÁOR)
  ADD COLUMN IF NOT EXISTS registered_capital TEXT,      -- jegyzett tőke
  ADD COLUMN IF NOT EXISTS company_form TEXT,            -- cégforma (Kft., Zrt., stb.)
  ADD COLUMN IF NOT EXISTS lw_group_id TEXT;             -- összekapcsolt LearnWorlds csoport

-- 2. Index for LW group linkage
CREATE INDEX IF NOT EXISTS idx_cm_lw_group ON company_monitoring(lw_group_id) WHERE lw_group_id IS NOT NULL;
