/*
  # Create notifications system

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `title` (text, required)
      - `message` (text, required)
      - `type` (text, default 'info')
      - `created_at` (timestamp)
      - `expires_at` (timestamp, optional)
      - `created_by` (uuid, references admin user)
    
    - `user_notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user)
      - `notification_id` (uuid, references notification)
      - `read` (boolean, default false)
      - `created_at` (timestamp)
      - `read_at` (timestamp, optional)

  2. Security
    - Enable RLS on both tables
    - Add policies for admin and user access
*/

-- Create notifications table
CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL DEFAULT 'info',
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz,
    created_by uuid REFERENCES auth.users(id),
    CONSTRAINT valid_type CHECK (type IN ('info', 'warning', 'error', 'success'))
);

-- Create user_notifications table for tracking read status
CREATE TABLE public.user_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    notification_id uuid REFERENCES public.notifications(id) NOT NULL,
    read boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    read_at timestamptz,
    UNIQUE(user_id, notification_id)
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Policies for notifications
CREATE POLICY "Admins can manage notifications"
    ON public.notifications
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.role = 'admin'
        )
    );

CREATE POLICY "Users can view active notifications"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (
        (expires_at IS NULL OR expires_at > now())
    );

-- Policies for user_notifications
CREATE POLICY "Users can manage their own notification status"
    ON public.user_notifications
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Function to create user_notifications for all users when a new notification is created
CREATE OR REPLACE FUNCTION public.handle_new_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_notifications (user_id, notification_id)
    SELECT id, NEW.id
    FROM auth.users
    WHERE auth.users.role != 'admin';
    
    RETURN NEW;
END;
$$;

-- Create trigger for new notifications
CREATE TRIGGER on_notification_created
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_notification();