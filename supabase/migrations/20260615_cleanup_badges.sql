-- ============================================================
-- Remove progress badges (not in documentation) and
-- rename category badges to Hungarian
-- ============================================================

-- 1. Remove awarded progress badges first (FK constraint)
DELETE FROM public.user_badges
WHERE badge_id IN (
  SELECT id FROM public.badge_definitions WHERE badge_type = 'progress'
);

-- 2. Remove progress badge definitions
DELETE FROM public.badge_definitions
WHERE badge_type = 'progress';

-- 3. Rename category badges to Hungarian
UPDATE public.badge_definitions
SET badge_name = 'Bronz',
    description = '3+ év munkaviszony, 80% vizsga teljesítmény, 70% képzési aktivitás'
WHERE badge_type = 'category' AND badge_level = 'bronze';

UPDATE public.badge_definitions
SET badge_name = 'Ezüst',
    description = '5+ év munkaviszony, 85% vizsga teljesítmény, 80% képzési aktivitás'
WHERE badge_type = 'category' AND badge_level = 'silver';

UPDATE public.badge_definitions
SET badge_name = 'Arany',
    description = '10+ év munkaviszony, 90% vizsga teljesítmény, 90% képzési aktivitás'
WHERE badge_type = 'category' AND badge_level = 'gold';
