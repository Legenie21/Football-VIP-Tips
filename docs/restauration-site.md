# Restauration de Maestro Tips VIP

## Provenance et préservation

- Source : https://github.com/Legenie21/Football-VIP-Tips
- Branche source : `main`.
- Révision vérifiée le 13 novembre 2026 :
  `ec215f8c84e44bb289574033ca55c7929600ddbc`.
- Le code de l'application `artifacts/pronostics-foot`, les routes métier,
  les middlewares historiques, le contrat API et les schémas ont été importés.
- Les identifiants et paramètres de service propres au dépôt distant n'ont pas
  été recopiés. L'application possède son propre enregistrement local.
- Les fichiers locaux de préparation Cybrancee, tests, documentation et maquettes
  existantes ont été conservés.
- La branche locale `preserve-before-source-import` conserve l'état précédant
  l'importation. Elle sauvegarde le code, pas les données d'une base.
- Le dépôt `origin` et la référence `origin/main` sont maintenant présents.
  Aucun push n'a été effectué ; les changements locaux ne sont pas synchronisés
  vers GitHub et les historiques n'ont pas été fusionnés.

## État fonctionnel et limites volontaires

Les pages originales sont accessibles en aperçu : accueil, VIP, administration,
connexion et inscription. Leurs composants et leur présentation sont réutilisés,
avec le nom Maestro Tips VIP.

La création de compte, la connexion, les lectures/écritures métier et les e-mails
ne sont pas encore opérationnels. L'interface l'annonce explicitement. Elle ne
crée pas de faux utilisateurs, pronostics, paiements ou statistiques.

L'API `/api/healthz` reste opérationnelle. Les autres appels API reçoivent un
HTTP 503 avec `INFRASTRUCTURE_NOT_CONFIGURED`. Les modules métier importés
ne sont pas chargés : cela évite de les connecter automatiquement à la variable
`DATABASE_URL` de l'environnement, qui n'identifie pas nécessairement Cybrancee.
Les modules Clerk/Auth0 restent conservés sur disque mais sont inactifs.

## Dépendances

React et React DOM ont été alignés sur un correctif de la même branche 19.1 pour
résoudre les incompatibilités des anciens modules conservés. Express, Orval,
Vite et Drizzle n'ont pas subi de montée de version majeure.

Les dépendances transitives vulnérables ont reçu des contraintes compatibles
documentées dans le workspace. Zod passe à la version 4 corrigée : l'avis
GHSA-mrhx-c7xc-m3w5 ne propose pas de version 3 corrigée et les schémas de ce
projet utilisaient déjà l'entrée v4. Les résolveurs de formulaires ont été
alignés sur une version compatible. Il s'agit d'une correction de sécurité,
pas d'une modernisation générale des bibliothèques.

## Point d'arrêt avant Cybrancee

Le code source utilise PostgreSQL. Il faut confirmer le moteur et la version
réellement disponibles dans l'offre Cybrancee avant de choisir une adaptation.
Il faut aussi vérifier :

- l'accès SQL distant depuis le serveur applicatif, le port et les restrictions
  IP éventuelles ;
- les exigences TLS et le certificat d'autorité si nécessaire ;
- l'existence d'un SMTP, son port, son mode TLS et l'expéditeur autorisé ;
- les limites d'envoi et la configuration SPF/DKIM/DMARC ;
- si l'application reste hébergée sur Replit ou doit, ultérieurement, être
  hébergée chez Cybrancee, la disponibilité d'un hébergement Node.js adapté.

Ne jamais demander de mot de passe en conversation : utiliser exclusivement
les secrets du projet pour les véritables identifiants.

## Vérifications effectuées

- Contrat API régénéré à partir de la source importée.
- Vérification TypeScript du workspace réussie.
- Dix tests du validateur de configuration réussis.
- Audit des dépendances sans vulnérabilité signalée au moment du contrôle.
- Démarrage de l'API et du frontend ; contrôle HTTP du health check et des
  réponses d'indisponibilité explicites.

Ces vérifications ne valident pas encore les parcours complets d'inscription,
d'OTP, de connexion, de paiements et d'administration. Ils seront testés après
la configuration réelle et l'implémentation correspondante, avant toute mise
en service. Rien n'a été publié et aucun service payant n'a été connecté.
