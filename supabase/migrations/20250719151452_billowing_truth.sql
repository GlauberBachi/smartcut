/*
  # Limpeza de sessões órfãs

  1. Identificação do Problema
    - Remove sessões de usuários que não existem mais nas tabelas users ou auth.users
    - Corrige registros inconsistentes que causam exibição "N/A"

  2. Limpeza
    - Remove sessões órfãs (user_id não existe em users nem auth.users)
    - Mantém integridade referencial
*/

-- Primeiro, vamos identificar sessões órfãs
DO $$
DECLARE
    orphaned_count INTEGER;
BEGIN
    -- Contar sessões órfãs
    SELECT COUNT(*) INTO orphaned_count
    FROM user_sessions us
    WHERE NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = us.user_id
    );
    
    RAISE NOTICE 'Found % orphaned sessions to clean up', orphaned_count;
    
    -- Remover sessões órfãs (usuários que não existem mais)
    DELETE FROM user_sessions 
    WHERE user_id NOT IN (
        SELECT id FROM users
    );
    
    RAISE NOTICE 'Cleaned up orphaned sessions';
END $$;