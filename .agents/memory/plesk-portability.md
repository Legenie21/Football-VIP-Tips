---
name: Portabilité des livraisons Plesk
description: Critère de validation des livraisons autonomes destinées à l'hébergement Plesk.
---

Valider une livraison Plesk dans un dossier isolé, sans les dépendances
installées dans l'environnement de développement, en vérifiant également
la distribution des fichiers publics.

**Why:** la compilation seule n'a pas révélé tous les problèmes de portabilité :
une dépendance optionnelle de journalisation et la protection des dossiers
cachés ont nécessité des corrections avant qu'une livraison indépendante
puisse servir les pages. Un démarrage du serveur seul n'aurait pas suffi.

**How to apply:** conserver cette vérification lors des évolutions du serveur,
en particulier après ajout d'un pilote SQL, d'une messagerie ou d'une
dépendance native ; ne pas supposer qu'un paquet compilé est autonome.
