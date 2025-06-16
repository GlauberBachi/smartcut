/*
  # Add delete_user function

  1. New Functions
    - `delete_user`: Safely deletes a user and their associated data
      - Parameters:
        - `user_id` (uuid): The ID of the user to delete
      - Returns: boolean indicating success

  2. Security
    - Function is only accessible to authenticated users
    - Users can only delete their own account
*/

-- Create the delete_user function
CREATE OR REPLACE FUNCTION public.delete_user(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requesting_user_id uuid;
BEGIN
  -- Get the ID of the requesting user
  requesting_user_id := auth.uid();
  
  -- Check if the requesting user is trying to delete their own account
  IF requesting_user_id IS NULL OR requesting_user_id != user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only delete your own account';
  END IF;

  -- Delete user data from public schema tables
  -- The ON DELETE CASCADE in foreign keys will handle related records
  DELETE FROM public.users WHERE id = user_id;

  -- Return success
  RETURN true;
END;
$$;