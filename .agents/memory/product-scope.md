---
name: Périmètre Maestro Tips VIP
description: Contraintes du propriétaire concernant la restauration, Cybrancee et la mise en service.
---

L'objectif annoncé par le propriétaire est une véritable application « Maestro
Tips VIP » fonctionnelle, évolutive et sécurisée, adaptée aux ordinateurs,
Android, iPhone et tablettes.

**Why:** objectif explicite du propriétaire.

**How to apply:** conserver les composants et maquettes utiles ; privilégier une
application web responsive sans inventer une exigence d'application native.

La priorité actuelle demandée est de mettre d'abord le site en ligne sur
Plesk, puis de finaliser la base de données. Mailtrap viendra plus tard.
Cette priorité remplace l'ordre initial qui plaçait la mise en service après
le raccordement de tous les services. Si une étape nécessite des informations
ou une intervention du propriétaire, s'arrêter à cette étape et expliquer
précisément ce qui manque.

**Why:** le propriétaire exige un travail progressif et refuse les fausses
configurations ou l'utilisation d'un autre service par défaut.

**How to apply:** ne pas bloquer la mise en ligne ou le raccordement SQL sur
l'absence de SMTP. Laisser indisponibles les fonctions nécessitant l'envoi
d'e-mails sans contourner la vérification OTP. Ne pas remplacer Cybrancee par
une base Replit simplement parce qu'une variable de connexion est disponible ;
confirmer le moteur réel et les conditions de connexion depuis Plesk.

Ne supprimer aucun élément utile, ne connecter aucun service payant
supplémentaire et ne publier le site sans l'accord du propriétaire.

**Why:** limites explicites du propriétaire.

**How to apply:** préserver le code original et le travail local ; demander
l'autorisation avant toute dépense ou publication.

Le propriétaire souhaite désormais héberger le projet sur Plesk, et non sur
Replit Core. Il demande un projet déjà compilé : push vers GitHub, récupération
dans Plesk, puis « Deploy Now » et « Restart », sans nouveau build dans Plesk.

**Why:** nouvelle cible d'hébergement et procédure de livraison explicitement
demandées par le propriétaire.

**How to apply:** préparer une livraison précompilée compatible avec le runtime
réel de Plesk ; confirmer la disponibilité et la version de Node.js avant de
choisir le point de démarrage. Ne pas confondre ce conditionnement avec la
finalisation de l'authentification, de la base de données ou de la messagerie.
