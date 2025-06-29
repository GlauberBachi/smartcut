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

const createStripeCustomer = async (accessToken: string) => {
  const maxRetries = 5;
  let retryCount = 0;
  let delay = 8000; // Initial delay of 8 seconds to allow database records to be committed
  console.log('Starting createStripeCustomer with token length:', accessToken.length);

  while (retryCount < maxRetries) {
    try {
      // Get current session and verify it's valid
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Current session:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        tokenMatch: session?.access_token === accessToken
      });

      if (!session?.access_token) {
        console.log('No valid session found, attempt:', retryCount + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (retryCount < maxRetries - 1) {
          retryCount++;
          delay = Math.min(delay * 1.2, 20000); // Gradual backoff, max 20 seconds
          continue;
        }
        throw new Error('No valid session available after retries');
      }

      // Validate the token by attempting to get user data
      const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);
      
      if (userError || !user) {
        console.error('Token validation failed:', userError);
        throw new Error('Invalid token. Please sign in again.');
      }

      console.log('Session found, making request to Edge Function');

      const response = await fetch(`${supabaseUrl}/functions/v1/create-stripe-customer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge Function error:', errorText);
        
        // Check if error is due to invalid token
        if (response.status === 401) {
          throw new Error('Invalid or expired token. Please sign in again.');
        }
        
        // If it's a 404 (user data not found), retry with longer delay
        if (response.status === 404 && retryCount < maxRetries - 1) {
          console.log(`User data not ready yet, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          delay = Math.min(delay * 1.3, 20000);
          continue;
        }
        
        throw new Error(`Failed to create Stripe customer: ${errorText}`);
      }

      const result = await response.json();
      console.log('Stripe customer creation successful:', result);
      return result;

    } catch (error) {
      console.error('Error in createStripeCustomer:', error);
      
      // If error is related to authentication, don't retry
      if (error instanceof Error && 
          (error.message.includes('Invalid token') || 
           error.message.includes('expired token'))) {
        throw error;
      }
      
      if (error instanceof Error && retryCount < maxRetries - 1) {
        console.log(`Retrying createStripeCustomer in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
        retryCount++;
        delay = Math.min(delay * 1.3, 20000); // Gradual backoff, max 20 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to create Stripe customer after maximum retries');
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      
      // If we have a session, ensure Stripe customer exists
      if (session?.access_token) {
        createStripeCustomer(session.access_token).catch(error => {
          console.error('Error creating Stripe customer during session check:', error);
        });
      }
      
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // If we have a new session, ensure Stripe customer exists with delay
      if (session?.access_token) {
        // Add a longer delay for new user creation to ensure database records are committed
        setTimeout(async () => {
          try {
            await createStripeCustomer(session.access_token);
          } catch (error) {
            console.error('Error creating Stripe customer during auth change:', error);
          }
        }, 5000); // 5 second delay
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

      // Get the session after signup
      const { data: { session } } = await supabase.auth.getSession();
      
      // Create Stripe customer if we have a session (with longer delay to ensure DB records exist)
      if (session?.access_token) {
        setTimeout(async () => {
          try {
            await createStripeCustomer(session.access_token);
          } catch (stripeError) {
            console.error('Error creating Stripe customer during signup:', stripeError);
          }
        }, 8000); // 8 second delay for signup
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

      // Get fresh session after sign in
      const { data: { session } } = await supabase.auth.getSession();
      
      // Create Stripe customer if we have a session (with delay to ensure DB records exist)
      if (session?.access_token) {
        setTimeout(async () => {
          try {
            await createStripeCustomer(session.access_token);
          } catch (stripeError) {
            console.error('Error creating Stripe customer during signin:', stripeError);
          }
        }, 5000); // 5 second delay for signin
      }
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

      // Get fresh session after Google sign in
      const { data: { session } } = await supabase.auth.getSession();
      
      // Create Stripe customer if we have a session
      if (session?.access_token) {
        setTimeout(async () => {
          try {
            console.log('Creating Stripe customer after Google sign in');
            await createStripeCustomer(session.access_token);
            console.log('Successfully created Stripe customer after Google sign in');
          } catch (stripeError) {
            console.error('Error creating Stripe customer during Google sign in:', stripeError);
          }
        }, 5000); // 5 second delay for Google signin
      }

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