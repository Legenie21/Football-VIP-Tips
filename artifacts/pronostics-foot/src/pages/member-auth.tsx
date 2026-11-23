import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Redirect, useLocation, useSearch } from 'wouter';
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, Trophy } from 'lucide-react';
import { useLoginAccount, useRegisterAccount } from '@workspace/api-client-react';
import { apiErrorCode, apiErrorStatus, maestroActionRequest, useAppAuth } from '@/lib/auth-provider';
import { usePageMeta } from './page-meta';

type Mode = 'signin' | 'signup';
type Errors = Partial<Record<'email' | 'username' | 'password' | 'form', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

function safeRedirect(search: string) {
  const value = new URLSearchParams(search).get('redirect');
  return value && ['/', '/dashboard', '/vip', '/admin'].includes(value) ? value : '/dashboard';
}

function validate(mode: Mode, email: string, username: string, password: string): Errors {
  const e: Errors = {};
  if (!email.trim()) e.email = 'Indiquez votre adresse e-mail.';
  else if (email.trim().length > 254 || !EMAIL_RE.test(email.trim())) e.email = 'Adresse e-mail invalide.';
  if (mode === 'signup') {
    if (!username) e.username = 'Choisissez un nom d’utilisateur.';
    else if (!USERNAME_RE.test(username)) e.username = 'De 3 à 30 caractères : lettres sans accent, chiffres, point, tiret ou tiret bas.';
    if (password.length < 12) e.password = 'Au moins 12 caractères.';
    else if (password.length > 128) e.password = '128 caractères maximum.';
  } else if (!password) e.password = 'Indiquez votre mot de passe.';
  else if (password.length > 128) e.password = '128 caractères maximum.';
  return e;
}

function serverErrors(mode: Mode, error: unknown): Errors {
  const status = apiErrorStatus(error);
  const code = (apiErrorCode(error) ?? '').toLowerCase();
  if (status === 409) {
    if (code.includes('user')) return { username: 'Ce nom d’utilisateur est déjà pris.' };
    if (code.includes('mail')) return { email: 'Un compte existe déjà avec cette adresse. Connectez-vous plutôt.' };
    return { form: 'Cette adresse e-mail ou ce nom d’utilisateur est déjà utilisé.' };
  }
  if (status === 401) return { form: 'E-mail ou mot de passe incorrect.' };
  if (status === 400) return { form: mode === 'signup' ? 'Certaines informations ne sont pas acceptées. Vérifiez les champs puis réessayez.' : 'Les informations envoyées sont invalides.' };
  if (status === 403) return { form: 'Requête refusée par sécurité. Rechargez la page puis réessayez.' };
  if (status === 429) return { form: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' };
  if (status === 503) return { form: 'Le service des comptes est momentanément indisponible. Aucun compte n’a été ouvert ; réessayez plus tard.' };
  if (status === null) return { form: 'Impossible de joindre le serveur. Vérifiez votre connexion.' };
  return { form: 'Une erreur inattendue est survenue. Réessayez dans un instant.' };
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-xs font-bold">{label}</label>
    {children}
    {error ? <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-[hsl(var(--destructive))] arrive" data-testid={`error-${id}`}><CircleAlert size={13} className="mt-0.5 shrink-0" />{error}</p>
      : hint ? <p id={`${id}-hint`} className="mt-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
  </div>;
}

export function MemberAuthPage({ mode, notice }: { mode: Mode; notice: ReactNode }) {
  const signup = mode === 'signup';
  usePageMeta(
    signup ? 'Inscription · Maestro Tips VIP' : 'Connexion · Maestro Tips VIP',
    signup ? 'Créez votre compte Maestro Tips VIP avec un e-mail, un nom d’utilisateur et un mot de passe.' : 'Connectez-vous à votre espace membre Maestro Tips VIP avec votre e-mail et votre mot de passe.',
  );
  const auth = useAppAuth();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const target = safeRedirect(search);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const register = useRegisterAccount({ request: maestroActionRequest });
  const login = useLoginAccount({ request: maestroActionRequest });
  const pending = register.isPending || login.isPending || done;
  const formErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setErrors({}); setTouched(false); setPassword(''); }, [mode]);
  useEffect(() => { if (errors.form) formErrorRef.current?.focus(); }, [errors.form]);

  if (auth.isSignedIn && !done) return <Redirect to={target} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const local = validate(mode, email, username, password);
    setErrors(local);
    if (Object.keys(local).length) return;
    try {
      const result = signup
        ? await register.mutateAsync({ data: { email: email.trim(), username, password } })
        : await login.mutateAsync({ data: { email: email.trim(), password } });
      setDone(true);
      auth.completeAuthentication?.(result.user);
      setLocation(target);
    } catch (error) {
      setErrors(serverErrors(mode, error));
    }
  }
  const live = (next: Partial<{ email: string; username: string; password: string }>) => {
    if (!touched) return;
    const v = validate(mode, next.email ?? email, next.username ?? username, next.password ?? password);
    setErrors((prev) => ({ ...v, form: prev.form }));
  };
  const pwLen = password.length;

  return <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
    {notice}
    <div className="page-shell flex min-h-[calc(100dvh-44px)] flex-col justify-center py-10">
      <div className="mb-6 text-center"><Link href="/" className="inline-flex items-center gap-3" data-testid="link-auth-home"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Trophy size={21} /></span><span className="display-font text-left text-sm font-bold">Maestro Tips VIP<span className="block font-sans text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Le football, sans détour</span></span></Link></div>
      <section className="surface arrive mx-auto w-full max-w-[440px] p-6 sm:p-8" aria-labelledby="auth-title">
        <p className="eyebrow">{signup ? 'Nouveau membre' : 'Espace membre'}</p>
        <h1 id="auth-title" className="display-font mt-2 text-2xl font-bold tracking-tight">{signup ? 'Créer votre compte' : 'Ravi de vous revoir'}</h1>
        <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{signup ? 'Trois champs, aucun code à recevoir. Votre session s’ouvre dès la création.' : 'Connectez-vous avec votre e-mail et votre mot de passe.'}</p>

        <div className="mt-5 grid grid-cols-2 rounded-full bg-[hsl(var(--muted))] p-1 text-xs font-bold" role="tablist" aria-label="Choix du formulaire">
          <Link href={`/sign-in${search ? `?${search}` : ''}`} role="tab" aria-selected={!signup} className={`rounded-full py-2 text-center transition-colors ${!signup ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid="tab-sign-in">Connexion</Link>
          <Link href={`/sign-up${search ? `?${search}` : ''}`} role="tab" aria-selected={signup} className={`rounded-full py-2 text-center transition-colors ${signup ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid="tab-sign-up">Inscription</Link>
        </div>

        {auth.status === 'error' && <p className="mt-4 rounded-xl bg-[hsl(var(--accent)/.18)] p-3 text-xs leading-5" data-testid="status-session-check">La vérification de session a échoué ; vous pouvez tout de même essayer de vous connecter.</p>}

        <form onSubmit={submit} noValidate className="mt-6 space-y-4" aria-busy={pending}>
          {errors.form && <div ref={formErrorRef} tabIndex={-1} role="alert" className="arrive flex items-start gap-2 rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] p-3 text-sm outline-none" data-testid="error-form"><CircleAlert size={16} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" />{errors.form}</div>}
          <Field id="email" label="Adresse e-mail" error={errors.email}>
            <input id="email" type="email" inputMode="email" autoComplete={signup ? 'email' : 'username'} className="input-field" value={email} maxLength={254} disabled={pending}
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined}
              onChange={(e) => { setEmail(e.target.value); live({ email: e.target.value }); }} placeholder="vous@exemple.com" data-testid="input-email" />
          </Field>
          {signup && <Field id="username" label="Nom d’utilisateur" hint="3 à 30 caractères : lettres, chiffres, point, tiret, tiret bas." error={errors.username}>
            <input id="username" type="text" autoComplete="nickname" autoCapitalize="none" spellCheck={false} className="input-field" value={username} maxLength={30} disabled={pending}
              aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-error' : 'username-hint'}
              onChange={(e) => { setUsername(e.target.value); live({ username: e.target.value }); }} placeholder="lion_indomptable" data-testid="input-username" />
          </Field>}
          <Field id="password" label="Mot de passe" hint={signup ? `12 à 128 caractères · ${pwLen} saisi${pwLen > 1 ? 's' : ''}` : undefined} error={errors.password}>
            <div className="relative">
              <input id="password" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} className="input-field pr-12" value={password} maxLength={128} disabled={pending}
                aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : signup ? 'password-hint' : undefined}
                onChange={(e) => { setPassword(e.target.value); live({ password: e.target.value }); }} data-testid="input-password" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={show} data-testid="button-toggle-password">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {signup && <div className="mt-2 h-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]" aria-hidden="true"><div className="h-full origin-left rounded-full bg-[hsl(var(--primary))] transition-transform duration-300" style={{ transform: `scaleX(${Math.min(pwLen / 12, 1)})` }} /></div>}
          </Field>
          <button type="submit" className={`btn-primary w-full ${signup ? 'btn-signup' : ''}`} disabled={pending} data-testid="button-submit-auth">
            {pending ? <><LoaderCircle size={16} className="animate-spin" /> {signup ? 'Création du compte…' : 'Connexion…'}</> : <>{signup ? 'Inscription' : 'Se connecter'} <ArrowRight size={16} /></>}
          </button>
        </form>
        {!signup && <p className="mt-4 flex items-start gap-2 text-[11px] leading-4 text-[hsl(var(--muted-foreground))]" data-testid="text-forgot-unavailable"><LockKeyhole size={13} className="mt-px shrink-0" />Mot de passe oublié : la réinitialisation par e-mail n’est pas encore disponible.</p>}
        <p className="mt-5 border-t border-[hsl(var(--border))] pt-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
          {signup ? <>Déjà membre ? <Link href="/sign-in" className="font-bold text-[hsl(var(--primary))]" data-testid="link-to-sign-in">Se connecter</Link></> : <>Pas encore de compte ? <Link href="/sign-up" className="font-bold text-[hsl(var(--primary))]" data-testid="link-to-sign-up">Créer un compte</Link></>}
        </p>
      </section>
      <p className="mx-auto mt-5 max-w-md text-center text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Les pronostics ne garantissent aucun résultat. Jouez de manière responsable.</p>
    </div>
  </div>;
}
