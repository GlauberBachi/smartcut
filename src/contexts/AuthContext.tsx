import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient, User, AuthError } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'app-auth',
    storage: localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit'
  }
});

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

const ensureUserComplete = async (accessToken: string, userId: string) => {
  const maxRetries = 10;
  let retryCount = 0;
  let delay = 2000; // Start with 2 seconds
  
  console.log('Starting ensureUserComplete for user:', userId);

  while (retryCount < maxRetries) {
    try {
      // Get current session and verify it's valid
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.log('No valid session found, attempt:', retryCount + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (retryCount < maxRetries - 1) {
          retryCount++;
          delay = Math.min(delay * 1.2, 15000); // Max 15 seconds
          continue;
        }
        throw new Error('No valid session available after retries');
      }

      console.log('Making request to create-user-complete Edge Function, attempt:', retryCount + 1);

      const response = await fetch(`${supabaseUrl}/functions/v1/create-user-complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          force_recreate: retryCount > 5 // Force recreate after 5 attempts
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge Function error:', errorText);
        
        // Check if error is due to invalid token
        if (response.status === 401) {
          throw new Error('Invalid or expired token. Please sign in again.');
        }
        
        // If it's a 500 error or timeout, retry
        if ((response.status >= 500 || response.status === 408) && retryCount < maxRetries - 1) {
          console.log(`Server error (${response.status}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          delay = Math.min(delay * 1.2, 15000);
          continue;
        }
        
        throw new Error(`Failed to create user: ${errorText}`);
      }

      const result = await response.json();
      console.log('User creation successful:', result);
      
      // Verify the user was actually created by checking the database
      if (result.success) {
        // Wait a bit for database consistency
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if user exists in our database
        const { data: userData } = await supabase
          .from('users')
          .select('id, email')
          .eq('id', userId)
          .maybeSingle();
        
        if (userData) {
          console.log('User verified in database:', userData);
          return result;
        } else {
          console.log('User not found in database, retrying...');
          if (retryCount < maxRetries - 1) {
            retryCount++;
            delay = Math.min(delay * 1.2, 15000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
      }
      
      return result;

    } catch (error) {
      console.error('Error in ensureUserComplete:', error);
      
      // If error is related to authentication, don't retry
      if (error instanceof Error && 
          (error.message.includes('Invalid token') || 
           error.message.includes('expired token'))) {
        throw error;
      }
      
      if (error instanceof Error && retryCount < maxRetries - 1) {
        console.log(`Retrying ensureUserComplete in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
        retryCount++;
        delay = Math.min(delay * 1.2, 15000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to create user after maximum retries');
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // If we have a new user (signup or signin), ensure complete user record
      if (session?.access_token && currentUser && 
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        
        // Add progressive delay based on event type
        const delay = event === 'SIGNED_IN' ? 3000 : 1000;
        
        setTimeout(async () => {
          try {
            console.log('Ensuring complete user record for:', currentUser.id);
            await ensureUserComplete(session.access_token, currentUser.id);
          } catch (error) {
            console.error('Error ensuring complete user record:', error);
            // Don't show error to user for this background operation
          }
        }, delay);
      }
      
      setLoading(false);
    });

    return () => {
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