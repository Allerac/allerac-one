-- Global system settings (admin-managed API keys)
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value_encrypted TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shared Instagram accounts (admin registers their connected account with a label)
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Maps a domain user to the Instagram account they use
CREATE TABLE IF NOT EXISTS user_instagram_account (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
