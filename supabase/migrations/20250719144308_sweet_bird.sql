/*
  # Add foreign key constraint to user_sessions table

  1. Changes
    - Add foreign key constraint between user_sessions.user_id and users.id
    - This enables proper joins between the tables in Supabase queries

  2. Security
    - Maintains existing RLS policies
    - Ensures referential integrity
*/

-- Add foreign key constraint to link user_sessions to users table
ALTER TABLE user_sessions 
ADD CONSTRAINT user_sessions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;