/*
  # Add storage policies for avatars bucket

  1. Storage Policies
    - Create avatars bucket if it doesn't exist
    - Add policies for authenticated users to:
      - Upload their own avatars
      - Read their own avatars
      - Update their own avatars
      - Delete their own avatars
    
  2. Security
    - Policies ensure users can only manage their own avatars
    - File names must start with the user's ID
*/

-- Create the avatars bucket if it doesn't exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Policy to allow authenticated users to upload their own avatars
CREATE POLICY "Allow authenticated users to upload their own avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (auth.uid())::text = SUBSTRING(name, 1, 36)
);

-- Policy to allow authenticated users to read their own avatars
CREATE POLICY "Allow authenticated users to read their own avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars' AND
  (auth.uid())::text = SUBSTRING(name, 1, 36)
);

-- Policy to allow authenticated users to update their own avatars
CREATE POLICY "Allow authenticated users to update their own avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars' AND
  (auth.uid())::text = SUBSTRING(name, 1, 36)
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (auth.uid())::text = SUBSTRING(name, 1, 36)
);

-- Policy to allow authenticated users to delete their own avatars
CREATE POLICY "Allow authenticated users to delete their own avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars' AND
  (auth.uid())::text = SUBSTRING(name, 1, 36)
);