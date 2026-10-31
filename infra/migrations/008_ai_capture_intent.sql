ALTER TABLE ai_runs ADD COLUMN intent TEXT NOT NULL DEFAULT 'assist' CHECK(intent IN ('assist','capture'));
