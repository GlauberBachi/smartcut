/*
  # Make user admin

  1. Changes
    - Updates the role of user with email 'glauberbachi@gmail.com' to 'admin'
    
  2. Security
    - No changes to RLS policies
    - Maintains existing security constraints
*/

-- Temporarily disable RLS to allow the update
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Update the user's role to admin
UPDATE users
SET 
  role = 'admin',
  updated_at = now()
WHERE 
  email = 'glauberbachi@gmail.com';

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;