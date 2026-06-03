-- ============================================================
-- Update badge_definitions to use custom SVG icons
-- Maps the icon_name field to /badges/*.svg paths
-- ============================================================

-- Category badges: Bronz, Ezüst, Arany
UPDATE badge_definitions
SET icon_name = '/badges/!jovo_bronzja2_jelveny.svg'
WHERE badge_type = 'category' AND badge_level = 'bronze';

UPDATE badge_definitions
SET icon_name = '/badges/!jovo_ezustje_svg.svg'
WHERE badge_type = 'category' AND badge_level = 'silver';

UPDATE badge_definitions
SET icon_name = '/badges/!jovo_aranya_jelveny.svg'
WHERE badge_type = 'category' AND badge_level = 'gold';

-- Aspirant badges: Jövő Bronzja, Jövő Ezüstje, Jövő Aranya
UPDATE badge_definitions
SET icon_name = '/badges/!jovo_bronzja2_jelveny.svg',
    badge_name = 'Jövő Bronzja',
    description = 'Teljesíti a Bronz kategória teljesítménybeli elvárásait (80% vizsga, 70% képzési aktivitás), de a munkaviszony hossza még nem elegendő.'
WHERE badge_type = 'aspirant' AND badge_level = 'bronze';

UPDATE badge_definitions
SET icon_name = '/badges/!jovo_ezustje_svg.svg',
    badge_name = 'Jövő Ezüstje',
    description = 'Teljesíti az Ezüst kategória teljesítménybeli elvárásait (85% vizsga, 80% képzési aktivitás), de a munkaviszony hossza még nem elegendő.'
WHERE badge_type = 'aspirant' AND badge_level = 'silver';

UPDATE badge_definitions
SET icon_name = '/badges/!jovo_aranya_jelveny.svg',
    badge_name = 'Jövő Aranya',
    description = 'Teljesíti az Arany kategória teljesítménybeli elvárásait (90% vizsga, 90% képzési aktivitás), de a munkaviszony hossza még nem elegendő.'
WHERE badge_type = 'aspirant' AND badge_level = 'gold';

-- Monthly star: Hónap Vizsga Mestere
UPDATE badge_definitions
SET icon_name = '/badges/!honap_vizsga_mester_final.svg',
    badge_name = 'Hónap Vizsga Mestere',
    description = 'A hónap legmagasabb vizsga átlagát elérő kolléga.'
WHERE badge_type = 'monthly_star' AND badge_name ILIKE '%exam%master%' OR (badge_type = 'monthly_star' AND badge_name ILIKE '%vizsga%mester%');

-- Monthly star: Képzési Bajnok
UPDATE badge_definitions
SET icon_name = '/badges/!kepzesi_bajnok.svg',
    badge_name = 'Képzési Bajnok',
    description = '100%-os képzési részvétel az adott hónapban.'
WHERE badge_type = 'monthly_star' AND badge_name ILIKE '%training%champion%' OR (badge_type = 'monthly_star' AND badge_name ILIKE '%képzési%bajnok%');

-- Monthly star: Kezdő Siker
UPDATE badge_definitions
SET icon_name = '/badges/!kezdo_siker.svg',
    badge_name = 'Kezdő Siker',
    description = 'Új kolléga, aki az első 3 hónapban 80% feletti vizsga átlagot ért el.'
WHERE badge_type = 'monthly_star' AND badge_name ILIKE '%starter%success%' OR (badge_type = 'monthly_star' AND badge_name ILIKE '%kezdő%siker%');
