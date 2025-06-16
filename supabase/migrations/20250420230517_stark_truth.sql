/*
  # Add storage policies for avatars

  1. Storage Policies
    - Create avatars bucket if it doesn't exist
    - Enable RLS on avatars bucket
    - Add policies for authenticated users to:
      - Read their own avatars
      - Upload and update their own avatars
      - Delete their own avatars
*/

-- Create avatars bucket if it doesn't exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
END $$;

-- Policy to allow authenticated users to read any avatar (since they're public)
CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Policy to allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy to allow authenticated users to update their own avatar
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy to allow authenticated users to delete their own avatar
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );