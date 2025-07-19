import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from '../lib/supabaseClient';

// Função para obter IP do usuário (aproximado)
const getUserIP = async (): Promise<string | null> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn('Could not get user IP:', error);
    return null;
  }
};

// Função para criar sessão de usuário
const createUserSession = async (userId: string) => {
  try {
    const ip = await getUserIP();
    const userAgent = navigator.userAgent;
    
    const { data, error } = await supabase.rpc('create_user_session', {
      p_user_id: userId,
      p_ip_address: ip,
      p_user_agent: userAgent
    });
    
    if (error) {
      console.warn('Error creating user session:', error);
    } else {
      console.log('User session created successfully');
    }
  } catch (error) {
    console.warn('Error in createUserSession:', error);
  }
};

// Função para finalizar sessão de usuário
const endUserSession = async (userId: string) => {
  try {
    const { error } = await supabase.rpc('end_user_session', {
      p_user_id: userId
    });
    
    if (error) {
      console.warn('Error ending user session:', error);
    } else {
      console.log('User session ended successfully');
    }
  } catch (error) {
    console.warn('Error in endUserSession:', error);
  }
};
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

// Sistema global para controle de criação de usuários - SIMPLIFICADO
class UserCreationManager {
  private static instance: UserCreationManager;
  private completedUsers = new Set<string>();
  private processingUsers = new Set<string>();

  static getInstance(): UserCreationManager {
    if (!UserCreationManager.instance) {
      UserCreationManager.instance = new UserCreationManager();
    }
    return UserCreationManager.instance;
  }

  private constructor() {}

  isUserCompleted(userId: string): boolean {
    return this.completedUsers.has(userId);
  }

  isUserProcessing(userId: string): boolean {
    return this.processingUsers.has(userId);
  }

  markUserCompleted(userId: string) {
    this.completedUsers.add(userId);
    this.processingUsers.delete(userId);
    console.log(`User marked as completed: ${userId}`);
  }

  markUserProcessing(userId: string) {
    this.processingUsers.add(userId);
    console.log(`User marked as processing: ${userId}`);
  }

  reset() {
    this.completedUsers.clear();
    this.processingUsers.clear();
    console.log('UserCreationManager reset');
  }

  async ensureUserComplete(accessToken: string, userId: string): Promise<any> {
    console.log(`ensureUserComplete called for user: ${userId}`);
    
    // Verifica se já foi completado
    if (this.isUserCompleted(userId)) {
      console.log(`User already completed: ${userId}`);
      return { success: true, message: 'User already completed' };
    }

    // Verifica se já está sendo processado
    if (this.isUserProcessing(userId)) {
      console.log(`User already being processed: ${userId}`);
      return { success: true, message: 'User being processed' };
    }

    // Marca como processando
    this.markUserProcessing(userId);

    try {
      const result = await this.createUser(accessToken, userId);
      
      if (result.success) {
        this.markUserCompleted(userId);
      } else {
        this.processingUsers.delete(userId);
      }
      
      return result;
    } catch (error) {
      console.error(`User creation failed for ${userId}:`, error);
      this.processingUsers.delete(userId);
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
        
        // Verifica se tem customer no Stripe
        const { data: existingCustomer } = await supabase
          .from('stripe_customers')
          .select('customer_id')
          .eq('user_id', userId)
          .is('deleted_at', null)
          .maybeSingle();

        if (existingCustomer?.customer_id && !existingCustomer.customer_id.startsWith('temp_')) {
          console.log(`User already has Stripe customer: ${userId}`);
          return { success: true, message: 'User already exists with Stripe customer' };
        }
      }

      // Faz a chamada para a Edge Function com retry limitado
      console.log(`Making Edge Function call for: ${userId}`);
      
      const maxRetries = 3;
      let lastError: any;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
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

          if (response.ok) {
            const result = await response.json();
            console.log(`Edge Function success for ${userId} on attempt ${attempt}:`, result);
            return result;
          }

          if (response.status === 409) {
            console.log(`Conflict detected for ${userId} on attempt ${attempt}, checking if user was created...`);
            
            // Aguarda um pouco e verifica se foi criado
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const { data: userData } = await supabase
              .from('users')
              .select('id')
              .eq('id', userId)
              .maybeSingle();
            
            if (userData) {
              console.log(`User was created by another process: ${userId}`);
              return { success: true, message: 'User created by another process' };
            }
          }

          const errorText = await response.text();
          lastError = new Error(`Edge Function failed (attempt ${attempt}): ${errorText}`);
          console.error(lastError.message);

          // Se não é o último retry, aguarda antes de tentar novamente
          if (attempt < maxRetries) {
            const delay = attempt * 2000; // 2s, 4s, 6s
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (fetchError) {
          lastError = fetchError;
          console.error(`Network error on attempt ${attempt}:`, fetchError);
          
          if (attempt < maxRetries) {
            const delay = attempt * 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError || new Error('All retry attempts failed');

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
  const userCreationInProgress = useRef<boolean>(false);

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
      const previousUser = user;
      setUser(currentUser);
      
      // Gerenciar sessões de usuário
      if (event === 'SIGNED_IN' && currentUser) {
        // Criar nova sessão quando usuário faz login
        await createUserSession(currentUser.id);
      } else if (event === 'SIGNED_OUT' && previousUser) {
        // Finalizar sessão quando usuário faz logout
        await endUserSession(previousUser.id);
      }
      
      // Processa criação de usuário apenas no SIGNED_IN e se não estiver em progresso
      if (session?.access_token && currentUser && event === 'SIGNED_IN' && !userCreationInProgress.current) {
        
        // Verifica se já foi processado anteriormente nesta sessão
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
        
        // Marca como em progresso
        userCreationInProgress.current = true;
        
        // Delay mínimo para garantir estabilidade da sessão
        setTimeout(async () => {
          if (!mounted || !userCreationInProgress.current) return;
          
          try {
            console.log(`Processing user creation for: ${currentUser.id}`);
            console.log(`User email: ${currentUser.email}`);
            await userCreationManager.ensureUserComplete(session.access_token, currentUser.id);
            console.log(`User creation completed for: ${currentUser.id}`);
          } catch (error) {
            console.error(`Error ensuring complete user record: ${error.message}`);
            // Remove do processedUsers para permitir retry em futuras sessões
            processedUsers.current.delete(currentUser.id);
          } finally {
            userCreationInProgress.current = false;
          }
        }, 2000); // Aumentado para 2 segundos para dar mais tempo
      }
      
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
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
      // Reset de estados antes do login
      userCreationInProgress.current = false;
      
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
      
      // Reset de estados antes do login
      userCreationInProgress.current = false;

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
      // Finalizar sessão antes do logout
      if (user?.id) {
        await endUserSession(user.id);
      }
      
      // Reset de todos os estados
      userCreationInProgress.current = false;
      processedUsers.current.clear();
      userCreationManager.reset();
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