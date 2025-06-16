/*
  # Storage policies for avatar management
  
  1. Changes
    - Creates avatars bucket if not exists
    - Adds policies for authenticated users to:
      - Upload avatars
      - Read avatars
      - Update avatars
      - Delete avatars
    
  2. Security
    - Enables public access to avatars bucket
    - Restricts user operations to their own files
    - Enforces filename pattern matching user ID
*/

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create storage schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS storage;

-- Create buckets table if it doesn't exist
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

-- Create objects table if it doesn't exist
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version text
);

-- Create the avatars bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy for uploading avatars
CREATE POLICY "Users can upload their own avatar" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (auth.uid() = owner)
  AND (SUBSTRING(name, 1, 36) = auth.uid()::text)
);

-- Policy for reading avatars
CREATE POLICY "Anyone can read avatars" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'avatars');

-- Policy for updating avatars
CREATE POLICY "Users can update their own avatar" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND owner = auth.uid()
  AND (SUBSTRING(name, 1, 36) = auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'avatars'
  AND owner = auth.uid()
  AND (SUBSTRING(name, 1, 36) = auth.uid()::text)
);

-- Policy for deleting avatars
CREATE POLICY "Users can delete their own avatar" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND owner = auth.uid()
  AND (SUBSTRING(name, 1, 36) = auth.uid()::text)
);