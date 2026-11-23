---
name: Authentification du site existant
description: Fournisseur réellement utilisé et modes de connexion demandés.
---

Le site existant utilisait Clerk configuré automatiquement par Replit, même si le dépôt contient aussi du code Auth0. Le propriétaire a explicitement autorisé son remplacement par des comptes gérés directement par le site.

**Why:** le propriétaire a confirmé « Oui, gérer les comptes directement » après explication du remplacement de Clerk.

**How to apply:** mettre en place la gestion directe des comptes pour satisfaire les exigences ci-dessous ; ne pas activer Auth0 à la place.

Le parcours demandé maintenant est une inscription avec e-mail, nom d’utilisateur et mot de passe, sans e-mail de confirmation. Après inscription, l’utilisateur doit pouvoir se connecter et accéder à son tableau de bord. Aucun OTP n’est demandé à l’inscription ou à la connexion.

**Why:** le propriétaire a remplacé son exigence initiale de vérification OTP à l’inscription et la collecte du nom, du prénom et du téléphone par ce parcours simplifié.

**How to apply:** activer le compte sans messagerie ; ne pas réintroduire la vérification OTP à l’inscription. Ne pas considérer une adresse non vérifiée comme une preuve de propriété.

La récupération de mot de passe par OTP e-mail reste une exigence antérieure, distincte du nouveau parcours d’inscription. Mailtrap doit être raccordé plus tard.

**Why:** la nouvelle demande retire la confirmation à l’inscription, sans demander de modifier la récupération des mots de passe.

**How to apply:** ne pas bloquer l’inscription sur le SMTP ; ne pas simuler une récupération de mot de passe opérationnelle sans transport d’e-mails.

Le propriétaire avait indiqué qu’il n’y avait aucun compte existant lors de la préparation de l’authentification.

**Why:** information donnée par le propriétaire, qui peut avoir changé depuis.

**How to apply:** vérifier à nouveau l’absence de comptes avant toute opération destructive ; ne pas déduire que la base reste vide.

Le propriétaire utilise une base Cybrancee pour le site hébergé sur Plesk.

**Why:** choix d’hébergement confirmé par le propriétaire.

**How to apply:** utiliser les paramètres réels de cette base et ne pas substituer une base Replit ; ne pas confondre les secrets Replit avec les variables Node.js du serveur Plesk.

Le propriétaire a confirmé MariaDB 11.4.14 par une capture phpMyAdmin le 23 novembre 2026. Sa base était sans tables lors de cette vérification. Son offre n’inclut pas de SMTP.

**Why:** résultats de `SELECT VERSION()` et `SHOW TABLES` fournis par le propriétaire, après l’indication initiale « MySQL ou MariaDB ».

**How to apply:** cibler MariaDB, sans supposer que la base reste vide ; préserver les données et fournir le SQL à exécuter dans phpMyAdmin. Ne pas bloquer les comptes sans confirmation sur le SMTP.

Le propriétaire dispose de Mailtrap et souhaite le connecter plus tard.

**Why:** choix et report explicitement indiqués par le propriétaire.

**How to apply:** ne pas lancer le raccordement Mailtrap ni demander ses identifiants avant qu'il souhaite le connecter ; vérifier alors si son offre permet l'envoi réel plutôt que le seul test des e-mails.
