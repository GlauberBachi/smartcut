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

// Global state to track user creation processes
const userCreationState = new Map<string, {
  inProgress: boolean;
  promise: Promise<any> | null;
  timestamp: number;
}>();

const ensureUserComplete = async (accessToken: string, userId: string): Promise<any> => {
  console.log('ensureUserComplete called for user:', userId);
  
  // Check if user creation is already in progress
  const existingState = userCreationState.get(userId);
  const now = Date.now();
  
  // If there's an ongoing process that's less than 2 minutes old, wait for it
  if (existingState && existingState.inProgress && existingState.promise && (now - existingState.timestamp) < 120000) {
    console.log('User creation already in progress, waiting for existing process...');
    try {
      return await existingState.promise;
    } catch (error) {
      console.log('Existing process failed, will retry...');
      userCreationState.delete(userId);
    }
  }

  // Clean up old entries (older than 2 minutes)
  if (existingState && (now - existingState.timestamp) > 120000) {
    console.log('Cleaning up old user creation state');
    userCreationState.delete(userId);
  }

  // Start new user creation process
  console.log('Starting new user creation process for:', userId);
  
  const creationPromise = (async () => {
    try {
      // Get current session and verify it's valid
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session available');
      }

      console.log('Making request to create-user-complete Edge Function');

      const response = await fetch(`${supabaseUrl}/functions/v1/create-user-complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge Function error:', errorText);
        
        // Check if error is due to invalid token
        if (response.status === 401) {
          throw new Error('Invalid or expired token. Please sign in again.');
        }
        
        // If it's a conflict (409), another process is handling it
        if (response.status === 409) {
          console.log('Another process is handling user creation, waiting...');
          // Wait a bit and check if user was created
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Verify the user was actually created by checking the database
          const { data: userData } = await supabase
            .from('users')
            .select('id, email')
            .eq('id', userId)
            .maybeSingle();
          
          if (userData) {
            console.log('User verified in database after conflict:', userData);
            return { success: true, message: 'User created by another process' };
          }
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
          throw new Error('User not found in database after creation');
        }
      }
      
      return result;

    } catch (error) {
      console.error('Error in ensureUserComplete:', error);
      throw error;
    }
  })();

  // Store the promise in our global state
  userCreationState.set(userId, {
    inProgress: true,
    promise: creationPromise,
    timestamp: now
  });

  try {
    const result = await creationPromise;
    // Mark as completed
    userCreationState.set(userId, {
      inProgress: false,
      promise: null,
      timestamp: now
    });
    return result;
  } catch (error) {
    // Remove from state on error so it can be retried
    userCreationState.delete(userId);
    throw error;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const processedUsers = useRef<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // Only process user creation for SIGNED_IN events with a new user
      if (session?.access_token && currentUser && event === 'SIGNED_IN') {
        
        // Check if we've already processed this user
        if (processedUsers.current.has(currentUser.id)) {
          console.log('User already processed, skipping:', currentUser.id);
          return;
        }
        
        // Mark user as being processed immediately to prevent duplicates
        processedUsers.current.add(currentUser.id);
        
        // Add a delay to ensure the auth process is complete
        setTimeout(async () => {
          try {
            console.log('Ensuring complete user record for:', currentUser.id);
            await ensureUserComplete(session.access_token, currentUser.id);
            console.log('User creation process completed for:', currentUser.id);
          } catch (error) {
            console.error('Error ensuring complete user record:', error);
            // Remove from processed set on error so it can be retried later
            processedUsers.current.delete(currentUser.id);
          }
        }, 3000); // 3 second delay to ensure auth is stable
      }
      
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      // Clear processed users on cleanup
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