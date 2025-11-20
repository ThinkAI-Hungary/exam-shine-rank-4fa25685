-- Update badge names to Hungarian
UPDATE badge_definitions
SET badge_name = CASE 
  WHEN badge_name = 'Starter Success' THEN 'Kezdő Siker'
  WHEN badge_name = 'Training Champion' THEN 'Képzési Bajnok'
  WHEN badge_name = 'Exam Master of the Month' THEN 'Hónap Vizsga Mestere'
  ELSE badge_name
END
WHERE badge_name IN ('Starter Success', 'Training Champion', 'Exam Master of the Month');

-- Update badge descriptions to Hungarian
UPDATE badge_definitions
SET description = CASE 
  WHEN badge_name = 'Kezdő Siker' THEN 'Sikeres kezdés a tanulási úton'
  WHEN badge_name = 'Képzési Bajnok' THEN 'Kiváló teljesítmény a képzési aktivitásban'
  WHEN badge_name = 'Hónap Vizsga Mestere' THEN 'A hónap legjobb vizsga teljesítménye'
  ELSE description
END
WHERE badge_name IN ('Kezdő Siker', 'Képzési Bajnok', 'Hónap Vizsga Mestere');