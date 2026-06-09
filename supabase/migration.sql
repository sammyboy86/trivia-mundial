-- Trivia Mundial Database Migration
-- Run this in your Supabase SQL Editor

-- Create questions table
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'open_ended')),
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_option TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous users to read questions
CREATE POLICY "Allow public read access"
  ON questions
  FOR SELECT
  TO anon
  USING (true);

-- Policy: Allow service role full access (used by admin API)
CREATE POLICY "Allow service role full access"
  ON questions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create an index for faster random fetching
CREATE INDEX idx_questions_created_at ON questions (created_at DESC);
