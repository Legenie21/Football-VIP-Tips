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

L'exécution des actions Git dans Plesk est un environnement distinct du
runtime Node.js de l'application ; sa disponibilité doit être vérifiée
séparément, notamment pour les comptes exécutés en chroot.

**Why:** l'hébergement Cybrancee a accepté la copie Git mais refusé l'exécution
des actions supplémentaires parce que le compte système manquait dans le
fichier passwd du chroot. La disponibilité de Node.js dans le panneau ne
garantit donc pas celle de l'action d'installation.

**How to apply:** distinguer copie des sources, installation de la livraison
et démarrage HTTP. Si le chroot refuse le compte avant l'exécution de la
commande, demander une réparation à l'hébergeur plutôt que modifier le code,
les secrets ou les fichiers système depuis l'application.
