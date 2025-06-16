/*
  # Remove old admin user
  
  1. Changes
    - Delete admin@example.com user and all related data
    
  2. Security
    - Cascading delete ensures all related records are removed
*/

-- Remove old admin user and related data
DELETE FROM auth.users WHERE email = 'admin@example.com';