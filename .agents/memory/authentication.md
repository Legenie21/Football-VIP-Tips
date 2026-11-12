---
name: Authentification du site existant
description: Fournisseur réellement utilisé et modes de connexion demandés.
---

Le propriétaire confirme que son site existant utilise Clerk, même si le dépôt contient aussi du code Auth0.

**Why:** le propriétaire a identifié Clerk comme le service qui gère actuellement ses comptes.

**How to apply:** préserver les comptes existants ; ne pas activer Auth0 ou remplacer le fournisseur sans accord.

La connexion demandée est soit par e-mail et mot de passe, soit par numéro de téléphone précédé de l’indicatif du pays et mot de passe.

**Why:** exigence explicite du propriétaire, distincte d’une connexion par code SMS.

**How to apply:** ne pas remplacer le mot de passe demandé par un code à usage unique.
