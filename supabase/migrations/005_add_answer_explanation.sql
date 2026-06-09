ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS answer_explanation TEXT;
