-- Migration to add user_id to quiz_sessions and remove completed column
ALTER TABLE public.quiz_sessions
ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);

ALTER TABLE public.quiz_sessions
DROP COLUMN IF EXISTS completed;
