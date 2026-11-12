---
name: Authentification du site existant
description: Fournisseur réellement utilisé et modes de connexion demandés.
---

Le propriétaire confirme que son site existant utilise Clerk configuré automatiquement par Replit, même si le dépôt contient aussi du code Auth0.

**Why:** le propriétaire a identifié Clerk comme le service qui gère actuellement ses comptes.

**How to apply:** préserver les comptes existants ; ne pas activer Auth0 ou remplacer le fournisseur sans accord.

La connexion demandée est soit par e-mail et mot de passe, soit par numéro de téléphone précédé de l’indicatif du pays et mot de passe. Aucun OTP ne doit être demandé à l’inscription ou à la connexion. Un OTP est autorisé uniquement par e-mail pour réinitialiser un mot de passe oublié.

**Why:** exigence explicite du propriétaire, distincte d’une connexion par code SMS.

**How to apply:** ne pas remplacer le mot de passe demandé par un code à usage unique et ne pas imposer une vérification SMS initiale.

L’inscription demandée recueille le nom, le prénom, l’e-mail, le numéro de téléphone et le mot de passe avant la connexion.

**Why:** exigence explicite du propriétaire.

**How to apply:** distinguer la collecte du téléphone comme information de profil de son utilisation comme identifiant de connexion.

Le propriétaire exige les deux modes de connexion et indique qu’il n’y a encore aucun compte existant.

**Why:** il a confirmé vouloir la connexion par e-mail ou téléphone avec mot de passe malgré la limite du Clerk géré par Replit.

**How to apply:** une configuration d’authentification différente est autorisée pour répondre à cette exigence ; vérifier à nouveau l’absence de comptes avant toute opération destructive.
