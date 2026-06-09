-- Create a storage bucket for processing results (JSON output)
-- Run via `npx supabase db push`

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'processing-results',
  'processing-results',
  false,
  10485760,  -- 10MB limit
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Allow service_role full access to the bucket
CREATE POLICY "Service role full access to processing-results"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'processing-results')
  WITH CHECK (bucket_id = 'processing-results');
