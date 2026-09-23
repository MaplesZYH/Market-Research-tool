CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  input_mode TEXT NOT NULL DEFAULT 'keyword' CHECK (input_mode IN ('keyword', 'natural_language')),
  request_text TEXT,
  research_spec JSONB,
  search_plan JSONB,
  status TEXT NOT NULL CHECK (status IN ('created', 'discovering', 'classifying', 'analyzing', 'reporting', 'completed', 'partial', 'failed')),
  max_results INTEGER NOT NULL DEFAULT 100,
  total_hits INTEGER NOT NULL DEFAULT 0,
  valid_projects INTEGER NOT NULL DEFAULT 0,
  excluded_projects INTEGER NOT NULL DEFAULT 0,
  market_analysis JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE scans ADD COLUMN IF NOT EXISTS input_mode TEXT NOT NULL DEFAULT 'keyword';
ALTER TABLE scans ADD COLUMN IF NOT EXISTS request_text TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS research_spec JSONB;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS search_plan JSONB;

CREATE TABLE IF NOT EXISTS repositories (
  id BIGSERIAL PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  html_url TEXT NOT NULL,
  description TEXT,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  license_spdx TEXT,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_fork BOOLEAN NOT NULL DEFAULT FALSE,
  pushed_at TIMESTAMPTZ,
  matched_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  relevance TEXT,
  main_category TEXT,
  secondary_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  activity_level TEXT,
  project_summary TEXT,
  project_analysis JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_id, full_name)
);

CREATE INDEX IF NOT EXISTS repositories_scan_id_idx ON repositories(scan_id);
CREATE INDEX IF NOT EXISTS repositories_category_idx ON repositories(scan_id, main_category);
