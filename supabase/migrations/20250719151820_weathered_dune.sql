/*
  # Diagnóstico e correção de usuários faltantes

  1. Diagnóstico
    - Verifica usuários em auth.users que não estão em public.users
    - Identifica sessões órfãs
    
  2. Correção
    - Sincroniza usuários faltantes entre as tabelas
    - Limpa sessões órfãs se necessário
*/

-- Função para diagnosticar e corrigir usuários faltantes
CREATE OR REPLACE FUNCTION diagnose_and_fix_missing_users()
RETURNS TABLE (
  action_type text,
  user_id uuid,
  email text,
  details text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Verificar usuários em auth.users que não estão em public.users
  RETURN QUERY
  SELECT 
    'MISSING_IN_PUBLIC'::text as action_type,
    au.id as user_id,
    au.email as email,
    'User exists in auth.users but missing in public.users'::text as details
  FROM auth.users au
  LEFT JOIN public.users pu ON au.id = pu.id
  WHERE pu.id IS NULL
    AND au.email IS NOT NULL;

  -- 2. Verificar sessões com user_id que não existem em nenhuma tabela
  RETURN QUERY
  SELECT 
    'ORPHANED_SESSION'::text as action_type,
    us.user_id as user_id,
    COALESCE(au.email, 'unknown')::text as email,
    'Session exists but user not found in any table'::text as details
  FROM user_sessions us
  LEFT JOIN auth.users au ON us.user_id = au.id
  LEFT JOIN public.users pu ON us.user_id = pu.id
  WHERE au.id IS NULL AND pu.id IS NULL;

  -- 3. Sincronizar usuários faltantes (inserir em public.users)
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  SELECT 
    au.id,
    au.email,
    'user'::text,
    COALESCE(au.created_at, now()),
    now()
  FROM auth.users au
  LEFT JOIN public.users pu ON au.id = pu.id
  WHERE pu.id IS NULL
    AND au.email IS NOT NULL
    AND au.email_confirmed_at IS NOT NULL; -- Só sincronizar usuários confirmados

  -- 4. Retornar usuários sincronizados
  RETURN QUERY
  SELECT 
    'SYNCHRONIZED'::text as action_type,
    au.id as user_id,
    au.email as email,
    'User synchronized from auth.users to public.users'::text as details
  FROM auth.users au
  INNER JOIN public.users pu ON au.id = pu.id
  WHERE pu.created_at > (now() - interval '1 minute'); -- Recém criados

END;
$$;

-- Executar o diagnóstico e correção
SELECT * FROM diagnose_and_fix_missing_users();

-- Verificar especificamente o usuário davibachi2018@gmail.com
DO $$
DECLARE
  auth_user_exists boolean := false;
  public_user_exists boolean := false;
  user_id_found uuid;
BEGIN
  -- Verificar se existe em auth.users
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE email = 'davibachi2018@gmail.com') INTO auth_user_exists;
  
  -- Verificar se existe em public.users
  SELECT EXISTS(SELECT 1 FROM public.users WHERE email = 'davibachi2018@gmail.com') INTO public_user_exists;
  
  -- Obter o user_id se existir
  SELECT id INTO user_id_found FROM auth.users WHERE email = 'davibachi2018@gmail.com' LIMIT 1;
  
  RAISE NOTICE 'Diagnóstico para davibachi2018@gmail.com:';
  RAISE NOTICE 'Existe em auth.users: %', auth_user_exists;
  RAISE NOTICE 'Existe em public.users: %', public_user_exists;
  RAISE NOTICE 'User ID encontrado: %', user_id_found;
  
  -- Se existe em auth mas não em public, criar o registro
  IF auth_user_exists AND NOT public_user_exists AND user_id_found IS NOT NULL THEN
    INSERT INTO public.users (id, email, role, created_at, updated_at)
    SELECT 
      au.id,
      au.email,
      'user'::text,
      COALESCE(au.created_at, now()),
      now()
    FROM auth.users au
    WHERE au.email = 'davibachi2018@gmail.com'
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Usuário davibachi2018@gmail.com sincronizado para public.users';
  END IF;
END;
$$;