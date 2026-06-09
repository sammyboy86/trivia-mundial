-- Add hint and associated_kc_id to questions table
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS associated_kc_id TEXT,
ADD COLUMN IF NOT EXISTS hint TEXT;
