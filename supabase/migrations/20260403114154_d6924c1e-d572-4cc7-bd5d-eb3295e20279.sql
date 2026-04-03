
-- Update report_course_exams to show users who haven't taken a course exam
CREATE OR REPLACE VIEW public.report_course_exams WITH (security_invoker = true) AS
WITH all_courses AS (
  SELECT DISTINCT course_title, course_id FROM exam_results
),
user_course_cross AS (
  SELECT u.user_id, u.username, u.email, u.aruhaz, ac.course_title, ac.course_id
  FROM users u
  CROSS JOIN all_courses ac
  WHERE u.username <> ALL (ARRAY['LW DEV', 'LWSupport Test'])
)
SELECT
  ucc.course_title AS "Kurzus",
  ucc.username AS "Kolléga neve",
  ucc.email,
  COALESCE(ucc.aruhaz[1], '') AS "Áruház",
  COALESCE(e.exam_title, 'Nem kezdte el') AS "Vizsga neve",
  e.score AS "Eredmény %",
  CASE
    WHEN e.score IS NULL THEN 'Nem kezdte el'
    WHEN e.score >= 80 THEN 'Igen'
    ELSE 'Nem'
  END AS "Megfelelt",
  e.completed_at AS "Dátum"
FROM user_course_cross ucc
LEFT JOIN exam_results e ON e.user_id = ucc.user_id AND e.course_id = ucc.course_id
ORDER BY ucc.course_title, ucc.username, e.completed_at DESC;

-- Update report_user_exams to show users who haven't taken a course exam
CREATE OR REPLACE VIEW public.report_user_exams WITH (security_invoker = true) AS
WITH all_courses AS (
  SELECT DISTINCT course_title, course_id FROM exam_results
),
user_course_cross AS (
  SELECT u.user_id, u.username, u.email, u.aruhaz, u.beosztas, ac.course_title, ac.course_id
  FROM users u
  CROSS JOIN all_courses ac
  WHERE u.username <> ALL (ARRAY['LW DEV', 'LWSupport Test'])
)
SELECT
  ucc.username AS "Kolléga neve",
  ucc.email,
  COALESCE(ucc.aruhaz[1], '') AS "Áruház",
  COALESCE(ucc.beosztas[1], '') AS "Pozíció",
  ucc.course_title AS "Kurzus",
  COALESCE(e.exam_title, 'Nem kezdte el') AS "Vizsga neve",
  e.score AS "Eredmény %",
  CASE
    WHEN e.score IS NULL THEN 'Nem kezdte el'
    WHEN e.score >= 80 THEN 'Igen'
    ELSE 'Nem'
  END AS "Megfelelt",
  e.completed_at AS "Dátum"
FROM user_course_cross ucc
LEFT JOIN exam_results e ON e.user_id = ucc.user_id AND e.course_id = ucc.course_id
ORDER BY ucc.username, e.completed_at DESC;

-- Update report_monthly_detailed to show users who haven't taken exams
CREATE OR REPLACE VIEW public.report_monthly_detailed WITH (security_invoker = true) AS
WITH all_courses AS (
  SELECT DISTINCT course_title, course_id FROM exam_results
),
cleaned_cross AS (
  SELECT
    u.user_id,
    u.username,
    u.email,
    split_part(regexp_replace(u.aruhaz::text, '[{}"]', '', 'g'), '_', 3) AS aruhaz_tiszta,
    split_part(regexp_replace(u.beosztas::text, '[{}"]', '', 'g'), '_', 3) AS beosztas_tiszta,
    ac.course_title,
    ac.course_id
  FROM users u
  CROSS JOIN all_courses ac
  WHERE u.username <> ALL (ARRAY['LW DEV', 'LWSupport Test'])
),
with_exams AS (
  SELECT
    cc.user_id,
    cc.username,
    cc.email,
    cc.aruhaz_tiszta,
    cc.beosztas_tiszta,
    cc.course_title,
    er.score,
    er.completed_at,
    row_number() OVER (PARTITION BY cc.user_id, cc.course_title ORDER BY er.completed_at) AS exam_attempt_number
  FROM cleaned_cross cc
  LEFT JOIN exam_results er ON er.user_id = cc.user_id AND er.course_id = cc.course_id
)
SELECT
  username AS "Kolléga neve",
  email,
  aruhaz_tiszta AS "Áruház",
  beosztas_tiszta AS "Pozíció",
  course_title AS "Vizsga témakör",
  score AS "Eredmény %",
  completed_at AS "Dátum",
  CASE
    WHEN completed_at IS NULL THEN 'Nem kezdte el'
    WHEN exam_attempt_number = 1 THEN 'Rendes vizsga'
    ELSE 'Pótvizsga'
  END AS "Vizsga típusa",
  CASE
    WHEN score IS NULL THEN 'Nem kezdte el'
    WHEN score >= 80 THEN 'Igen'
    ELSE 'Nem'
  END AS "Megfelelt",
  CASE
    WHEN completed_at IS NULL THEN 'Nem kezdte el'
    ELSE 'Befejezte'
  END AS "Státusz"
FROM with_exams;
