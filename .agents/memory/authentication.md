---
name: Authentification du site existant
description: Fournisseur réellement utilisé et modes de connexion demandés.
---

Le site existant utilisait Clerk configuré automatiquement par Replit, même si le dépôt contient aussi du code Auth0. Le propriétaire a explicitement autorisé son remplacement par des comptes gérés directement par le site.

**Why:** le propriétaire a confirmé « Oui, gérer les comptes directement » après explication du remplacement de Clerk.

**How to apply:** mettre en place la gestion directe des comptes pour satisfaire les exigences ci-dessous ; ne pas activer Auth0 à la place.

La connexion demandée est soit par e-mail et mot de passe, soit par numéro de téléphone précédé de l’indicatif du pays et mot de passe. L’e-mail doit être vérifié à l’inscription par un code OTP. Un OTP par e-mail est également nécessaire pour réinitialiser un mot de passe oublié. Aucun OTP n’est demandé à la connexion et aucune vérification SMS n’est demandée.

**Why:** exigence explicite du propriétaire, distincte d’une connexion par code SMS.

**How to apply:** vérifier l’e-mail avant d’activer le compte ; ne pas remplacer le mot de passe de connexion par un code à usage unique et ne pas imposer une vérification SMS.

L’inscription demandée recueille le nom, le prénom, l’e-mail, le numéro de téléphone et le mot de passe avant la connexion.

**Why:** exigence explicite du propriétaire.

**How to apply:** distinguer la collecte du téléphone comme information de profil de son utilisation comme identifiant de connexion.

Le propriétaire exige les deux modes de connexion et indique qu’il n’y a encore aucun compte existant.

**Why:** il a confirmé vouloir la connexion par e-mail ou téléphone avec mot de passe malgré la limite du Clerk géré par Replit.

**How to apply:** une configuration d’authentification différente est autorisée pour répondre à cette exigence ; vérifier à nouveau l’absence de comptes avant toute opération destructive.

Le propriétaire prévoit d’utiliser ultérieurement une base de données Cybrancee pour son site.

**Why:** choix d’hébergement futur indiqué explicitement par le propriétaire.

**How to apply:** ne pas supposer les paramètres de connexion et ne pas effectuer de migration vers Cybrancee avant sa demande.

Le propriétaire indique que son offre Cybrancee propose « MySQL ou MariaDB » et ne comprend pas de serveur SMTP.

**Why:** informations confirmées par le propriétaire concernant son offre.

**How to apply:** confirmer le moteur exact et sa version avant d'adapter le stockage ; prévoir une messagerie distincte pour les OTP, sans connecter de service payant sans autorisation.
