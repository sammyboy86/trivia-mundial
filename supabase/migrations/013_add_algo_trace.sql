-- Trivia Mundial: Add algo_trace column to quiz_answers
-- Run this in the Supabase Dashboard > SQL Editor or apply via Supabase CLI

ALTER TABLE public.quiz_answers 
ADD COLUMN IF NOT EXISTS algo_trace JSONB DEFAULT '{}'::jsonb;
