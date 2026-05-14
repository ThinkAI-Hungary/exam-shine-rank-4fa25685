-- Groups tables for LearnWorlds group/multi-seat management

-- Store groups synced from LearnWorlds
CREATE TABLE IF NOT EXISTS public.lw_groups (
  lw_group_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  product_ids TEXT[],        -- linked course/product IDs
  manager_ids TEXT[],        -- group manager user IDs
  tags TEXT[],
  max_members INTEGER,       -- seat limit (null = unlimited)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Store group memberships (user <-> group)
CREATE TABLE IF NOT EXISTS public.lw_group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lw_group_id TEXT NOT NULL REFERENCES public.lw_groups(lw_group_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',  -- 'member' or 'manager'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(lw_group_id, user_id)
);

-- Enable RLS
ALTER TABLE public.lw_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lw_group_members ENABLE ROW LEVEL SECURITY;

-- Make groups publicly readable
CREATE POLICY "Groups are publicly readable"
ON public.lw_groups FOR SELECT USING (true);

CREATE POLICY "Group members are publicly readable"
ON public.lw_group_members FOR SELECT USING (true);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.lw_group_members (lw_group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.lw_group_members (user_id);
