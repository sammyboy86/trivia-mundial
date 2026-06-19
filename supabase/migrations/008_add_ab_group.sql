-- Add test_group column to quiz_sessions for A/B testing
ALTER TABLE public.quiz_sessions 
ADD COLUMN test_group VARCHAR(20) DEFAULT 'control';
