
-- Fix security definer views by recreating with security_invoker
CREATE OR REPLACE VIEW public.report_monthly_stats WITH (security_invoker = true) AS
WITH cleaned_data AS (
  SELECT
    split_part(regexp_replace(u.aruhaz::text, '[{}"]', '', 'g'), '_', 3) AS aruhaz_tiszta,
    er.course_title,
    er.score,
    er.completed_at
  FROM users u
  JOIN exam_results er ON u.user_id = er.user_id
)
SELECT
  aruhaz_tiszta AS "Áruház",
  course_title AS "Vizsga témakör",
  to_char(completed_at, 'YYYY-MM') AS "Hónap",
  count(*) AS "Összes vizsga száma",
  round(avg(score), 2) AS "Átlagos eredmény %",
  count(*) FILTER (WHERE score >= 80) AS "Sikeres vizsgák",
  count(*) FILTER (WHERE score < 80) AS "Sikertelen vizsgák",
  round((count(*) FILTER (WHERE score >= 80)::numeric / NULLIF(count(*), 0)::numeric) * 100, 2) AS "Sikerességi ráta %"
FROM cleaned_data
GROUP BY aruhaz_tiszta, course_title, to_char(completed_at, 'YYYY-MM');

CREATE OR REPLACE VIEW public.report_quarterly_totals WITH (security_invoker = true) AS
WITH cleaned_base AS (
  SELECT
    u.user_id,
    split_part(regexp_replace(u.aruhaz::text, '[{}"]', '', 'g'), '_', 3) AS aruhaz_tiszta,
    er.course_title,
    er.score,
    er.completed_at
  FROM users u
  JOIN exam_results er ON u.user_id = er.user_id
),
user_course_averages AS (
  SELECT
    user_id,
    aruhaz_tiszta,
    course_title,
    date_trunc('quarter', completed_at) AS negyedev_date,
    avg(score) AS egyeni_atlag
  FROM cleaned_base
  GROUP BY user_id, aruhaz_tiszta, course_title, date_trunc('quarter', completed_at)
),
aggregated_data AS (
  SELECT
    aruhaz_tiszta,
    course_title,
    to_char(negyedev_date, 'YYYY / "Q"Q') AS negyedev_text,
    negyedev_date,
    count(user_id) AS "Vizsgázott fő",
    sum(CASE WHEN egyeni_atlag >= 80 THEN 1 ELSE 0 END) AS "Sikeres fő",
    sum(CASE WHEN egyeni_atlag < 80 THEN 1 ELSE 0 END) AS "Sikertelen fő",
    round(avg(egyeni_atlag), 2) AS "Átlagos eredmény %"
  FROM user_course_averages
  GROUP BY aruhaz_tiszta, course_title, to_char(negyedev_date, 'YYYY / "Q"Q'), negyedev_date
)
SELECT
  aruhaz_tiszta AS "Áruház",
  course_title AS "Vizsga témakör",
  negyedev_text AS "Negyedév",
  "Vizsgázott fő",
  "Sikeres fő",
  "Sikertelen fő",
  "Átlagos eredmény %",
  dense_rank() OVER (PARTITION BY course_title, negyedev_text ORDER BY "Átlagos eredmény %" DESC) AS "Áruházi rangsor helyezés"
FROM aggregated_data;
