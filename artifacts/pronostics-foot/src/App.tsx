import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { frFR } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminMembershipsQueryKey, getGetAdminPaymentRequestsQueryKey, getGetAdminPredictionsQueryKey, getGetAdminSummaryQueryKey,
  getGetMembershipQueryKey, getGetMyPaymentRequestsQueryKey, getGetPaymentInstructionsQueryKey,
  getGetPredictionsQueryKey, getGetSummaryQueryKey, useCreatePaymentRequest, useCreatePrediction,
  useGetAdminMemberships, useGetAdminPaymentRequests, useGetAdminPredictions, useGetAdminSummary, useGetMembership,
  useGetMyPaymentRequests, useGetPaymentInstructions, useGetPredictions, useGetSummary,
  useManageAdminMembership, useReviewPaymentRequest, useUpdatePaymentInstructions, useUpdatePrediction,
} from '@workspace/api-client-react';
import type { Prediction, PredictionInput, PredictionUpdate } from '@workspace/api-client-react';
import {
  Activity, ArrowDownRight, ArrowRight, Award, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleAlert, Clock3, Copy, LockKeyhole, LogOut, Menu, ShieldCheck, Sparkles, Trophy, X,
} from 'lucide-react';
import { Route, Switch, Link, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Auth0AuthAdapter, auth0Configured, ClerkAuthAdapter, useAppAuth } from '@/lib/auth-provider';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }

const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#236c50', colorForeground: '#193b30', colorMutedForeground: '#6b8177',
    colorDanger: '#ad3c31', colorBackground: '#fffdf8', colorInput: '#f6f4ec',
    colorInputForeground: '#193b30', colorNeutral: '#193b30', fontFamily: "'DM Sans', sans-serif", borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#193b30] font-bold', headerSubtitle: 'text-[#62796e]', socialButtonsBlockButtonText: 'text-[#193b30] font-semibold',
    formFieldLabel: 'text-[#193b30] font-semibold', footerActionLink: 'text-[#236c50] font-semibold',
    footerActionText: 'text-[#6b8177]', dividerText: 'text-[#6b8177]', identityPreviewEditButton: 'text-[#236c50]',
    formFieldSuccessText: 'text-[#236c50]', alertText: 'text-[#ad3c31]', logoBox: 'rounded-xl',
    logoImage: 'object-contain', socialButtonsBlockButton: 'border-[#deded2] rounded-xl',
    formButtonPrimary: 'bg-[#236c50] hover:bg-[#1b593f] rounded-xl', formFieldInput: 'bg-[#f6f4ec] border-[#deded2] rounded-xl',
    footerAction: 'text-[#6b8177]', dividerLine: 'bg-[#e5e3da]', alert: 'rounded-xl',
    otpCodeFieldInput: 'rounded-lg border-[#deded2]', formFieldRow: 'gap-2', main: 'gap-5',
  },
};

function ClerkCacheSync() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previousUser.current !== undefined && previousUser.current !== id) qc.clear();
    previousUser.current = id;
  }), [addListener, qc]);
  return null;
}

function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 4200); return () => window.clearTimeout(timer); }, [message, onClose]);
  return <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl bg-[hsl(var(--foreground))] px-5 py-4 text-sm text-[hsl(var(--background))] shadow-xl">
    <CheckCircle2 size={18} className="shrink-0 text-[hsl(var(--accent))]" />{message}<button aria-label="Fermer" onClick={onClose} className="ml-2 rounded p-1"><X size={15} /></button>
  </div>;
}

function SiteHeader() {
  const { isSignedIn, user, signOut } = useAppAuth();
  const [open, setOpen] = useState(false);
  return <header className="relative z-20 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.94)]">
    <div className="page-shell flex h-[74px] items-center justify-between">
      <Link href="/" className="flex items-center gap-3" data-testid="link-home">
        <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Trophy size={21} strokeWidth={2.4} /></span>
        <span><strong className="display-font block text-[15px] leading-tight">Pronostics Foot</strong><span className="text-[10px] font-semibold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Le football, sans détour</span></span>
      </Link>
      <nav className={`${open ? 'absolute left-0 right-0 top-[73px] flex flex-col border-b bg-[hsl(var(--background))] p-5 shadow-md' : 'hidden'} gap-6 text-sm font-semibold md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
        <Link href="/" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]" data-testid="link-pronostics">Pronostics</Link>
        <a href="#resultats" onClick={() => setOpen(false)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]">Résultats</a>
        <Link href="/vip" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]" data-testid="link-vip-nav">Espace VIP</Link>
        {isSignedIn && <Link href="/admin" onClick={() => setOpen(false)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]" data-testid="link-admin">Administration</Link>}
        {isSignedIn
          ? <button onClick={() => void signOut()} className="btn-quiet text-sm" data-testid="button-sign-out"><LogOut size={15} /> Déconnexion</button>
          : <Link href="/sign-in" className="btn-primary text-sm" data-testid="link-sign-in">Connexion <ArrowRight size={15} /></Link>}
      </nav>
      <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={open} data-testid="button-menu">
        {open ? <X size={21} /> : <Menu size={21} />}
      </button>
      <div className="hidden items-center gap-3 md:flex">
        {isSignedIn && <span className="max-w-[130px] truncate text-xs text-[hsl(var(--muted-foreground))]">{user?.firstName || user?.emailAddresses?.[0]?.emailAddress || user?.email || user?.phone_number}</span>}
        {isSignedIn
          ? <button onClick={() => void signOut()} className="btn-quiet text-sm" data-testid="button-sign-out-desktop"><LogOut size={15} /> Sortir</button>
          : <Link href="/sign-in" className="btn-primary text-sm" data-testid="link-sign-in-desktop">Connexion <ArrowRight size={15} /></Link>}
      </div>
    </div>
  </header>;
}

function PageFrame({ children, notice, clearNotice }: { children: ReactNode; notice?: string; clearNotice?: () => void }) {
  return <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
    <SiteHeader />{children}
    <footer className="mt-20 border-t border-[hsl(var(--border))] py-8">
      <div className="page-shell flex flex-col justify-between gap-4 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} Pronostics Foot · Yaoundé, Cameroun</span>
        <span className="flex items-center gap-2"><ShieldCheck size={14} /> Pronostics informatifs, jamais une certitude.</span>
      </div>
    </footer>{notice && clearNotice && <Notice message={notice} onClose={clearNotice} />}
  </div>;
}

function ErrorLine({ message, retry }: { message: string; retry: () => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] p-4 text-sm" role="alert">
    <span className="flex items-center gap-2"><CircleAlert size={17} className="text-[hsl(var(--destructive))]" />{message}</span>
    <button onClick={retry} className="btn-quiet shrink-0 text-xs" data-testid="button-retry">Réessayer</button>
  </div>;
}

function PredictionSkeleton() {
  return <div className="surface space-y-5 p-5"><div className="skeleton h-3 w-24" /><div className="flex justify-between"><div className="skeleton h-10 w-32" /><div className="skeleton h-8 w-8" /><div className="skeleton h-10 w-32" /></div><div className="skeleton h-12 w-full" /></div>;
}

function formatKickoff(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
function shortMark(team: string) { return team.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(); }
function resultLabel(status: string) { return status === 'won' ? 'Gagné' : status === 'lost' ? 'Perdu' : status === 'void' ? 'Annulé' : 'À venir'; }
function membershipStatusLabel(status?: string) {
  return status === 'active' ? 'Actif' : status === 'expired' ? 'Expiré' : status === 'suspended' ? 'Suspendu' : 'Inactif';
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(value));
}

function PredictionCard({ item }: { item: Prediction }) {
  const locked = item.locked && item.tier === 'vip';
  return <article className={`surface arrive overflow-hidden p-5 ${locked ? 'border-dashed' : ''}`} data-testid={`card-prediction-${item.id}`}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]"><span className="truncate">{item.league}</span><span className="h-1 w-1 rounded-full bg-[hsl(var(--accent))]" /><span>{formatKickoff(item.kickoffAt)}</span></div>
      {locked ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--secondary))] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]"><LockKeyhole size={12} /> VIP</span>
        : <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.tier === 'vip' ? 'bg-[hsl(var(--accent)/.22)] text-[hsl(var(--foreground))]' : 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]'}`}>{item.tier === 'vip' ? 'VIP' : 'Gratuit'}</span>}
    </div>
    <div className="my-5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-3"><span className="team-mark shrink-0">{shortMark(item.homeTeam)}</span><h3 className="display-font truncate text-base font-semibold sm:text-lg">{item.homeTeam}</h3></div>
      <span className="rounded-lg bg-[hsl(var(--muted))] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">contre</span>
      <div className="flex min-w-0 items-center gap-3"><h3 className="display-font truncate text-right text-base font-semibold sm:text-lg">{item.awayTeam}</h3><span className="team-mark shrink-0">{shortMark(item.awayTeam)}</span></div>
    </div>
    {locked ? <div className="flex items-center justify-between gap-3 rounded-xl bg-[hsl(var(--muted))] px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]"><LockKeyhole size={16} /> Analyse réservée aux membres</span>
      <Link href="/vip" className="shrink-0 text-xs font-bold text-[hsl(var(--primary))]" data-testid={`link-unlock-${item.id}`}>Découvrir <ArrowRight size={13} className="inline" /></Link>
    </div> : <div className="grid grid-cols-2 gap-3 rounded-xl bg-[hsl(var(--muted))] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{item.market || 'Sélection'}</p><p className="mt-1 text-sm font-bold">{item.selection || '—'}</p></div>
      <div className="text-right sm:px-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Cote</p><p className="display-font mt-1 font-bold">{item.odds ?? '—'}</p></div>
      <span className={`col-span-2 flex items-center gap-1.5 text-xs font-semibold sm:col-span-1 ${item.status === 'upcoming' ? 'text-[hsl(var(--muted-foreground))]' : item.status === 'won' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]'}`}>
        {item.status === 'won' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{resultLabel(item.status)}
      </span>
      {item.analysis && <p className="col-span-full border-t border-[hsl(var(--border))] pt-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.analysis}</p>}
    </div>}
  </article>;
}

function Home() {
  const qc = useQueryClient();
  const summary = useGetSummary({ query: { queryKey: getGetSummaryQueryKey() } });
  const predictions = useGetPredictions({}, { query: { queryKey: getGetPredictionsQueryKey({}) } });
  const { user } = useAppAuth();
  const membership = useGetMembership({ query: { queryKey: getGetMembershipQueryKey(), enabled: Boolean(user) } });
  const [membershipClock, setMembershipClock] = useState(() => Date.now());
  useEffect(() => {
    const expiresAt = membership.data?.expiresAt;
    if (!membership.data?.active || !expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => {
      setMembershipClock(Date.now());
      void qc.invalidateQueries({ queryKey: getGetPredictionsQueryKey({}) });
      void membership.refetch();
    }, Math.max(0, Math.min(remaining, 2_147_000_000)));
    return () => window.clearTimeout(timer);
  }, [membership.data?.active, membership.data?.expiresAt, membership.refetch, qc]);
  const hasVipAccess = Boolean(
    membership.data?.active &&
      membership.data.expiresAt &&
      new Date(membership.data.expiresAt).getTime() > membershipClock,
  );
  const data = predictions.data ?? [];
  const picks = data.filter((pick) => pick.status === 'upcoming' && (pick.tier === 'free' || hasVipAccess));
  const free = picks.filter((pick) => pick.tier === 'free');
  const vipCount = picks.filter((pick) => pick.tier === 'vip').length;
  const recent = summary.data?.latestResults ?? [];
  return <PageFrame>
    <main className="page-shell">
      <section className="relative mt-7 overflow-hidden rounded-[28px] bg-[hsl(var(--sidebar))] px-6 py-8 text-[hsl(var(--sidebar-foreground))] sm:mt-10 sm:px-10 sm:py-11">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/10 sm:right-[11%]"><div className="absolute inset-8 rounded-full border border-white/10"><div className="absolute inset-8 rounded-full border border-white/10" /></div></div>
        <div className="relative max-w-[630px]">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--accent))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> Foot camerounais, analyses claires</div>
          <h1 className="display-font text-[clamp(2.5rem,7vw,5rem)] font-bold leading-[.98] tracking-[-.055em]">Le match se joue.<br /><span className="text-[hsl(var(--accent))]">Le choix aussi.</span></h1>
          <p className="mt-5 max-w-[480px] text-sm leading-6 text-white/70 sm:text-base">Des pronostics expliqués, des résultats suivis honnêtement. Commencez avec les sélections gratuites du jour.</p>
          <div className="mt-7 flex flex-wrap gap-3"><a href="#pronostics" className="btn-primary bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]" data-testid="link-see-picks">Voir les pronostics <ArrowDownRight size={17} /></a><Link href="/vip" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold hover:bg-white/5" data-testid="link-discover-vip">Offre VIP <ArrowRight size={16} /></Link></div>
        </div>
        <div className="relative mt-9 grid grid-cols-3 border-t border-white/15 pt-5 sm:absolute sm:bottom-10 sm:right-10 sm:mt-0 sm:w-[340px] sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
          <div><strong className="display-font block text-2xl text-[hsl(var(--accent))]">{summary.data?.todayCount ?? '—'}</strong><span className="mt-1 block text-[10px] text-white/60">sélections du jour</span></div>
          <div><strong className="display-font block text-2xl">{summary.data?.freeTodayCount ?? '—'}</strong><span className="mt-1 block text-[10px] text-white/60">en accès libre</span></div>
          <div><strong className="display-font block text-2xl">{summary.data?.hitRate != null ? `${summary.data.hitRate}%` : '—'}</strong><span className="mt-1 block text-[10px] text-white/60">réussite suivie</span></div>
        </div>
      </section>

      <section className="mt-9 grid gap-6 lg:grid-cols-[1fr_300px]" id="pronostics">
        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div><p className="eyebrow">À l’affiche</p><h2 className="display-font mt-1 text-2xl font-bold tracking-tight">Pronostics du jour</h2></div>
            <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{free.length} gratuit{free.length > 1 ? 's' : ''} · {vipCount} VIP</span>
          </div>
          {predictions.isLoading ? <div className="space-y-3"><PredictionSkeleton /><PredictionSkeleton /></div>
            : predictions.isError ? <ErrorLine message="Impossible de charger les pronostics." retry={() => predictions.refetch()} />
              : picks.length === 0 ? <div className="surface px-6 py-10 text-center"><CalendarDays size={24} className="mx-auto text-[hsl(var(--primary))]" /><h3 className="mt-3 font-semibold">Pas encore de sélection publiée</h3><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Revenez avant les prochains coups d’envoi.</p></div>
                : <div className="space-y-3">{picks.map((pick) => <PredictionCard key={pick.id} item={pick} />)}</div>}
        </div>
        <aside className="space-y-4">
          <div className="surface overflow-hidden p-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Notre méthode</span><Activity size={17} className="text-[hsl(var(--primary))]" /></div>
            <h3 className="display-font mt-3 text-xl font-bold">Tout est suivi.</h3>
            <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Chaque pronostic publié reste visible, avec son résultat après le match. Pas de sélection effacée après coup.</p>
            <div className="mt-5 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-4 text-sm"><span className="display-font font-bold">{summary.data?.settledCount ?? '—'}</span><span className="text-[hsl(var(--muted-foreground))]">pronostics déjà réglés</span></div>
          </div>
          <div className="rounded-[18px] bg-[hsl(var(--accent)/.24)] p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><Sparkles size={15} /> Membres VIP</div>
            <h3 className="display-font mt-3 text-xl font-bold">Plus d’analyse.<br />Même transparence.</h3>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--foreground)/.78)]">Débloquez les picks VIP pour 1 000 FCFA par mois. Activation manuelle après vérification.</p>
            <Link href={user ? '/vip' : '/sign-up'} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[hsl(var(--primary))]" data-testid="link-vip-join">En savoir plus <ArrowRight size={15} /></Link>
          </div>
          <div className="rounded-[18px] border border-[hsl(var(--border))] px-5 py-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><ShieldCheck size={16} className="mb-2 text-[hsl(var(--primary))]" />Les pronostics sont des analyses, pas des garanties de gain. Jouez de façon responsable et uniquement avec des moyens que vous pouvez perdre.</div>
        </aside>
      </section>

      <section id="resultats" className="mt-12">
        <div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Bilan public</p><h2 className="display-font mt-1 text-2xl font-bold">Les derniers résultats</h2></div><span className="text-xs text-[hsl(var(--muted-foreground))]">Historique sans filtre</span></div>
        {summary.isLoading ? <div className="surface p-6"><div className="skeleton h-5 w-48" /></div>
          : summary.isError ? <ErrorLine message="Le bilan n’est pas disponible pour le moment." retry={() => summary.refetch()} />
            : recent.length === 0 ? <div className="surface px-6 py-8 text-sm text-[hsl(var(--muted-foreground))]">Les premiers résultats apparaîtront après les rencontres.</div>
              : <div className="grid gap-3 md:grid-cols-2">{recent.map((result) => <PredictionCard key={result.id} item={result} />)}</div>}
      </section>
      <p className="my-9 text-center text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Les statistiques reflètent uniquement les pronostics publiés et réglés. Elles ne préjugent pas des résultats à venir.</p>
    </main>
  </PageFrame>;
}

function LoginWall({ title = 'Connectez-vous à votre espace', redirectTo }: { title?: string; redirectTo?: string }) {
  const signInPath = redirectTo ? `/sign-in?redirect=${encodeURIComponent(redirectTo)}` : '/sign-in';
  return <div className="surface mx-auto max-w-lg p-8 text-center"><LockKeyhole className="mx-auto text-[hsl(var(--primary))]" size={25} /><h2 className="display-font mt-4 text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Votre compte permet de suivre votre demande et l’état de votre abonnement.</p><Link href={signInPath} className="btn-primary mt-5" data-testid="link-sign-in-required">Se connecter <ArrowRight size={16} /></Link><p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">Nouveau ici ? <Link href="/sign-up" className="font-bold text-[hsl(var(--primary))]" data-testid="link-sign-up-required">Créer un compte</Link></p></div>;
}

function VipPage() {
  const { isSignedIn, isLoaded } = useAppAuth();
  const [operator, setOperator] = useState<'MTN' | 'ORANGE'>('MTN');
  const [reference, setReference] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();
  const instructions = useGetPaymentInstructions({ query: { queryKey: getGetPaymentInstructionsQueryKey() } });
  const membership = useGetMembership({ query: { queryKey: getGetMembershipQueryKey(), enabled: Boolean(isSignedIn) } });
  const requests = useGetMyPaymentRequests({ query: { queryKey: getGetMyPaymentRequestsQueryKey(), enabled: Boolean(isSignedIn) } });
  const createRequest = useCreatePaymentRequest();
  const price = instructions.data?.monthlyPrice ?? membership.data?.monthlyPrice ?? 1000;
  const currency = instructions.data?.currency ?? membership.data?.currency ?? 'XAF';
  async function copyNumber() {
    if (!instructions.data?.walletNumber) return;
    try { await navigator.clipboard.writeText(instructions.data.walletNumber); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copie impossible sur cet appareil. Sélectionnez le numéro manuellement.'); }
  }
  function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (reference.trim().length < 4 || reference.trim().length > 120) { setError('La référence doit contenir entre 4 et 120 caractères.'); return; }
    createRequest.mutate({ data: { operator, transactionReference: reference.trim() } }, {
      onSuccess: () => { setReference(''); setNotice('Référence envoyée. Votre paiement sera vérifié manuellement.'); qc.invalidateQueries({ queryKey: getGetMyPaymentRequestsQueryKey() }); },
      onError: () => setError('Envoi impossible. Vérifiez votre connexion et réessayez.'),
    });
  }
  return <PageFrame notice={notice} clearNotice={() => setNotice('')}>
    <main className="page-shell py-10 sm:py-14">
      <div className="mb-8 max-w-2xl"><p className="eyebrow">Espace membre</p><h1 className="display-font mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Votre accès VIP,<br /><span className="text-[hsl(var(--primary))]">sans surprise.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">Un abonnement mensuel à prix fixe. Vous envoyez votre référence Mobile Money, puis un administrateur vérifie le paiement avant activation.</p></div>
      {!isLoaded ? <div className="surface mx-auto max-w-xl space-y-4 p-7"><div className="skeleton mx-auto h-8 w-40" /><div className="skeleton h-16 w-full" /><div className="skeleton h-12 w-full" /></div> : !isSignedIn ? <LoginWall /> : <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <section className="space-y-4">
          <div className="surface p-6">
            <div className="flex items-start justify-between"><div><p className="eyebrow">Abonnement</p><h2 className="display-font mt-2 text-2xl font-bold">VIP mensuel</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${membership.data?.active ? 'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{membership.isLoading ? 'Vérification…' : membershipStatusLabel(membership.data?.status)}</span></div>
            <div className="mt-6 flex items-baseline gap-2"><strong className="display-font text-4xl font-bold">{price.toLocaleString('fr-FR')}</strong><span className="font-bold">{currency}</span><span className="text-sm text-[hsl(var(--muted-foreground))]">/ mois</span></div>
            {membership.data?.expiresAt && <div className="mt-3 space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
              {membership.data.startsAt && <p>Activé le {formatDate(membership.data.startsAt)}.</p>}
              <p>{membership.data.active ? 'Valable jusqu’au' : 'Expiration le'} {formatDate(membership.data.expiresAt)}.</p>
              {membership.data.status === 'suspended' && <p className="font-semibold text-[hsl(var(--destructive))]">L’accès VIP est suspendu par l’administration.</p>}
            </div>}
            {membership.isError && <p className="mt-3 text-xs text-[hsl(var(--destructive))]">Le statut de votre abonnement n’a pas pu être chargé. <button onClick={() => membership.refetch()} className="underline">Réessayer</button></p>}
            <div className="mt-6 space-y-3 border-t border-[hsl(var(--border))] pt-5 text-sm"><p className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Accès aux sélections VIP déverrouillées</p><p className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Résultats suivis comme les picks gratuits</p><p className="flex items-center gap-2"><Check size={16} className="text-[hsl(var(--primary))]" /> Aucun prélèvement automatique</p></div>
          </div>
          <div className="rounded-[18px] border border-[hsl(var(--accent)/.55)] bg-[hsl(var(--accent)/.17)] p-5 text-sm leading-6"><div className="flex items-center gap-2 font-bold"><CircleAlert size={17} /> À savoir</div><p className="mt-2 text-[hsl(var(--foreground)/.8)]">Envoyer une référence ne déclenche aucun paiement automatique. L’accès est activé uniquement après contrôle manuel du transfert.</p></div>
        </section>
        <section className="surface p-6 sm:p-7">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Activity size={18} /></span><div><p className="eyebrow">Paiement manuel</p><h2 className="display-font text-xl font-bold">Suivez ces étapes</h2></div></div>
          {instructions.isLoading ? <div className="mt-6 space-y-3"><div className="skeleton h-12 w-full" /><div className="skeleton h-24 w-full" /></div>
            : instructions.isError ? <div className="mt-5"><ErrorLine message="Les coordonnées de paiement ne sont pas disponibles." retry={() => instructions.refetch()} /></div>
              : !instructions.data?.configured ? <div className="mt-6 rounded-xl bg-[hsl(var(--muted))] p-5 text-sm leading-6"><p className="font-semibold">Les paiements ne sont pas encore configurés.</p><p className="mt-1 text-[hsl(var(--muted-foreground))]">Les coordonnées seront affichées ici dès qu’elles seront disponibles. Aucun transfert ne doit être envoyé pour le moment.</p></div>
                : <>
                  <ol className="mt-6 space-y-5">
                    <li className="flex gap-3"><span className="display-font grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-white">1</span><div className="flex-1"><p className="text-sm font-semibold">Envoyez le montant exact</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Transférez {price.toLocaleString('fr-FR')} {currency} via {instructions.data.operator === 'MTN' ? 'MTN Mobile Money' : instructions.data.operator === 'ORANGE' ? 'Orange Money' : 'l’opérateur indiqué'}.</p></div></li>
                    <li className="flex gap-3"><span className="display-font grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-white">2</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Vérifiez le bénéficiaire</p><div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[hsl(var(--muted))] p-3"><div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Numéro Mobile Money</p><p className="mt-1 truncate font-bold">{instructions.data.walletNumber}</p><p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{instructions.data.walletName}</p></div><button type="button" className="btn-quiet shrink-0 px-3 py-2 text-xs" onClick={copyNumber} aria-label="Copier le numéro" data-testid="button-copy-wallet">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copié' : 'Copier'}</button></div></div></li>
                    <li className="flex gap-3"><span className="display-font grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-white">3</span><div><p className="text-sm font-semibold">Gardez la référence de transaction</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{instructions.data.instructions}</p></div></li>
                  </ol>
                  <form onSubmit={submit} className="mt-7 border-t border-[hsl(var(--border))] pt-6">
                    <label htmlFor="operator" className="mb-2 block text-xs font-bold">Opérateur utilisé</label><select className="input-field" id="operator" value={operator} onChange={(e) => setOperator(e.target.value as 'MTN' | 'ORANGE')} data-testid="select-operator"><option value="MTN">MTN Mobile Money</option><option value="ORANGE">Orange Money</option></select>
                    <label htmlFor="reference" className="mb-2 mt-4 block text-xs font-bold">Référence de transaction</label><input className="input-field" id="reference" value={reference} onChange={(e) => setReference(e.target.value)} minLength={4} maxLength={120} required placeholder="Ex. numéro de transaction reçu" data-testid="input-transaction-reference" />
                    {error && <p role="alert" className="mt-3 text-xs text-[hsl(var(--destructive))]">{error}</p>}
                    <button className="btn-primary mt-4 w-full" type="submit" disabled={createRequest.isPending} data-testid="button-submit-payment">{createRequest.isPending ? 'Envoi en cours…' : 'Soumettre pour vérification'} <ArrowRight size={16} /></button>
                    <p className="mt-3 text-center text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Ne partagez jamais votre code secret Mobile Money. Nous ne vous demanderons que la référence du transfert.</p>
                  </form>
                </>}
        </section>
        <section className="surface p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Suivi personnel</p><h2 className="display-font mt-1 text-xl font-bold">Vos demandes</h2></div><button className="btn-quiet text-xs" onClick={() => requests.refetch()} data-testid="button-refresh-requests">Actualiser <ChevronDown size={14} /></button></div>
          {requests.isLoading ? <div className="mt-5 space-y-2"><div className="skeleton h-12 w-full" /><div className="skeleton h-12 w-full" /></div>
            : requests.isError ? <div className="mt-4"><ErrorLine message="Impossible de charger vos demandes." retry={() => requests.refetch()} /></div>
              : !requests.data?.length ? <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">Aucune demande pour l’instant. Après soumission, son état apparaîtra ici.</p>
                : <div className="mt-4 divide-y divide-[hsl(var(--border))]">{requests.data.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-4" data-testid={`payment-request-${request.id}`}><div><p className="text-sm font-semibold">{request.operator === 'MTN' ? 'MTN Mobile Money' : 'Orange Money'} · réf. {request.transactionReference}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.createdAt))} · {request.amount.toLocaleString('fr-FR')} {request.currency}</p>{request.adminNote && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Note : {request.adminNote}</p>}</div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${request.status === 'approved' ? 'bg-[hsl(var(--primary)/.11)] text-[hsl(var(--primary))]' : request.status === 'rejected' ? 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]' : 'bg-[hsl(var(--accent)/.25)]'}`}>{request.status === 'approved' ? 'Approuvée' : request.status === 'rejected' ? 'Refusée' : 'À vérifier'}</span></div>)}</div>}
        </section>
      </div>}
    </main>
  </PageFrame>;
}

type PickForm = { homeTeam: string; awayTeam: string; league: string; kickoffAt: string; tier: 'free' | 'vip'; market: string; selection: string; odds: string; confidence: string; analysis: string };
const blankPick: PickForm = { homeTeam: '', awayTeam: '', league: '', kickoffAt: '', tier: 'free', market: '', selection: '', odds: '', confidence: '', analysis: '' };
function AdminPage() {
  const { isSignedIn, isLoaded } = useAppAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'predictions' | 'payments' | 'memberships' | 'settings'>('predictions');
  const [form, setForm] = useState<PickForm>(blankPick);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [payFilter, setPayFilter] = useState<'pending' | 'all'>('pending');
  const [adminNote, setAdminNote] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const summary = useGetAdminSummary({ query: { queryKey: getGetAdminSummaryQueryKey(), enabled: Boolean(isSignedIn) } });
  const predictions = useGetAdminPredictions({ query: { queryKey: getGetAdminPredictionsQueryKey(), enabled: Boolean(isSignedIn && summary.data) } });
  const paymentParams = useMemo(() => payFilter === 'pending' ? { status: 'pending' as const } : {}, [payFilter]);
  const payments = useGetAdminPaymentRequests(paymentParams, { query: { queryKey: getGetAdminPaymentRequestsQueryKey(paymentParams), enabled: Boolean(isSignedIn && summary.data) } });
  const memberships = useGetAdminMemberships({ query: { queryKey: getGetAdminMembershipsQueryKey(), enabled: Boolean(isSignedIn && summary.data) } });
  const instructions = useGetPaymentInstructions({ query: { queryKey: getGetPaymentInstructionsQueryKey(), enabled: Boolean(isSignedIn && summary.data) } });
  const createPick = useCreatePrediction();
  const updatePick = useUpdatePrediction();
  const review = useReviewPaymentRequest();
  const manageMembership = useManageAdminMembership();
  const updateInstructions = useUpdatePaymentInstructions();
  const [settings, setSettings] = useState({ operator: 'MTN' as 'MTN' | 'ORANGE', walletNumber: '', walletName: '', instructions: '' });
  const [membershipMonths, setMembershipMonths] = useState(1);
  useEffect(() => {
    if (instructions.data) setSettings({ operator: instructions.data.operator || 'MTN', walletNumber: instructions.data.walletNumber || '', walletName: instructions.data.walletName || '', instructions: instructions.data.instructions || '' });
  }, [instructions.data]);
  function invalidation() {
    qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminPredictionsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPredictionsQueryKey({}) });
    qc.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
  }
  function startEdit(pick: Prediction) {
    setEditing(pick.id);
    const date = new Date(pick.kickoffAt);
    setForm({ homeTeam: pick.homeTeam, awayTeam: pick.awayTeam, league: pick.league, kickoffAt: new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16), tier: pick.tier, market: pick.market || '', selection: pick.selection || '', odds: pick.odds?.toString() || '', confidence: pick.confidence?.toString() || '', analysis: pick.analysis || '' });
    setShowForm(true);
  }
  function savePick(e: FormEvent) {
    e.preventDefault(); setError('');
    const data: PredictionInput = { homeTeam: form.homeTeam.trim(), awayTeam: form.awayTeam.trim(), league: form.league.trim(), kickoffAt: new Date(form.kickoffAt).toISOString(), tier: form.tier, market: form.market.trim(), selection: form.selection.trim(), odds: form.odds ? Number(form.odds) : null, confidence: form.confidence ? Number(form.confidence) : null, analysis: form.analysis.trim() || null };
    if (!Number.isFinite(new Date(data.kickoffAt).getTime())) { setError('Date de match invalide.'); return; }
    const done = () => { setShowForm(false); setEditing(null); setForm(blankPick); setNotice('Pronostic enregistré.'); invalidation(); };
    if (editing !== null) {
      const patch: PredictionUpdate = data;
      updatePick.mutate({ id: editing, data: patch }, { onSuccess: done, onError: () => setError('Enregistrement impossible. Vérifiez les champs puis réessayez.') });
    } else createPick.mutate({ data }, { onSuccess: done, onError: () => setError('Publication impossible. Vérifiez les champs puis réessayez.') });
  }
  function settle(id: number, status: 'won' | 'lost' | 'void') {
    updatePick.mutate({ id, data: { status } }, { onSuccess: () => { setNotice(`Résultat publié : ${resultLabel(status).toLowerCase()}.`); invalidation(); }, onError: () => setError('Le résultat n’a pas pu être publié.') });
  }
  function decidePayment(id: number, status: 'approved' | 'rejected') {
    review.mutate({ id, data: { status, adminNote: adminNote[id]?.trim() || null } }, {
      onSuccess: () => { setNotice(status === 'approved' ? 'Paiement approuvé et accès mis à jour.' : 'Demande refusée.'); qc.invalidateQueries({ queryKey: getGetAdminPaymentRequestsQueryKey(paymentParams) }); qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }); },
      onError: () => setError('La demande n’a pas pu être traitée.'),
    });
  }
  function changeMembership(userId: string, action: 'extend' | 'suspend' | 'resume') {
    manageMembership.mutate(
      { userId, data: action === 'extend' ? { action, months: membershipMonths } : { action } },
      {
        onSuccess: () => {
          setNotice(action === 'extend' ? 'Abonnement prolongé.' : action === 'suspend' ? 'Abonnement suspendu.' : 'Suspension levée.');
          qc.invalidateQueries({ queryKey: getGetAdminMembershipsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetPredictionsQueryKey({}) });
          qc.invalidateQueries({ queryKey: getGetMembershipQueryKey() });
        },
        onError: () => setError('La modification de l’abonnement a échoué.'),
      },
    );
  }
  function saveInstructions(e: FormEvent) {
    e.preventDefault(); updateInstructions.mutate({ data: settings }, {
      onSuccess: () => { setNotice('Coordonnées de paiement mises à jour.'); qc.invalidateQueries({ queryKey: getGetPaymentInstructionsQueryKey() }); },
      onError: () => setError('La configuration n’a pas pu être enregistrée.'),
    });
  }
  if (!isLoaded) return <PageFrame><main className="page-shell py-16"><div className="skeleton mx-auto h-52 max-w-3xl" /></main></PageFrame>;
  if (!isSignedIn) return <PageFrame><main className="page-shell py-16"><LoginWall title="Administration protégée" redirectTo="/admin" /></main></PageFrame>;
  if (summary.isLoading) return <PageFrame><main className="page-shell py-14"><p className="eyebrow">Espace privé</p><div className="skeleton mt-4 h-44 max-w-3xl" /></main></PageFrame>;
  if (summary.isError || !summary.data) return <PageFrame><main className="page-shell py-16"><div className="mx-auto max-w-xl"><div className="surface p-7 text-center"><ShieldCheck size={25} className="mx-auto text-[hsl(var(--muted-foreground))]" /><h1 className="display-font mt-3 text-xl font-bold">Accès administrateur indisponible</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{summary.isError ? 'Votre session ne dispose pas des droits d’administration, ou le service est temporairement indisponible.' : 'Vérification des droits en cours.'}</p><button className="btn-quiet mt-5" onClick={() => summary.refetch()} data-testid="button-admin-retry">Réessayer</button></div></div></main></PageFrame>;
  const busy = createPick.isPending || updatePick.isPending;
  return <PageFrame notice={notice || (error ? '' : undefined)} clearNotice={() => setNotice('')}>
    <main className="page-shell py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Espace privé · Administration</p><h1 className="display-font mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Tableau de bord</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Publiez proprement. Réglez chaque résultat.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/.1)] px-3 py-2 text-xs font-bold text-[hsl(var(--primary))]"><ShieldCheck size={15} /> Accès vérifié par le serveur</span></div>
      {error && <div className="mt-5 flex items-center justify-between rounded-xl bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]" role="alert">{error}<button aria-label="Fermer" onClick={() => setError('')}><X size={16} /></button></div>}
      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[['Pronostics publiés', summary.data.totalPredictions, Trophy], ['Aujourd’hui', summary.data.todayPredictions, CalendarDays], ['Membres actifs', summary.data.activeMembers, Award], ['Paiements en attente', summary.data.pendingPayments, Clock3], ['Réussite suivie', `${summary.data.hitRate}%`, Activity]].map(([title, value, Icon]) => {
          const MetricIcon = Icon as typeof Trophy;
          return <div className="surface p-4" key={String(title)}><MetricIcon size={17} className="text-[hsl(var(--primary))]" /><p className="display-font mt-3 text-2xl font-bold">{value as ReactNode}</p><p className="mt-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{title as string}</p></div>;
        })}
      </div>
      <div className="mt-8 flex gap-2 overflow-x-auto border-b border-[hsl(var(--border))] pb-2">
        {([['predictions', 'Pronostics'], ['payments', 'Paiements'], ['memberships', 'Abonnements VIP'], ['settings', 'Paiement mobile']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${tab === key ? 'bg-[hsl(var(--primary))] text-white' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} data-testid={`tab-${key}`}>{label}</button>)}
      </div>
      {tab === 'predictions' && <section className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="eyebrow">Édition du contenu</p><h2 className="display-font text-xl font-bold">Pronostics</h2></div><button className="btn-primary" onClick={() => { setEditing(null); setForm(blankPick); setShowForm(!showForm); }} data-testid="button-new-prediction">{showForm ? <X size={16} /> : <Sparkles size={16} />}{showForm ? 'Fermer' : 'Nouveau pronostic'}</button></div>
        {showForm && <form className="surface mb-5 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={savePick}>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="home">Équipe à domicile</label><input className="input-field" id="home" required value={form.homeTeam} onChange={(e) => setForm({ ...form, homeTeam: e.target.value })} data-testid="input-home-team" /></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="away">Équipe visiteuse</label><input className="input-field" id="away" required value={form.awayTeam} onChange={(e) => setForm({ ...form, awayTeam: e.target.value })} data-testid="input-away-team" /></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="league">Compétition</label><input className="input-field" id="league" required value={form.league} onChange={(e) => setForm({ ...form, league: e.target.value })} data-testid="input-league" /></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="kickoff">Coup d’envoi</label><input className="input-field" type="datetime-local" id="kickoff" required value={form.kickoffAt} onChange={(e) => setForm({ ...form, kickoffAt: e.target.value })} data-testid="input-kickoff" /></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="tier">Accès</label><select className="input-field" id="tier" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as 'free' | 'vip' })} data-testid="select-tier"><option value="free">Gratuit</option><option value="vip">VIP</option></select></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="market">Marché</label><input className="input-field" id="market" required value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} placeholder="Ex. Résultat final" data-testid="input-market" /></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="selection">Sélection</label><input className="input-field" id="selection" required value={form.selection} onChange={(e) => setForm({ ...form, selection: e.target.value })} data-testid="input-selection" /></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="odds">Cote décimale</label><input className="input-field" type="number" min="1" step="0.01" id="odds" value={form.odds} onChange={(e) => setForm({ ...form, odds: e.target.value })} data-testid="input-odds" /></div>
          <div><label className="mb-1.5 block text-xs font-bold" htmlFor="confidence">Confiance (%)</label><input className="input-field" type="number" min="1" max="100" id="confidence" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} data-testid="input-confidence" /></div>
          <div className="sm:col-span-2 lg:col-span-3"><label className="mb-1.5 block text-xs font-bold" htmlFor="analysis">Analyse (facultative)</label><textarea className="input-field min-h-[90px] resize-y" id="analysis" value={form.analysis} onChange={(e) => setForm({ ...form, analysis: e.target.value })} data-testid="input-analysis" /></div>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3"><button disabled={busy} className="btn-primary" type="submit" data-testid="button-save-prediction">{busy ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Publier le pronostic'} <ArrowRight size={15} /></button><button type="button" className="btn-quiet" onClick={() => setShowForm(false)}>Annuler</button></div>
        </form>}
        {predictions.isLoading ? <div className="space-y-3"><PredictionSkeleton /><PredictionSkeleton /></div>
          : predictions.isError ? <ErrorLine message="Les pronostics administratifs ne sont pas accessibles." retry={() => predictions.refetch()} />
            : !predictions.data?.length ? <div className="surface p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Aucun pronostic créé. Utilisez le formulaire pour publier le premier.</div>
              : <div className="space-y-3">{predictions.data.map((pick) => <div className="surface flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center" key={pick.id} data-testid={`admin-pick-${pick.id}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">{pick.tier === 'vip' ? 'VIP' : 'Gratuit'}</span><span className="text-xs text-[hsl(var(--muted-foreground))]">{pick.league}</span><span className="rounded-full bg-[hsl(var(--muted))] px-2 py-1 text-[10px] font-bold">{resultLabel(pick.status)}</span></div><p className="mt-2 truncate font-bold">{pick.homeTeam} <span className="font-normal text-[hsl(var(--muted-foreground))">contre</span> {pick.awayTeam}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{formatKickoff(pick.kickoffAt)} · {pick.market} : {pick.selection} · cote {pick.odds ?? '—'}</p></div><div className="flex flex-wrap gap-2"><button className="btn-quiet text-xs" onClick={() => startEdit(pick)} data-testid={`button-edit-pick-${pick.id}`}>Modifier</button>{pick.status === 'upcoming' && <><button className="btn-quiet text-xs" disabled={updatePick.isPending} onClick={() => settle(pick.id, 'won')} data-testid={`button-won-${pick.id}`}><Check size={14} /> Gagné</button><button className="btn-quiet text-xs" disabled={updatePick.isPending} onClick={() => settle(pick.id, 'lost')} data-testid={`button-lost-${pick.id}`}>Perdu</button><button className="btn-quiet text-xs" disabled={updatePick.isPending} onClick={() => settle(pick.id, 'void')} data-testid={`button-void-${pick.id}`}>Annulé</button></>}</div></div>)}</div>}
      </section>}
      {tab === 'payments' && <section className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Contrôle manuel</p><h2 className="display-font text-xl font-bold">Demandes de paiement</h2></div><select className="input-field w-auto" value={payFilter} onChange={(e) => setPayFilter(e.target.value as 'pending' | 'all')} aria-label="Filtrer les demandes" data-testid="select-payment-filter"><option value="pending">En attente</option><option value="all">Toutes les demandes</option></select></div>
        {payments.isLoading ? <div className="surface p-8"><div className="skeleton h-10 w-full" /></div>
          : payments.isError ? <ErrorLine message="Les demandes ne sont pas accessibles." retry={() => payments.refetch()} />
            : !payments.data?.length ? <div className="surface p-8 text-center"><CheckCircle2 size={24} className="mx-auto text-[hsl(var(--primary))]" /><p className="mt-3 font-semibold">Aucune demande à traiter</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Les transferts en attente de vérification apparaîtront ici.</p></div>
              : <div className="space-y-3">{payments.data.map((request) => <div className="surface p-5" key={request.id} data-testid={`admin-payment-${request.id}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-1 text-[10px] font-bold">{request.operator === 'MTN' ? 'MTN MoMo' : 'Orange Money'}</span><span className="text-xs text-[hsl(var(--muted-foreground))]">{request.status === 'pending' ? 'À vérifier' : request.status === 'approved' ? 'Approuvée' : 'Refusée'}</span></div><p className="mt-3 text-sm font-bold">Référence : {request.transactionReference}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Compte {request.userId} · {request.amount.toLocaleString('fr-FR')} {request.currency} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.createdAt))}</p>{request.reviewedAt && <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Vérifié le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.reviewedAt))}</p>}</div></div>
                {request.status === 'pending' ? <div className="mt-4 flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-4 sm:flex-row"><input className="input-field flex-1" maxLength={500} placeholder="Note facultative pour le membre" value={adminNote[request.id] || ''} onChange={(e) => setAdminNote({ ...adminNote, [request.id]: e.target.value })} aria-label="Note administrateur" data-testid={`input-payment-note-${request.id}`} /><button className="btn-primary" disabled={review.isPending} onClick={() => decidePayment(request.id, 'approved')} data-testid={`button-approve-${request.id}`}><Check size={15} /> Approuver</button><button className="btn-quiet" disabled={review.isPending} onClick={() => decidePayment(request.id, 'rejected')} data-testid={`button-reject-${request.id}`}>Refuser</button></div>
                  : request.adminNote && <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Note : {request.adminNote}</p>}
              </div>)}</div>}
      </section>}
      {tab === 'memberships' && <section className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">Contrôle d’accès</p><h2 className="display-font text-xl font-bold">Abonnements VIP</h2></div>
          <label className="text-xs font-semibold">Prolonger de
            <select className="input-field ml-2 inline-block w-auto" value={membershipMonths} onChange={(e) => setMembershipMonths(Number(e.target.value))} aria-label="Durée de prolongation">
              {[1, 2, 3, 6, 12].map((months) => <option key={months} value={months}>{months} mois</option>)}
            </select>
          </label>
        </div>
        {memberships.isLoading ? <div className="surface p-8"><div className="skeleton h-10 w-full" /></div>
          : memberships.isError ? <ErrorLine message="La liste des abonnements n’est pas accessible." retry={() => memberships.refetch()} />
            : !memberships.data?.length ? <div className="surface p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Aucun abonnement enregistré pour le moment.</div>
              : <div className="space-y-3">{memberships.data.map((membership) => <article className="surface flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center" key={membership.userId} data-testid={`admin-membership-${membership.userId}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${membership.status === 'active' ? 'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]' : membership.status === 'suspended' ? 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{membershipStatusLabel(membership.status)}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">Compte : {membership.userId}</span>
                  </div>
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{membership.startsAt ? `Début : ${formatDate(membership.startsAt)}` : 'Début non défini'} · {membership.expiresAt ? `Expiration : ${formatDate(membership.expiresAt)}` : 'Expiration non définie'}</p>
                  {membership.status === 'suspended' && <p className="mt-1 text-xs font-semibold text-[hsl(var(--destructive))]">La prolongation ne réactive pas l’accès tant que la suspension n’est pas levée.</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button className="btn-primary text-xs" disabled={manageMembership.isPending} onClick={() => changeMembership(membership.userId, 'extend')} data-testid={`button-extend-${membership.userId}`}>Prolonger</button>
                  {membership.status === 'suspended'
                    ? <button className="btn-quiet text-xs" disabled={manageMembership.isPending} onClick={() => changeMembership(membership.userId, 'resume')} data-testid={`button-resume-${membership.userId}`}>Réactiver</button>
                    : <button className="btn-quiet text-xs" disabled={manageMembership.isPending} onClick={() => changeMembership(membership.userId, 'suspend')} data-testid={`button-suspend-${membership.userId}`}>Suspendre</button>}
                </div>
              </article>)}</div>}
      </section>}
      {tab === 'settings' && <section className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <div><p className="eyebrow">Instructions visibles aux membres</p><h2 className="display-font mt-1 text-2xl font-bold">Coordonnées Mobile Money</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Ces informations servent uniquement aux paiements manuels. Aucun transfert ou prélèvement n’est initié par Pronostics Foot.</p><div className="mt-5 rounded-xl bg-[hsl(var(--accent)/.2)] p-4 text-xs leading-5"><strong>Prix mensuel : {instructions.data?.monthlyPrice?.toLocaleString('fr-FR') ?? '1 000'} {instructions.data?.currency ?? 'XAF'}</strong><p className="mt-1">Le prix est fixé par la configuration de l’offre et n’est pas modifiable depuis cet écran.</p></div></div>
        <form className="surface space-y-4 p-5" onSubmit={saveInstructions}>
          <div><label htmlFor="operator-config" className="mb-1.5 block text-xs font-bold">Opérateur destinataire</label><select className="input-field" id="operator-config" value={settings.operator} onChange={(e) => setSettings({ ...settings, operator: e.target.value as 'MTN' | 'ORANGE' })} data-testid="select-config-operator"><option value="MTN">MTN Mobile Money</option><option value="ORANGE">Orange Money</option></select></div>
          <div><label htmlFor="wallet-number" className="mb-1.5 block text-xs font-bold">Numéro du portefeuille</label><input className="input-field" id="wallet-number" minLength={5} required value={settings.walletNumber} onChange={(e) => setSettings({ ...settings, walletNumber: e.target.value })} data-testid="input-wallet-number" /></div>
          <div><label htmlFor="wallet-name" className="mb-1.5 block text-xs font-bold">Nom du bénéficiaire</label><input className="input-field" id="wallet-name" required value={settings.walletName} onChange={(e) => setSettings({ ...settings, walletName: e.target.value })} data-testid="input-wallet-name" /></div>
          <div><label htmlFor="payment-instructions" className="mb-1.5 block text-xs font-bold">Instructions affichées aux membres</label><textarea className="input-field min-h-[110px] resize-y" id="payment-instructions" required value={settings.instructions} onChange={(e) => setSettings({ ...settings, instructions: e.target.value })} data-testid="input-payment-instructions" /></div>
          <button className="btn-primary" type="submit" disabled={updateInstructions.isPending} data-testid="button-save-instructions">{updateInstructions.isPending ? 'Enregistrement…' : 'Enregistrer les coordonnées'} <ArrowRight size={15} /></button>
        </form>
      </section>}
      <p className="mt-10 text-center text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Les pronostics restent des analyses incertaines. Vérifiez chaque transfert avant validation et communiquez clairement tout refus.</p>
    </main>
  </PageFrame>;
}

function AuthPage({ signup = false }: { signup?: boolean }) {
  const { error, isLoaded, signIn } = useAppAuth();
  const [authError, setAuthError] = useState('');
  const returnTo = new URLSearchParams(window.location.search).get('redirect') || '/';
  async function startAuth(method: 'email' | 'sms') {
    setAuthError('');
    try {
      await signIn(method, returnTo);
    } catch {
      setAuthError('La connexion n’a pas pu démarrer. Réessayez dans un instant.');
    }
  }
  return <div className="min-h-[100dvh] bg-[hsl(var(--background))]">
    <div className="page-shell flex min-h-[100dvh] flex-col justify-center py-8">
      <div className="mb-6 text-center"><Link href="/" className="inline-flex items-center gap-3" data-testid="link-auth-home"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[hsl(var(--primary))] text-white"><Trophy size={21} /></span><span className="display-font text-left text-sm font-bold">Pronostics Foot<span className="block font-sans text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Le football, sans détour</span></span></Link><p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">Votre passion du jeu, suivie avec transparence.</p></div>
      {auth0Configured
        ? <section className="surface mx-auto w-full max-w-[440px] space-y-3 p-6 sm:p-8">
            <h1 className="display-font text-center text-xl font-bold">{signup ? 'Créer votre compte' : 'Se connecter'}</h1>
            <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">Choisissez comment recevoir votre code de vérification.</p>
            {(error || authError) && <p role="alert" className="rounded-xl bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error || authError}</p>}
            <button className="btn-primary w-full justify-center" disabled={!isLoaded} onClick={() => void startAuth('email')} data-testid="button-auth-email">Continuer avec e-mail <ArrowRight size={16} /></button>
            <button className="btn-quiet w-full justify-center" disabled={!isLoaded} onClick={() => void startAuth('sms')} data-testid="button-auth-phone">Continuer avec téléphone <ArrowRight size={16} /></button>
            <p className="pt-2 text-center text-xs leading-5 text-[hsl(var(--muted-foreground))]">Un compte est créé après vérification du code reçu par e-mail ou SMS.</p>
          </section>
        : <div className="mx-auto w-full max-w-[440px] rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[var(--shadow-md)]">
            {signup ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
              : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />}
          </div>}
      <p className="mx-auto mt-5 max-w-md text-center text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Les pronostics ne garantissent aucun résultat. Jouez de manière responsable.</p>
    </div>
  </div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={Home} />
    <Route path="/sign-in/*?" component={() => <AuthPage />} />
    <Route path="/sign-up/*?" component={() => <AuthPage signup />} />
    <Route path="/vip" component={VipPage} />
    <Route path="/admin" component={AdminPage} />
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  const frenchLocalization = {
    ...frFR,
    signIn: {
      ...frFR.signIn,
      start: {
        ...frFR.signIn?.start,
        title: 'Ravi de vous revoir',
        subtitle: 'Connectez-vous à votre espace Pronostics Foot',
      },
    },
    signUp: {
      ...frFR.signUp,
      start: {
        ...frFR.signUp?.start,
        title: 'Rejoignez la communauté',
        subtitle: 'Créez votre compte Pronostics Foot',
      },
    },
  };
  return <ClerkProvider
    publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={frenchLocalization}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkAuthAdapter><ClerkCacheSync /><Router /></ClerkAuthAdapter>
  </ClerkProvider>;
}

function Auth0App() {
  return <Auth0AuthAdapter><Router /></Auth0AuthAdapter>;
}

function App() {
  if (!auth0Configured && !clerkPubKey) {
    return <div className="grid min-h-[100dvh] place-items-center p-6"><div className="surface max-w-lg p-8 text-center"><h1 className="display-font text-xl font-bold">Connexion momentanément indisponible</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">La configuration de l’espace membre n’est pas disponible.</p><a href={basePath || '/'} className="btn-primary mt-5">Retour aux pronostics</a></div></div>;
  }
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}>{auth0Configured ? <Auth0App /> : <ClerkApp />}</WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
