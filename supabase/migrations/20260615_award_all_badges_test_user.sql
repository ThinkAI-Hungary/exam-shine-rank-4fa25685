-- ============================================================
-- Award ALL badges to test user aronberes9@gmail.com
-- ============================================================

-- Insert one user_badge row per badge_definition for this user.
-- Skips any badge the user already has (to avoid duplicates).
INSERT INTO public.user_badges (user_id, badge_id, awarded_at)
SELECT
  u.user_id,
  bd.id,
  now()
FROM public.users u
CROSS JOIN public.badge_definitions bd
WHERE u.email = 'aronberes9@gmail.com'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_badges ub
    WHERE ub.user_id = u.user_id
      AND ub.badge_id = bd.id
      AND ub.revoked_at IS NULL
  );
