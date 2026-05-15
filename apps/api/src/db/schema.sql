CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  pitch        TEXT NOT NULL,
  api_token    TEXT NOT NULL UNIQUE,
  plan         TEXT DEFAULT 'free',
  autonomy_level INT DEFAULT 1,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_updates (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id),
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL,
  changelog    JSONB DEFAULT '[]',
  proof_bundle JSONB,
  sprint       INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signals (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id),
  signal_type   TEXT NOT NULL,
  content       TEXT NOT NULL,
  source        TEXT DEFAULT 'community',
  votes         INT DEFAULT 0,
  pledge_eur    DECIMAL(10,2) DEFAULT 0,
  processed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pledges (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id),
  feature_id    TEXT,
  backer_email  TEXT NOT NULL,
  amount_eur    DECIMAL(10,2) NOT NULL,
  status        TEXT DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id),
  agent_type   TEXT NOT NULL,
  sprint       INT,
  status       TEXT DEFAULT 'running',
  input        JSONB,
  output       JSONB,
  tokens_in    INT DEFAULT 0,
  tokens_out   INT DEFAULT 0,
  cost_usd     FLOAT DEFAULT 0,
  duration_ms  INT,
  error        TEXT,
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_updates_project ON project_updates(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_project ON signals(project_id, processed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_project ON agent_runs(project_id, started_at DESC);
