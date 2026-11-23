---
name: Cohérence des dépendances du workspace
description: Effet des dépendances optionnelles communes sur les installations filtrées pnpm.
---

Un ajout de dépendance modifiant les pairs optionnels d’un paquet partagé exige
une installation cohérente du workspace avant d’interpréter les erreurs TypeScript.

**Why:** l’ajout du pilote MySQL a changé le variant physique de l’ORM commun ;
l’installation filtrée avait laissé d’autres paquets liés à l’ancien variant.
Les erreurs de modules introuvables et de types implicitement quelconques ne
reflétaient pas un défaut dans le code métier.

**How to apply:** après un tel ajout, exécuter l’installation complète avec le
lockfile, puis reconstruire les déclarations. Ne pas masquer ces erreurs par
des annotations `any` ni réécrire les modules métier préservés.
