/*
  # Update test user password
  
  Updates the password for the test user account.
*/

UPDATE auth.users
SET 
  encrypted_password = crypt('N#tinapuf18', gen_salt('bf')),
  updated_at = now()
WHERE 
  email = 'teste@teste.com';