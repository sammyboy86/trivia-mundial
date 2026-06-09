-- Trivia Mundial: Create questions table
-- Run this in the Supabase Dashboard > SQL Editor

-- Create the questions table
CREATE TABLE IF NOT EXISTS public.questions (
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

-- Enable RLS (Row Level Security)
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Allow public (anon) users to SELECT only (for the quiz page)
CREATE POLICY "Allow public read access" ON public.questions
  FOR SELECT
  TO anon
  USING (true);

-- Allow service_role full access (for the admin dashboard)
CREATE POLICY "Allow service_role full access" ON public.questions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: Insert a sample question to verify setup
INSERT INTO public.questions (question_text, question_type, option_a, option_b, option_c, option_d, correct_option)
VALUES (
  'What is the capital of France?',
  'multiple_choice',
  'London',
  'Berlin',
  'Paris',
  'Madrid',
  'c'
);
