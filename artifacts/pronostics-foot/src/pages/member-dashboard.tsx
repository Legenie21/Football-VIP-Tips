import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Link, Redirect } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, CircleAlert, LogOut, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { getGetAccountSessionQueryKey, getGetMemberDashboardQueryKey, useGetMemberDashboard } from '@workspace/api-client-react';
import { apiErrorStatus, useAppAuth } from '@/lib/auth-provider';
import { usePageMeta } from './page-meta';

function Skeleton() {
  return <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]" data-testid="status-dashboard-loading"><div className="surface space-y-4 p-6"><div className="skeleton h-4 w-24" /><div className="skeleton h-9 w-56" /><div className="skeleton h-24 w-full" /></div><div className="surface space-y-3 p-6"><div className="skeleton h-4 w-32" /><div className="skeleton h-12 w-full" /><div className="skeleton h-12 w-full" /></div></div>;
}

function Problem({ title, text, onRetry }: { title: string; text: string; onRetry: () => void }) {
  return <div role="alert" className="surface mx-auto max-w-lg p-8 text-center" data-testid="status-dashboard-error"><CircleAlert size={24} className="mx-auto text-[hsl(var(--destructive))]" /><h2 className="display-font mt-4 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p><button type="button" onClick={onRetry} className="btn-primary mt-5" data-testid="button-retry-dashboard">Réessayer</button></div>;
}

const fmt = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Douala' }).format(d); };

export function MemberDashboardPage({ Frame }: { Frame: ComponentType<{ children: ReactNode }> }) {
  usePageMeta('Mon tableau de bord · Maestro Tips VIP', 'Votre espace membre Maestro Tips VIP : informations de compte et accès aux pronostics.');
  const auth = useAppAuth();
  const qc = useQueryClient();
  const dashboard = useGetMemberDashboard({ query: { queryKey: getGetMemberDashboardQueryKey(), enabled: auth.status === 'authenticated', retry: false } });
  const expired = apiErrorStatus(dashboard.error) === 401;
  useEffect(() => { if (expired) void qc.invalidateQueries({ queryKey: getGetAccountSessionQueryKey() }); }, [expired, qc]);

  let body: ReactNode;
  if (auth.status === 'loading' || auth.status === undefined) body = <Skeleton />;
  else if (auth.status === 'error') body = <Problem title="Session non vérifiée" text="Le service des comptes ne répond pas pour le moment. Votre session n’a pas été fermée." onRetry={() => auth.retry?.()} />;
  else if (auth.status === 'anonymous') body = <Redirect to="/sign-in?redirect=%2Fdashboard" replace />;
  else if (expired) body = <div className="surface mx-auto max-w-lg p-8 text-center" data-testid="status-session-expired"><h2 className="display-font text-xl font-bold">Session expirée</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Reconnectez-vous pour retrouver votre espace.</p><Link href="/sign-in?redirect=%2Fdashboard" className="btn-primary mt-5" data-testid="link-reconnect">Se reconnecter <ArrowRight size={16} /></Link></div>;
  else if (dashboard.isLoading) body = <Skeleton />;
  else if (dashboard.isError || !dashboard.data) body = <Problem title="Tableau de bord indisponible" text={apiErrorStatus(dashboard.error) === 503 ? 'La base de données ne répond pas. Réessayez dans un moment.' : 'Le chargement a échoué. Vérifiez votre connexion.'} onRetry={() => void dashboard.refetch()} />;
  else {
    const u = dashboard.data.user;
    body = <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="surface arrive p-6 sm:p-7" aria-labelledby="account-title">
        <div className="flex items-center gap-4"><span className="display-font grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-xl font-bold text-[hsl(var(--primary-foreground))]" aria-hidden="true">{u.username.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="eyebrow">Mon compte</p><h2 id="account-title" className="display-font truncate text-2xl font-bold" data-testid="text-username">{u.username}</h2></div></div>
        <dl className="mt-6 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))] text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 py-3.5"><dt className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><Mail size={15} /> E-mail</dt><dd className="break-all font-semibold" data-testid="text-email">{u.email}</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-3.5"><dt className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><UserRound size={15} /> Rôle</dt><dd className="font-semibold" data-testid="text-role">{u.role === 'admin' ? 'Administrateur' : 'Membre'}</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-3.5"><dt className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><CalendarDays size={15} /> Compte créé le</dt><dd className="font-semibold" data-testid="text-created-at">{fmt(u.createdAt)}</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-3.5"><dt className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><ShieldCheck size={15} /> Vérification e-mail</dt><dd className="font-semibold" data-testid="text-email-verified">{u.emailVerified ? 'Vérifiée' : 'Non requise pour le moment'}</dd></div>
        </dl>
        <button type="button" onClick={() => void auth.signOut()} disabled={auth.isSigningOut} className="btn-quiet mt-6 text-sm" data-testid="button-dashboard-sign-out"><LogOut size={15} /> {auth.isSigningOut ? 'Déconnexion…' : 'Se déconnecter'}</button>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[18px] border border-[hsl(var(--accent)/.55)] bg-[hsl(var(--accent)/.17)] p-5 text-sm leading-6" data-testid="status-membership-unavailable"><div className="flex items-center gap-2 font-bold"><Sparkles size={16} /> Abonnement VIP</div><p className="mt-2 text-[hsl(var(--foreground)/.8)]">Le suivi d’abonnement n’est pas encore affiché ici : ces données sont toujours en cours de configuration. Aucun statut n’est supposé.</p></div>
        <nav className="surface divide-y divide-[hsl(var(--border))] overflow-hidden" aria-label="Accès rapides">
          <Link href="/" className="group flex items-center justify-between p-5 transition-colors hover:bg-[hsl(var(--muted))]" data-testid="link-dashboard-pronostics"><span><span className="block font-semibold">Pronostics du jour</span><span className="text-xs text-[hsl(var(--muted-foreground))]">Sélections gratuites et résultats publics</span></span><ArrowRight size={17} className="text-[hsl(var(--primary))] transition-transform group-hover:translate-x-1" /></Link>
          <Link href="/vip" className="group flex items-center justify-between p-5 transition-colors hover:bg-[hsl(var(--muted))]" data-testid="link-dashboard-vip"><span><span className="block font-semibold">Espace VIP</span><span className="text-xs text-[hsl(var(--muted-foreground))]">Offre mensuelle et paiement manuel</span></span><ArrowRight size={17} className="text-[hsl(var(--primary))] transition-transform group-hover:translate-x-1" /></Link>
          {u.role === 'admin' && <Link href="/admin" className="group flex items-center justify-between p-5 transition-colors hover:bg-[hsl(var(--muted))]" data-testid="link-dashboard-admin"><span className="font-semibold">Administration</span><ArrowRight size={17} className="text-[hsl(var(--primary))] transition-transform group-hover:translate-x-1" /></Link>}
        </nav>
      </aside>
    </div>;
  }

  return <Frame><main className="page-shell py-10 sm:py-14">
    <div className="mb-8"><p className="eyebrow">Espace membre</p><h1 className="display-font mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Mon tableau de bord</h1></div>
    {body}
  </main></Frame>;
}
