# User Creation Flow Test Plan

## Test Scenarios

### 1. New User Registration
- Register a new user via the application
- Verify all tables are populated correctly
- Check error logs for any issues

### 2. Edge Function Integration
- Verify Stripe customer creation
- Check that temporary records are updated
- Validate subscription creation

### 3. Error Handling
- Test with invalid data
- Verify cleanup mechanisms work
- Check error logging functionality

## Expected Results

### Tables That Should Be Populated
1. **auth.users** ✓ (Managed by Supabase)
2. **public.users** ✓ (Via trigger)
3. **public.profiles** ✓ (Via trigger)
4. **public.subscriptions** ✓ (Via trigger)
5. **stripe_customers** ✓ (Via Edge Function)
6. **stripe_subscriptions** ✓ (Via Edge Function)

### Verification Queries
```sql
-- Check user creation logs
SELECT * FROM user_creation_logs 
WHERE user_id = 'USER_ID_HERE' 
ORDER BY created_at DESC;

-- Verify all user data
SELECT 
  u.id,
  u.email,
  u.role,
  p.full_name,
  s.plan,
  s.status,
  sc.customer_id,
  ss.subscription_id
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
LEFT JOIN public.profiles p ON au.id = p.id
LEFT JOIN public.subscriptions s ON au.id = s.user_id
LEFT JOIN stripe_customers sc ON au.id = sc.user_id
LEFT JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
WHERE au.email = 'test@example.com';
```