import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from '../lib/supabaseClient';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  error: string | null;
  setError: (error: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const extractRateLimitTime = (error: AuthError): number => {
  const match = error.message.match(/\d+/);
  return match ? parseInt(match[0]) : 60;
};

const getReadableErrorMessage = (error: AuthError): string => {
  if (error.message.includes('Invalid login credentials')) {
    return 'Email ou senha incorretos. Por favor, verifique suas credenciais.';
  }
  if (error.message.includes('Email not confirmed')) {
    return 'Email não confirmado. Por favor, verifique seu email para confirmar sua conta.';
  }
  if (error.message.includes('session_not_found')) {
    return 'Sessão expirada. Por favor, faça login novamente.';
  }
  return error.message;
};

// Sistema global mais robusto para controle de criação de usuários
class UserCreationManager {
  private static instance: UserCreationManager;
  private activeCreations = new Map<string, {
    promise: Promise<any>;
    timestamp: number;
    attempts: number;
  }>();
  private completedUsers = new Set<string>();
  private readonly MAX_ATTEMPTS = 1;
  private readonly TIMEOUT_MS = 300000; // 5 minutos

  static getInstance(): UserCreationManager {
    if (!UserCreationManager.instance) {
      UserCreationManager.instance = new UserCreationManager();
    }
    return UserCreationManager.instance;
  }

  private constructor() {
    // Limpeza periódica a cada 5 minutos
    setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [userId, data] of this.activeCreations.entries()) {
      if (now - data.timestamp > this.TIMEOUT_MS) {
        console.log(`Cleaning up expired creation for user: ${userId}`);
        this.activeCreations.delete(userId);
      }
    }
  }

  isUserCompleted(userId: string): boolean {
    return this.completedUsers.has(userId);
  }

  markUserCompleted(userId: string) {
    this.completedUsers.add(userId);
    this.activeCreations.delete(userId);
    console.log(`User marked as completed: ${userId}`);
  }

  async ensureUserComplete(accessToken: string, userId: string): Promise<any> {
    // Se já foi completado, retorna sucesso imediatamente
    if (this.isUserCompleted(userId)) {
      console.log(`User already completed: ${userId}`);
      return { success: true, message: 'User already completed' };
    }

    // Verifica se já existe um processo ativo
    const existing = this.activeCreations.get(userId);
    if (existing) {
      console.log(`Waiting for existing creation process: ${userId}`);
      try {
        return await existing.promise;
      } catch (error) {
        console.log(`Existing process failed, will retry: ${error.message}`);
        this.activeCreations.delete(userId);
      }
    }

    // Verifica se já excedeu o número máximo de tentativas
    if (existing && existing.attempts >= this.MAX_ATTEMPTS) {
      console.log(`Max attempts reached for user: ${userId}`);
      throw new Error('Maximum creation attempts reached');
    }

    // Cria novo processo de criação
    const creationPromise = this.createUser(accessToken, userId);
    
    this.activeCreations.set(userId, {
      promise: creationPromise,
      timestamp: Date.now(),
      attempts: (existing?.attempts || 0) + 1
    });

    try {
      const result = await creationPromise;
      
      if (result.success) {
        this.markUserCompleted(userId);
      }
      
      return result;
    } catch (error) {
      console.error(`User creation failed for ${userId}:`, error);
      this.activeCreations.delete(userId);
      throw error;
    }
  }

  private async createUser(accessToken: string, userId: string): Promise<any> {
    console.log(`Starting user creation for: ${userId}`);

    try {
      // Primeiro, verifica se o usuário já existe no banco
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (existingUser) {
        console.log(`User already exists in database: ${userId}`);
        this.markUserCompleted(userId);
        return { success: true, message: 'User already exists' };
      }

      // Verifica se já tem customer no Stripe
      const { data: existingCustomer } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (existingCustomer?.customer_id && !existingCustomer.customer_id.startsWith('temp_')) {
        console.log(`User already has Stripe customer: ${userId}`);
        this.markUserCompleted(userId);
        return { success: true, message: 'User already has Stripe customer' };
      }

      // Faz a chamada para a Edge Function
      console.log(`Making Edge Function call for: ${userId}`);
      
      const response = await fetch(`${supabaseUrl}/functions/v1/create-user-complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          force_recreate: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Edge Function error for ${userId}:`, errorText);
        
        if (response.status === 409) {
          console.log(`Conflict detected for ${userId}, checking if user was created...`);
          
          // Aguarda um pouco e verifica se foi criado
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
          
          if (userData) {
            console.log(`User was created by another process: ${userId}`);
            this.markUserCompleted(userId);
            return { success: true, message: 'User created by another process' };
          }
        }
        
        throw new Error(`Edge Function failed: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Edge Function result for ${userId}:`, result);
      
      if (result.success) {
        // Verifica se o usuário foi realmente criado
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        
        if (userData) {
          console.log(`User creation verified for: ${userId}`);
          this.markUserCompleted(userId);
          return result;
        } else {
          throw new Error('User not found in database after creation');
        }
      }
      
      return result;

    } catch (error) {
      console.error(`Error creating user ${userId}:`, error);
      throw error;
    }
  }
}

const userCreationManager = UserCreationManager.getInstance();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const processedUsers = useRef<Set<string>>(new Set());
  const authStateProcessed = useRef<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log(`Auth state change: ${event}`, session?.user?.id);
      
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // Processa criação de usuário apenas uma vez por sessão
      if (session?.access_token && currentUser && event === 'SIGNED_IN' && !authStateProcessed.current) {
        
        // Marca como processado imediatamente
        authStateProcessed.current = true;
        
        // Verifica se já foi processado anteriormente
        if (processedUsers.current.has(currentUser.id)) {
          console.log(`User already processed in this session: ${currentUser.id}`);
          setLoading(false);
          return;
        }
        
        // Marca como processado
        processedUsers.current.add(currentUser.id);
        
        // Verifica se já está completo no manager
        if (userCreationManager.isUserCompleted(currentUser.id)) {
          console.log(`User already completed: ${currentUser.id}`);
          setLoading(false);
          return;
        }
        
        // Delay para garantir estabilidade da sessão
        setTimeout(async () => {
          if (!mounted) return;
          
          try {
            console.log(`Processing user creation for: ${currentUser.id}`);
            await userCreationManager.ensureUserComplete(session.access_token, currentUser.id);
            console.log(`User creation completed for: ${currentUser.id}`);
          } catch (error) {
            console.error(`Error ensuring complete user record: ${error.message}`);
            // Remove do processedUsers para permitir retry em futuras sessões
            processedUsers.current.delete(currentUser.id);
            authStateProcessed.current = false;
          }
        }, 2000);
      }
      
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      // Reset do estado quando o componente é desmontado
      authStateProcessed.current = false;
      processedUsers.current.clear();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` }
      });

      if (signUpError) {
        if (signUpError.message.includes('over_email_send_rate_limit')) {
          const waitTime = extractRateLimitTime(signUpError);
          throw new Error(`over_email_send_rate_limit:${waitTime}`);
        }
        throw signUpError;
      }
      
      setError(null);
    } catch (error) {
      let errorMessage = 'Ocorreu um erro inesperado durante o cadastro';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error instanceof AuthError) {
        errorMessage = getReadableErrorMessage(error);
      }
      setError(errorMessage);
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      // Reset do estado antes do login
      authStateProcessed.current = false;
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof AuthError 
        ? getReadableErrorMessage(error)
        : 'Ocorreu um erro inesperado durante o login';
      setError(errorMessage);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof AuthError
        ? getReadableErrorMessage(error)
        : 'Ocorreu um erro ao enviar o email de redefinição de senha';
      setError(errorMessage);
      throw error;
    }
  };

  const resendVerificationEmail = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup_confirm',
        email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });

      if (error) {
        if (error.message.includes('over_email_send_rate_limit')) {
          const waitTime = extractRateLimitTime(error);
          throw new Error(`over_email_send_rate_limit:${waitTime}`);
        }
        throw error;
      }
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof AuthError 
        ? getReadableErrorMessage(error)
        : 'Ocorreu um erro ao reenviar o email de verificação';
      setError(errorMessage);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Reset do estado antes do login
      authStateProcessed.current = false;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (error) throw error;
      setError(null);
      setLoading(false);
    } catch (error) {
      const errorMessage = error instanceof AuthError 
        ? getReadableErrorMessage(error)
        : `Ocorreu um erro durante o login com Google: ${error.message}`;
      setError(errorMessage);
      setLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Reset de todos os estados
      authStateProcessed.current = false;
      processedUsers.current.clear();
      setUser(null);
      localStorage.removeItem('app-auth');
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('Error signing out from Supabase:', error);
      }
      setError(null);
    } catch (error) {
      console.warn('Error during sign out:', error);
      const errorMessage = error instanceof AuthError 
        ? getReadableErrorMessage(error)
        : 'Ocorreu um erro durante o logout';
      setError(errorMessage);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signUp, 
      signIn, 
      signInWithGoogle, 
      signOut,
      resendVerificationEmail,
      resetPassword,
      error, 
      setError 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};