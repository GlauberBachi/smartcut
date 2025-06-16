/*
  # Delete all users and related data

  1. Changes
    - Temporarily disable RLS for all tables
    - Delete all data from user-related tables in the correct order
    - Re-enable RLS for all tables

  2. Security
    - Temporarily disables RLS to allow cleanup
    - Re-enables RLS after cleanup
*/

-- Temporarily disable RLS to allow cleanup
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications DISABLE ROW LEVEL SECURITY;

-- Delete all data in reverse order of dependencies
DELETE FROM user_notifications;
DELETE FROM notifications;
DELETE FROM subscriptions;
DELETE FROM profiles;
DELETE FROM users;
DELETE FROM auth.users;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;