
-- View 1: report_user_exams (Dolgozók szint) - each user with their exam details
CREATE OR REPLACE VIEW public.report_user_exams AS
SELECT
  u.username AS "Kolléga neve",
  u.email,
  COALESCE(u.aruhaz[1], '') AS "Áruház",
  COALESCE(u.beosztas[1], '') AS "Pozíció",
  e.course_title AS "Kurzus",
  e.exam_title AS "Vizsga neve",
  e.score AS "Eredmény %",
  CASE WHEN e.score >= 80 THEN 'Igen' ELSE 'Nem' END AS "Megfelelt",
  e.completed_at AS "Dátum"
FROM public.exam_results e
JOIN public.users u ON u.user_id = e.user_id
WHERE u.username NOT IN ('LW DEV', 'LWSupport Test')
ORDER BY u.username, e.completed_at DESC;

-- View 2: report_course_exams (Vizsgák szerint) - grouped by course with user details
CREATE OR REPLACE VIEW public.report_course_exams AS
SELECT
  e.course_title AS "Kurzus",
  u.username AS "Kolléga neve",
  u.email,
  COALESCE(u.aruhaz[1], '') AS "Áruház",
  e.exam_title AS "Vizsga neve",
  e.score AS "Eredmény %",
  CASE WHEN e.score >= 80 THEN 'Igen' ELSE 'Nem' END AS "Megfelelt",
  e.completed_at AS "Dátum"
FROM public.exam_results e
JOIN public.users u ON u.user_id = e.user_id
WHERE u.username NOT IN ('LW DEV', 'LWSupport Test')
ORDER BY e.course_title, u.username, e.completed_at DESC;
