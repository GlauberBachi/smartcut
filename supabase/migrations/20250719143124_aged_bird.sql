/*
  # Sistema de Controle de Sessões de Usuário

  1. Nova Tabela
    - `user_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key para auth.users)
      - `login_at` (timestamp)
      - `logout_at` (timestamp, nullable)
      - `ip_address` (text, nullable)
      - `user_agent` (text, nullable)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Segurança
    - Enable RLS na tabela `user_sessions`
    - Política para usuários verem apenas suas próprias sessões
    - Política para admins verem todas as sessões

  3. Índices
    - Índice em user_id para consultas rápidas
    - Índice em login_at para ordenação por data
    - Índice em is_active para filtrar sessões ativas
*/

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  ip_address text,
  user_agent text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at ON user_sessions(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, is_active) WHERE is_active = true;

-- Políticas RLS
CREATE POLICY "Users can view own sessions"
  ON user_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sessions"
  ON user_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Função para criar nova sessão
CREATE OR REPLACE FUNCTION create_user_session(
  p_user_id uuid,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  session_id uuid;
BEGIN
  -- Marcar sessões anteriores como inativas
  UPDATE user_sessions 
  SET is_active = false, 
      logout_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id 
    AND is_active = true;

  -- Criar nova sessão
  INSERT INTO user_sessions (user_id, ip_address, user_agent)
  VALUES (p_user_id, p_ip_address, p_user_agent)
  RETURNING id INTO session_id;

  RETURN session_id;
END;
$$;

-- Função para finalizar sessão
CREATE OR REPLACE FUNCTION end_user_session(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_sessions 
  SET is_active = false, 
      logout_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id 
    AND is_active = true;
END;
$$;

-- View para sessões ativas com informações do usuário
CREATE OR REPLACE VIEW active_user_sessions AS
SELECT 
  us.id,
  us.user_id,
  u.email,
  us.login_at,
  us.ip_address,
  us.user_agent,
  EXTRACT(EPOCH FROM (now() - us.login_at)) / 60 as minutes_active
FROM user_sessions us
JOIN auth.users au ON us.user_id = au.id
LEFT JOIN users u ON us.user_id = u.id
WHERE us.is_active = true
ORDER BY us.login_at DESC;

-- View para histórico de sessões com informações do usuário
CREATE OR REPLACE VIEW user_sessions_history AS
SELECT 
  us.id,
  us.user_id,
  u.email,
  us.login_at,
  us.logout_at,
  us.ip_address,
  us.user_agent,
  us.is_active,
  CASE 
    WHEN us.logout_at IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (us.logout_at - us.login_at)) / 60
    ELSE 
      EXTRACT(EPOCH FROM (now() - us.login_at)) / 60
  END as session_duration_minutes
FROM user_sessions us
JOIN auth.users au ON us.user_id = au.id
LEFT JOIN users u ON us.user_id = u.id
ORDER BY us.login_at DESC;