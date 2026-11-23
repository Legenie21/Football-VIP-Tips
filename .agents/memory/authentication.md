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

Le propriétaire prévoit d’utiliser ultérieurement une base de données Cybrancee pour son site.

**Why:** choix d’hébergement futur indiqué explicitement par le propriétaire.

**How to apply:** ne pas supposer les paramètres de connexion et ne pas effectuer de migration vers Cybrancee avant sa demande.

Le propriétaire indique que son offre Cybrancee propose « MySQL ou MariaDB » et ne comprend pas de serveur SMTP.

**Why:** informations confirmées par le propriétaire concernant son offre.

**How to apply:** confirmer le moteur exact et sa version avant d'adapter le stockage ; prévoir une messagerie distincte pour les OTP, sans connecter de service payant sans autorisation.

Le propriétaire dispose de Mailtrap et souhaite le connecter plus tard.

**Why:** choix et report explicitement indiqués par le propriétaire.

**How to apply:** ne pas lancer le raccordement Mailtrap ni demander ses identifiants avant qu'il souhaite le connecter ; vérifier alors si son offre permet l'envoi réel plutôt que le seul test des e-mails.
