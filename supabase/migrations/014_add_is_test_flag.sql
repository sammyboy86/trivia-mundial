-- Add is_test column to quiz_sessions
ALTER TABLE public.quiz_sessions 
ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
