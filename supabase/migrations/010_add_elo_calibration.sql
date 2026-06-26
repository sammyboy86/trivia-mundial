-- MERS: Add ELO calibration columns to questions table
-- Run this in the Supabase Dashboard > SQL Editor

-- Add dedicated ELO calibration columns
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS elo_beta DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS elo_calibrated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS elo_response_count INTEGER DEFAULT 0;

-- Create calibration runs log table
CREATE TABLE IF NOT EXISTS public.elo_calibration_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  num_agents INTEGER NOT NULL,
  theta_mean DOUBLE PRECISION NOT NULL DEFAULT 0,
  theta_std DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  k_initial DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  k_decay DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  total_questions INTEGER NOT NULL DEFAULT 0,
  beta_mean DOUBLE PRECISION,
  beta_std DOUBLE PRECISION,
  beta_min DOUBLE PRECISION,
  beta_max DOUBLE PRECISION,
  log_summary JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.elo_calibration_runs ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "Allow service_role full access to elo_calibration_runs"
  ON public.elo_calibration_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_questions_elo_beta ON public.questions (elo_beta);
