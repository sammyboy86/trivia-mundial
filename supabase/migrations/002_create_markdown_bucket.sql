-- Create a storage bucket for markdown files
-- Run this in the Supabase SQL Editor or via `npx supabase db push`

-- Create the markdown-uploads bucket via the storage API
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'markdown-uploads',
  'markdown-uploads',
  false,
  5242880,  -- 5MB limit
  ARRAY['text/markdown', 'text/plain', 'text/x-markdown', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Allow service_role full access to the bucket (admin API uses service_role)
CREATE POLICY "Service role full access to markdown-uploads"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'markdown-uploads')
  WITH CHECK (bucket_id = 'markdown-uploads');
