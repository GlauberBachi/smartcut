/*
  # Add stored procedure for safe notification deletion

  1. New Functions
    - `delete_notification`: Safely deletes a notification and its associated user_notifications
      - Parameters:
        - `p_notification_id`: UUID of the notification to delete
      - Returns: boolean indicating success

  2. Changes
    - Adds a new stored procedure that handles deletion of notifications and their associated records
    - Ensures proper transaction handling and foreign key constraint compliance
    - Returns success status for error handling
*/

create or replace function delete_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  -- Delete associated user_notifications first
  delete from user_notifications
  where notification_id = p_notification_id;
  
  -- Then delete the notification
  delete from notifications
  where id = p_notification_id;
  
  return true;
exception
  when others then
    return false;
end;
$$;