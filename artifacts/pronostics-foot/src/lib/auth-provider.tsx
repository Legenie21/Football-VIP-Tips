import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { createAuth0Client, type Auth0Client, type User as Auth0User } from '@auth0/auth0-spa-js';
import { getGetAccountSessionQueryKey, setAuthTokenGetter, useGetAccountSession, useLogoutAccount } from '@workspace/api-client-react';
import type { AccountSession, AccountUser } from '@workspace/api-client-react';

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
  id?: string;
  username?: string;
  role?: 'member' | 'admin';
  createdAt?: string;
  emailVerified?: boolean;
};

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AppUser | null;
  error: string | null;
  signIn: (method: 'email' | 'sms', returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** 'loading' | 'anonymous' | 'authenticated' | 'error' (direct adapter only; others derive it) */
  status?: 'loading' | 'anonymous' | 'authenticated' | 'error';
  retry?: () => void;
  completeAuthentication?: (user: AccountUser) => void;
  isSigningOut?: boolean;
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

/** Header required by the API on every POST. */
export const maestroActionRequest = { headers: { 'X-Maestro-Action': '1' } };

export function apiErrorStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number') return (error as { status: number }).status;
  return null;
}
export function apiErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null;
  const data = (error as { data: unknown }).data;
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') return (data as { error: string }).error;
  return null;
}

function mapAccountUser(user: AccountUser): AppUser {
  return { id: user.id, sub: user.id, email: user.email, username: user.username, name: user.username, firstName: user.username, role: user.role, createdAt: user.createdAt, emailVerified: user.emailVerified, emailAddresses: [{ emailAddress: user.email }] };
}

const sessionKey = getGetAccountSessionQueryKey();

export function DirectAuthAdapter({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const session = useGetAccountSession({
    query: {
      queryKey: sessionKey,
      refetchOnWindowFocus: true,
      refetchInterval: 5 * 60_000,
      staleTime: 30_000,
      retry: (count, error) => { const s = apiErrorStatus(error); return (s === null || s >= 500) && count < 2; },
    },
  });
  const logout = useLogoutAccount({ request: maestroActionRequest });
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const previousUser = useRef<string | null | undefined>(undefined);
  const currentId = session.data ? (session.data.user?.id ?? null) : undefined;

  const clearUserScoped = useCallback(() => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKey[0] });
  }, [qc]);

  useEffect(() => {
    setAuthTokenGetter(null);
    if (currentId === undefined) return;
    if (previousUser.current !== undefined && previousUser.current !== currentId) clearUserScoped();
    previousUser.current = currentId;
  }, [currentId, clearUserScoped]);

  const completeAuthentication = useCallback((user: AccountUser) => {
    if (previousUser.current !== user.id) clearUserScoped();
    previousUser.current = user.id;
    qc.setQueryData<AccountSession>(sessionKey, { user });
  }, [qc, clearUserScoped]);

  const signIn = useCallback(async (_method: 'email' | 'sms', returnTo?: string) => {
    const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? `/sign-in?redirect=${encodeURIComponent(returnTo)}` : '/sign-in';
    setLocation(target);
  }, [setLocation]);

  const logoutRef = useRef(logout.mutateAsync);
  logoutRef.current = logout.mutateAsync;
  const signOut = useCallback(async () => {
    setSignOutError(null);
    try {
      await logoutRef.current();
      previousUser.current = null;
      qc.setQueryData<AccountSession>(sessionKey, { user: null });
      clearUserScoped();
      setLocation('/');
    } catch (error) {
      const s = apiErrorStatus(error);
      setSignOutError(s === 503 ? 'Déconnexion impossible : le service est momentanément indisponible. Vous êtes toujours connecté.' : s === 429 ? 'Trop de tentatives. Patientez un instant avant de réessayer la déconnexion.' : 'La déconnexion a échoué. Vérifiez votre connexion puis réessayez.');
    }
  }, [qc, clearUserScoped, setLocation]);

  const user = session.data?.user ? mapAccountUser(session.data.user) : null;
  const status: AuthContextValue['status'] = session.data
    ? (session.data.user ? 'authenticated' : 'anonymous')
    : session.isError ? 'error' : 'loading';
  const value: AuthContextValue = {
    isLoaded: status !== 'loading',
    isSignedIn: Boolean(user),
    user,
    error: session.isError && !session.data ? 'La session n’a pas pu être vérifiée. Le service est peut-être momentanément indisponible.' : null,
    signIn,
    signOut,
    status,
    retry: () => { void session.refetch(); },
    completeAuthentication,
    isSigningOut: logout.isPending,
  };
  return <AuthContext.Provider value={value}>
    {children}
    {signOutError && <div role="alert" className="fixed bottom-5 left-1/2 z-[60] flex w-[min(92vw,460px)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--card))] px-5 py-4 text-sm shadow-xl" data-testid="alert-sign-out-error">
      <span className="flex-1 text-[hsl(var(--foreground))]">{signOutError}</span>
      <button type="button" className="text-xs font-bold text-[hsl(var(--primary))]" onClick={() => void signOut()} data-testid="button-sign-out-retry">Réessayer</button>
      <button type="button" className="text-xs text-[hsl(var(--muted-foreground))]" onClick={() => setSignOutError(null)} aria-label="Fermer l’alerte">Fermer</button>
    </div>}
  </AuthContext.Provider>;
}
