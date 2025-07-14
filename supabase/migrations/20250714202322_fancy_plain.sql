/*
  # Melhorias no sistema de criação de usuários

  1. Melhorias na tabela user_creation_state
    - Adicionar índices para melhor performance
    - Melhorar constraints
    
  2. Função para limpeza de locks expirados
    - Remove locks antigos automaticamente
    
  3. Melhorias na função create_user_complete
    - Melhor controle de concorrência
    - Prevenção de duplicatas
*/

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_user_creation_state_locked_at_state 
ON user_creation_state (locked_at, state) 
WHERE locked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_creation_state_updated_at 
ON user_creation_state (updated_at);

-- Função para limpeza de locks expirados (5 minutos)
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_creation_state 
  SET 
    state = 'failed',
    locked_at = NULL,
    error_message = 'Lock expired - cleaned up automatically',
    updated_at = now()
  WHERE 
    state = 'locked' 
    AND locked_at IS NOT NULL 
    AND locked_at < (now() - interval '5 minutes');
    
  -- Log cleanup
  INSERT INTO user_creation_logs (user_id, step, created_at)
  SELECT 
    user_id,
    'Lock cleanup - expired locks removed',
    now()
  FROM user_creation_state 
  WHERE state = 'failed' AND error_message = 'Lock expired - cleaned up automatically';
END;
$$;

-- Melhorar a função create_user_complete para melhor controle de concorrência
CREATE OR REPLACE FUNCTION create_user_complete(
  p_user_id uuid,
  p_email text,
  p_force_recreate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state text;
  v_locked_at timestamptz;
  v_completed_at timestamptz;
  v_result jsonb;
BEGIN
  -- Log da tentativa
  INSERT INTO user_creation_logs (user_id, step, created_at)
  VALUES (p_user_id, 'create_user_complete called', now());

  -- Limpeza de locks expirados primeiro
  PERFORM cleanup_expired_locks();

  -- Verificar estado atual
  SELECT state, locked_at, completed_at 
  INTO v_state, v_locked_at, v_completed_at
  FROM user_creation_state 
  WHERE user_id = p_user_id;

  -- Se já está completo e não é force_recreate, retornar sucesso
  IF v_state = 'completed' AND NOT p_force_recreate THEN
    INSERT INTO user_creation_logs (user_id, step, created_at)
    VALUES (p_user_id, 'User already completed', now());
    
    RETURN jsonb_build_object(
      'success', true,
      'state', 'completed',
      'message', 'User already completed'
    );
  END IF;

  -- Se está locked por outro processo (menos de 5 minutos), retornar conflito
  IF v_state = 'locked' AND v_locked_at IS NOT NULL AND v_locked_at > (now() - interval '5 minutes') THEN
    INSERT INTO user_creation_logs (user_id, step, created_at)
    VALUES (p_user_id, 'Lock conflict - another process active', now());
    
    RETURN jsonb_build_object(
      'success', false,
      'state', 'locked',
      'message', 'User creation in progress by another process'
    );
  END IF;

  -- Tentar adquirir o lock
  INSERT INTO user_creation_state (user_id, state, step, locked_at, updated_at)
  VALUES (p_user_id, 'locked', 'Acquired lock for user creation', now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    state = 'locked',
    step = 'Acquired lock for user creation',
    locked_at = now(),
    updated_at = now(),
    error_message = NULL;

  -- Verificar se conseguimos o lock (pode ter havido race condition)
  SELECT state, locked_at INTO v_state, v_locked_at
  FROM user_creation_state 
  WHERE user_id = p_user_id;

  IF v_state != 'locked' OR v_locked_at IS NULL OR v_locked_at < (now() - interval '1 minute') THEN
    INSERT INTO user_creation_logs (user_id, step, error, created_at)
    VALUES (p_user_id, 'Failed to acquire lock', 'Race condition detected', now());
    
    RETURN jsonb_build_object(
      'success', false,
      'state', 'failed',
      'error', 'Failed to acquire lock due to race condition'
    );
  END IF;

  -- Criar registros locais
  BEGIN
    -- Criar registro na tabela users
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (p_user_id, p_email, 'user', now(), now())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = now();

    -- Criar registro na tabela profiles
    INSERT INTO profiles (id, created_at, updated_at)
    VALUES (p_user_id, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Criar registro na tabela subscriptions
    INSERT INTO subscriptions (user_id, plan, status, current_period_end, created_at, updated_at)
    VALUES (p_user_id, 'free', 'active', now() + interval '100 years', now(), now())
    ON CONFLICT (user_id) DO NOTHING;

    -- Criar registro temporário na tabela stripe_customers
    INSERT INTO stripe_customers (user_id, customer_id, created_at, updated_at)
    VALUES (p_user_id, 'temp_' || p_user_id, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      updated_at = now()
    WHERE stripe_customers.customer_id LIKE 'temp_%';

    -- Criar registro temporário na tabela stripe_subscriptions
    INSERT INTO stripe_subscriptions (customer_id, status, created_at, updated_at)
    VALUES ('temp_' || p_user_id, 'not_started', now(), now())
    ON CONFLICT (customer_id) DO UPDATE SET
      updated_at = now()
    WHERE stripe_subscriptions.customer_id LIKE 'temp_%';

    INSERT INTO user_creation_logs (user_id, step, created_at)
    VALUES (p_user_id, 'Local records created successfully', now());

    RETURN jsonb_build_object(
      'success', true,
      'state', 'in_progress',
      'message', 'Local records created, ready for Stripe integration'
    );

  EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, liberar o lock
    UPDATE user_creation_state 
    SET 
      state = 'failed',
      locked_at = NULL,
      error_message = SQLERRM,
      updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO user_creation_logs (user_id, step, error, created_at)
    VALUES (p_user_id, 'Error creating local records', SQLERRM, now());

    RETURN jsonb_build_object(
      'success', false,
      'state', 'failed',
      'error', SQLERRM
    );
  END;
END;
$$;

-- Criar job para limpeza automática de locks expirados (executar a cada 5 minutos)
-- Nota: Isso requer a extensão pg_cron, que pode não estar disponível em todos os ambientes
-- Se não estiver disponível, a limpeza será feita na própria função create_user_complete

-- SELECT cron.schedule('cleanup-expired-locks', '*/5 * * * *', 'SELECT cleanup_expired_locks();');

-- Adicionar comentários nas tabelas para documentação
COMMENT ON TABLE user_creation_state IS 'Controla o estado da criação de usuários para evitar duplicatas';
COMMENT ON COLUMN user_creation_state.locked_at IS 'Timestamp do lock para controle de concorrência';
COMMENT ON COLUMN user_creation_state.state IS 'Estado atual: pending, in_progress, completed, failed, locked';

COMMENT ON FUNCTION create_user_complete IS 'Função principal para criação completa de usuários com controle de concorrência';
COMMENT ON FUNCTION cleanup_expired_locks IS 'Remove locks expirados automaticamente';