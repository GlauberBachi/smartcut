/*
  # Melhorar tratamento de subscriptions

  1. Melhorias na tabela stripe_subscriptions
    - Adicionar índices para melhor performance
    - Melhorar constraints e validações
    
  2. Função para verificar integridade das subscriptions
    - Verificar se subscriptions estão sincronizadas
    - Limpar registros órfãos
    
  3. Melhorar logging de subscriptions
*/

-- Adicionar índices para melhor performance na tabela stripe_subscriptions
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_subscription_id 
ON stripe_subscriptions(subscription_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_price_id_status 
ON stripe_subscriptions(price_id, status) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_updated_at 
ON stripe_subscriptions(updated_at DESC) 
WHERE deleted_at IS NULL;

-- Função para verificar e corrigir subscriptions órfãs
CREATE OR REPLACE FUNCTION check_subscription_integrity()
RETURNS TABLE(
  customer_id text,
  user_id uuid,
  subscription_id text,
  status text,
  issue text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.customer_id,
    sc.user_id,
    ss.subscription_id,
    ss.status::text,
    CASE 
      WHEN sc.user_id IS NULL THEN 'orphaned_subscription'
      WHEN ss.subscription_id IS NULL THEN 'missing_subscription_id'
      WHEN ss.price_id IS NULL THEN 'missing_price_id'
      WHEN ss.status IS NULL THEN 'missing_status'
      ELSE 'ok'
    END as issue
  FROM stripe_subscriptions ss
  LEFT JOIN stripe_customers sc ON ss.customer_id = sc.customer_id AND sc.deleted_at IS NULL
  WHERE ss.deleted_at IS NULL
  AND (
    sc.user_id IS NULL OR 
    ss.subscription_id IS NULL OR 
    ss.price_id IS NULL OR 
    ss.status IS NULL
  );
END;
$$;

-- Função para limpar subscriptions órfãs
CREATE OR REPLACE FUNCTION cleanup_orphaned_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleaned_count INTEGER := 0;
BEGIN
  -- Soft delete subscriptions sem customer válido
  UPDATE stripe_subscriptions 
  SET deleted_at = now()
  WHERE deleted_at IS NULL
  AND customer_id NOT IN (
    SELECT customer_id 
    FROM stripe_customers 
    WHERE deleted_at IS NULL
  );
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  
  RETURN cleaned_count;
END;
$$;

-- Melhorar logging para subscriptions
INSERT INTO stripe_integration_logs (event_type, request_payload, created_at)
SELECT 
  'subscription_integrity_check',
  json_build_object(
    'total_subscriptions', COUNT(*),
    'active_subscriptions', COUNT(*) FILTER (WHERE status = 'active'),
    'trialing_subscriptions', COUNT(*) FILTER (WHERE status = 'trialing'),
    'canceled_subscriptions', COUNT(*) FILTER (WHERE status = 'canceled'),
    'check_timestamp', now()
  ),
  now()
FROM stripe_subscriptions 
WHERE deleted_at IS NULL;

-- Comentário sobre a estrutura
COMMENT ON FUNCTION check_subscription_integrity() IS 'Verifica integridade das subscriptions e identifica problemas';
COMMENT ON FUNCTION cleanup_orphaned_subscriptions() IS 'Remove subscriptions órfãs (soft delete)';