import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { createAuth0Client, type Auth0Client, type User as Auth0User } from '@auth0/auth0-spa-js';
import { setAuthTokenGetter } from '@workspace/api-client-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN?.trim();
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID?.trim();
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE?.trim();
export const auth0Configured = Boolean(auth0Domain && auth0ClientId && auth0Audience);

export type AppUser = {
  sub?: string;
  name?: string | null;
  firstName?: string | null;
  email?: string | null;
  phone_number?: string | null;
  emailAddresses?: Array<{ emailAddress: string }>;
};

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AppUser | null;
  error: string | null;
  signIn: (method: 'email' | 'sms', returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAppAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAppAuth must be used inside an authentication provider');
  return auth;
}

function safeReturnPath(path?: string) {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return basePath || '/';
  return path;
}

function mapAuth0User(user?: Auth0User): AppUser | null {
  if (!user) return null;
  return {
    sub: user.sub,
    name: user.name,
    email: user.email,
    phone_number: user.phone_number,
  };
}

export function Auth0AuthAdapter({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [client, setClient] = useState<Auth0Client | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!auth0Configured || !auth0Domain || !auth0ClientId || !auth0Audience) {
      setError('La configuration Auth0 est incomplète.');
      setIsLoaded(true);
      return;
    }

    let cancelled = false;
    let authClient: Auth0Client | null = null;
    async function initialize() {
      try {
        authClient = await createAuth0Client({
          domain: auth0Domain!,
          clientId: auth0ClientId!,
          authorizationParams: {
            redirect_uri: `${window.location.origin}${basePath || '/'}`,
            audience: auth0Audience!,
            scope: 'openid profile email phone',
          },
        });

        const query = new URLSearchParams(window.location.search);
        if (query.has('code') && query.has('state')) {
          const result = await authClient.handleRedirectCallback();
          const returnTo = safeReturnPath(result.appState?.returnTo);
          window.history.replaceState({}, document.title, returnTo);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }

        const authenticated = await authClient.isAuthenticated();
        const profile = authenticated ? await authClient.getUser() : undefined;
        if (cancelled) return;
        setClient(authClient);
        setUser(mapAuth0User(profile));
        setError(null);
      } catch {
        if (cancelled) return;
        setError('La connexion Auth0 n’a pas pu être initialisée. Vérifiez les réglages du fournisseur.');
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }
    void initialize();

    return () => {
      cancelled = true;
      setAuthTokenGetter(null);
    };
  }, []);

  useEffect(() => {
    if (!client || !user?.sub) {
      setAuthTokenGetter(null);
      return;
    }
    setAuthTokenGetter(() => client.getTokenSilently({
      authorizationParams: { audience: auth0Audience },
    }).then((token) => token ?? null).catch(() => null));
    if (previousUser.current !== undefined && previousUser.current !== user.sub) qc.clear();
    previousUser.current = user.sub;
    return () => setAuthTokenGetter(null);
  }, [client, qc, user?.sub]);

  async function signIn(method: 'email' | 'sms', returnTo?: string) {
    if (!client) throw new Error('Auth0 is not configured');
    await client.loginWithRedirect({
      appState: { returnTo: safeReturnPath(returnTo) },
      authorizationParams: {
        connection: method === 'sms' ? 'sms' : 'email',
        ui_locales: 'fr',
      },
    });
  }

  async function signOut() {
    if (!client) return;
    setAuthTokenGetter(null);
    qc.clear();
    await client.logout({
      logoutParams: { returnTo: `${window.location.origin}${basePath || '/'}` },
    });
  }

  const value: AuthContextValue = {
    isLoaded,
    isSignedIn: Boolean(user),
    user,
    error,
    signIn,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function ClerkAuthAdapter({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const qc = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  const mappedUser: AppUser | null = user
    ? {
        sub: user.id,
        name: user.fullName,
        firstName: user.firstName,
        email: user.primaryEmailAddress?.emailAddress,
        emailAddresses: user.emailAddresses.map((address) => ({ emailAddress: address.emailAddress })),
      }
    : null;

  useEffect(() => {
    const id = user?.id ?? null;
    if (previousUser.current !== undefined && previousUser.current !== id) qc.clear();
    previousUser.current = id;
    setAuthTokenGetter(null);
    return () => setAuthTokenGetter(null);
  }, [qc, user?.id]);

  const value: AuthContextValue = {
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    user: mappedUser,
    error: null,
    signIn: async () => {},
    signOut: async () => { await signOut({ redirectUrl: basePath || '/' }); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function UnconfiguredAuthAdapter({ children }: { children: ReactNode }) {
  useEffect(() => { setAuthTokenGetter(null); }, []);
  const value: AuthContextValue = {
    isLoaded: true,
    isSignedIn: false,
    user: null,
    error: null,
    signIn: async () => { throw new Error('Authentication is not configured yet'); },
    signOut: async () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
