/*
  # Limpeza de sessões duplicadas e otimização

  1. Limpeza
    - Remove sessões duplicadas mantendo apenas a mais recente por usuário
    - Finaliza sessões órfãs (sem logout_at mas is_active = false)
  
  2. Índices
    - Adiciona índices para melhorar performance
    - Índice único para garantir apenas uma sessão ativa por usuário
  
  3. Constraint
    - Adiciona constraint para prevenir múltiplas sessões ativas
*/

-- Primeiro, finalizar todas as sessões ativas antigas (manter apenas a mais recente por usuário)
WITH latest_sessions AS (
  SELECT DISTINCT ON (user_id) 
    id, 
    user_id,
    login_at
  FROM user_sessions 
  WHERE is_active = true
  ORDER BY user_id, login_at DESC
),
sessions_to_close AS (
  SELECT us.id
  FROM user_sessions us
  LEFT JOIN latest_sessions ls ON us.id = ls.id
  WHERE us.is_active = true 
    AND ls.id IS NULL
)
UPDATE user_sessions 
SET 
  is_active = false,
  logout_at = COALESCE(logout_at, now()),
  updated_at = now()
WHERE id IN (SELECT id FROM sessions_to_close);

-- Finalizar sessões que não têm logout_at mas estão marcadas como inativas
UPDATE user_sessions 
SET 
  logout_at = COALESCE(logout_at, updated_at, created_at),
  updated_at = now()
WHERE is_active = false AND logout_at IS NULL;

-- Criar índice para prevenir múltiplas sessões ativas por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_unique_active 
ON user_sessions (user_id) 
WHERE is_active = true;

-- Adicionar comentário explicativo
COMMENT ON INDEX idx_user_sessions_unique_active IS 
'Garante que cada usuário tenha apenas uma sessão ativa por vez';