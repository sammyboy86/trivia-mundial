-- Trivia Mundial: Create session tracking tables
-- Run this in the Supabase Dashboard > SQL Editor or apply via Supabase CLI

-- Create the quiz_sessions table
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  completed BOOLEAN DEFAULT false,
  score INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0
);

-- Enable RLS for quiz_sessions
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public (anon) users to insert and update their own sessions
CREATE POLICY "Allow public insert sessions" ON public.quiz_sessions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public update sessions" ON public.quiz_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Allow service_role full access (for the admin dashboard)
CREATE POLICY "Allow service_role full access to sessions" ON public.quiz_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- Create the quiz_answers table
CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_type TEXT,
  user_answer TEXT,
  is_correct BOOLEAN,
  used_hint BOOLEAN DEFAULT false,
  time_taken_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for quiz_answers
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

-- Allow public (anon) users to insert their answers
CREATE POLICY "Allow public insert answers" ON public.quiz_answers
  FOR INSERT TO anon WITH CHECK (true);

-- Allow service_role full access (for the admin dashboard)
CREATE POLICY "Allow service_role full access to answers" ON public.quiz_answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
