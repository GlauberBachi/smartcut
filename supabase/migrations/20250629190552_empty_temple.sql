-- Verificar se os usuários estão sendo criados corretamente
SELECT 
  au.id,
  au.email,
  au.created_at as auth_created_at,
  u.id as user_id,
  u.email as user_email,
  u.created_at as user_created_at,
  p.id as profile_id,
  s.user_id as subscription_user_id,
  sc.user_id as stripe_customer_user_id,
  ucl.step,
  ucl.error,
  ucl.created_at as log_created_at
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
LEFT JOIN public.profiles p ON au.id = p.id
LEFT JOIN public.subscriptions s ON au.id = s.user_id
LEFT JOIN stripe_customers sc ON au.id = sc.user_id
LEFT JOIN user_creation_logs ucl ON au.id = ucl.user_id
WHERE au.created_at > NOW() - INTERVAL '1 hour'
ORDER BY au.created_at DESC, ucl.created_at DESC;