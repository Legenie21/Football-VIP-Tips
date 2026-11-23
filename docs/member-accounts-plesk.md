# Comptes membres — activation sur Plesk

## Parcours livré

- Inscription par e-mail, nom d’utilisateur et mot de passe, sans confirmation par e-mail.
- Le compte est actif immédiatement ; une session est ouverte et l’utilisateur accède à `/dashboard`.
- Connexion ultérieure par e-mail et mot de passe, puis déconnexion avec révocation de la session côté serveur.
- E-mails uniques après normalisation en minuscules, noms d’utilisateur uniques sans distinction de casse.
- Mot de passe : 12 à 128 caractères. Nom d’utilisateur : 3 à 30 lettres ASCII, chiffres, `.`, `_` ou `-`.
- Tous les nouveaux comptes ont le rôle `member`. Aucun compte n’est promu administrateur automatiquement.
- L’adresse reste **non vérifiée** : elle ne constitue pas une preuve de propriété.
- Le tableau de bord affiche le profil réel, sans statistiques ni abonnement VIP fictifs.

Mailtrap, la récupération du mot de passe et le raccordement des pronostics/abonnements ne font pas partie de cette activation.
Le site n’envoie aucun e-mail lors de l’inscription.

## 1. Créer les tables dans la vraie base MariaDB

Le propriétaire a confirmé MariaDB 11.4.14 et une base sans tables.
Dans Plesk → Bases de données → phpMyAdmin, sélectionner la base du site.
Ouvrir **SQL**, puis exécuter intégralement :

[`scripts/sql/001-member-accounts.sql`](../scripts/sql/001-member-accounts.sql)

Ce SQL ajoute seulement `maestro_users`, `maestro_sessions` et `maestro_auth_limits`.
Il ne supprime et ne remplace aucune donnée. Il peut être réexécuté sans effacer les comptes.
Ne jamais utiliser la base de production pour les tests automatisés.
L’application n’effectue aucune création de table automatique au démarrage.

## 2. Variables de l’application Node.js dans Plesk

Les secrets présents dans Replit ne sont pas automatiquement transférés vers Plesk.
Renseigner dans **Node.js → Environment** les vrais paramètres de cette base :

| Nom | Valeur à renseigner |
| --- | --- |
| `CYBRANCEE_DB_HOST` | Adresse SQL fournie pour l’application sur Plesk |
| `CYBRANCEE_DB_PORT` | Port SQL, `3306` d’après la capture phpMyAdmin |
| `CYBRANCEE_DB_NAME` | Nom de la base du site |
| `CYBRANCEE_DB_USER` | Utilisateur autorisé sur cette base |
| `CYBRANCEE_DB_PASSWORD` | Mot de passe SQL réel, uniquement dans le panneau sécurisé |
| `CYBRANCEE_DB_CLIENT` | `mysql` (compatible MariaDB), facultatif |
| `AUTH_PUBLIC_ORIGIN` | `https://teamprono.com` |

Si l’application Node.js et MariaDB résident sur le même serveur, confirmer avec Plesk/Cybrancee
que l’hôte de connexion de l’application est bien `localhost` ou `127.0.0.1`.
L’adresse `localhost` affichée dans phpMyAdmin désigne son serveur, pas une base joignable depuis Replit.

- Sur boucle locale uniquement : TLS est désactivé par défaut ; `CYBRANCEE_DB_TLS=false` peut l’expliciter.
- Sur un hôte distant : TLS vérifié est obligatoire. Fournir `CYBRANCEE_DB_CA` si un certificat d’autorité privé est requis.
- Ne jamais désactiver la validation du certificat et ne pas ouvrir l’accès public à MariaDB pour faire fonctionner l’aperçu Replit.
- Les paramètres SMTP et OTP ne sont pas requis. Le validateur historique `check:direct-auth-config` concerne la préparation de la messagerie, pas ce parcours.
- Les sessions utilisent des jetons opaques aléatoires ; seule leur empreinte est stockée. Elles n’ont pas besoin d’un secret de signature. Un `SESSION_SECRET` déjà configuré peut être conservé, mais n’est pas utilisé par ce mécanisme.
- Hors du domaine officiel, configurer `AUTH_PUBLIC_ORIGIN` avec l’origine HTTPS réelle. Ne pas ajouter de chemin.

Le SQL refuse explicitement les inscriptions si les identifiants, le réseau ou les tables sont indisponibles.
Il n’existe aucun stockage de substitution en mémoire ou dans le navigateur.

## 3. Livraison précompilée, uniquement sur main

Après le push sur `main`, attendre le succès de **Build Plesk**, puis dans Plesk :
**Pull Now → Deploy Now → Restart App**.

Conserver le point de démarrage `app.js` et les actions Git supplémentaires vides.
Aucun build, aucune installation npm/pnpm et aucun `scripts/plesk/install.cjs` ne sont requis dans Plesk.
Le paquet de production embarque le pilote MySQL et les dépendances JavaScript.
Ne pas remplacer manuellement `app.js` ou les fichiers de la livraison.

## 4. Vérifier après activation réelle

1. Ouvrir `/sign-up`, créer un compte de test distinct avec les trois champs.
2. Vérifier l’arrivée sur `/dashboard`, le nom d’utilisateur et l’e-mail.
3. Recharger le tableau de bord : la session doit être conservée.
4. Se déconnecter, puis vérifier que `/dashboard` exige une connexion.
5. Se reconnecter avec le même e-mail et le mot de passe.
6. Vérifier qu’un doublon et un mauvais mot de passe sont refusés.

`/api/healthz` vérifie uniquement le serveur. `/api/auth/session` renvoie un visiteur anonyme
sans lire MariaDB lorsqu’aucun cookie valide n’est présent. Ces deux réponses ne suffisent donc pas à valider le raccordement SQL.

## Protections et vérifications

- Scrypt avec sel propre à chaque mot de passe (`N=32768`, `r=8`, `p=3`).
- Cookies `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, durée maximale de sept jours.
- Sessions persistées en base, renouvelées à l’authentification et révoquées à la déconnexion.
- Origine vérifiée et en-tête non simple requis sur les formulaires pour empêcher les soumissions intersites.
- Requêtes SQL paramétrées, limites d’essais persistées, erreurs sans identifiants ou mots de passe.
- Aucune promotion administrateur par l’inscription.
- Tests applicatifs : `pnpm --filter @workspace/api-server run test:accounts`.
  Sans base de test, le test MariaDB est explicitement ignoré : les autres utilisent un double limité aux tests.
- GitHub exécute aussi ce test contre une MariaDB 11.4 éphémère et isolée avant de préparer la livraison.
  Cette base de CI ne remplace jamais Cybrancee et n’est pas livrée sur Plesk.
- Vérification du paquet autonome : `pnpm run build:plesk && pnpm run test:plesk`.
