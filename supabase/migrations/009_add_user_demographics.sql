-- Add user demographics to quiz_sessions
ALTER TABLE public.quiz_sessions 
ADD COLUMN user_age INTEGER,
ADD COLUMN football_interest INTEGER;
