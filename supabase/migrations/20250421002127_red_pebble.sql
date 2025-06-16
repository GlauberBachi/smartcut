/*
  # Update admin user password

  Updates the password for the admin@example.com user to a new value.

  1. Changes
    - Updates the encrypted password for the admin user
*/

UPDATE auth.users
SET 
  encrypted_password = crypt('admin2330', gen_salt('bf')),
  updated_at = now()
WHERE 
  email = 'admin@example.com';