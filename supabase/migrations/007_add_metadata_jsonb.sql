-- Trivia Mundial: Add metadata column for JSON manipulation
-- Run this in the Supabase Dashboard > SQL Editor

ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
