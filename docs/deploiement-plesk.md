# Maestro Tips VIP : livraison précompilée pour Plesk Linux

## Ce que fait cette préparation

Le build est effectué ici ou dans GitHub Actions, **jamais dans Plesk**.
Le serveur et ses dépendances JavaScript sont regroupés dans `server.cjs`,
et le site React est compilé en fichiers statiques. Aucun `node_modules`,
TypeScript, pnpm, npm install ou Vite n'est nécessaire au démarrage dans Plesk.
Le contrôle du build refuse toute dépendance serveur externe non embarquée.

Les fichiers compilés sont conservés comme pièces jointes d'une livraison
GitHub (`plesk-ready`), pas dans l'historique du dépôt. Le workflow
`.github/workflows/plesk.yml` les produit après chaque push sur `main`,
après vérification TypeScript et tests de démarrage isolés.
Il ne déploie pas le site et ne contacte pas la base de données.
GitHub Actions doit être autorisé sur le dépôt ; son utilisation est soumise
aux quotas et conditions de votre compte GitHub.

**Aucune action supplémentaire Git n'est nécessaire dans Plesk.** Au démarrage,
`app.js` récupère automatiquement la livraison déjà compilée depuis GitHub,
vérifie sa somme SHA-256 et son adéquation avec les sources récupérées dans
Plesk, puis démarre le serveur. Aucun shell, processus enfant, build ou
gestionnaire de paquets n'est lancé par ce démarrage.

Le paquet est conservé dans `.plesk-releases/` et référencé automatiquement
par `plesk-current.json`. Ne pas créer ce fichier à la main. Les redémarrages
suivants de la même version utilisent le cache vérifié, sans réseau.
Si les sources ont changé, le paquet correspondant est de nouveau récupéré.
Si le build n'est pas terminé ou si les sources diffèrent, le démarrage
échoue explicitement sans remplacer le cache existant ni démarrer un ancien
serveur incompatible. Un cache altéré est également refusé.
Les livraisons précédentes sont conservées, sans nettoyage automatique.
Surveiller l'espace disque et supprimer les anciennes uniquement après
identification de celles qui ne sont plus utilisées.

## Configuration initiale dans Plesk

Les captures fournies montrent Node.js disponible, le mode
`production`, une racine d'application `/teamprono.com` et un démarrage `app.js`.
La version affichée est `26.13.1`. Le code cible Node.js **22 ou supérieur** ;
les vérifications locales et le workflow utilisent Node.js 24.
Privilégier Node.js 24 LTS si votre hébergeur le propose ; la version 26
affichée n'a pas été testée dans votre hébergement.

1. Dans **Git**, configurer le dépôt `Legenie21/Football-VIP-Tips`,
   branche `main`, et un déploiement **manuel** dans le dossier de
   l'application `/teamprono.com`. Ne pas choisir un répertoire contenant
   un autre site sans l'accord du propriétaire et sans protection adaptée
   chez l'hébergeur.
2. **Vider et désactiver les actions supplémentaires de déploiement Git.**
   Retirer l'ancienne commande d'installation si elle y figure encore.
   Ne pas ajouter `npm install`, `pnpm install` ni une commande de build.
   L'ancien problème de compte chroot bloque ces actions, mais elles ne sont
   plus utilisées par cette procédure. Cela ne répare pas le compte système
   lui-même ; si le runtime Node.js est également bloqué par l'hébergeur,
   celui-ci doit toujours intervenir.
3. Attendre la réussite du workflow GitHub **Build Plesk**, puis récupérer
   les modifications et cliquer **Deploy Now**. Cette étape copie les sources,
   elle n'exécute aucun installateur.
4. Dans **Node.js**, définir :

   | Paramètre | Valeur |
   |---|---|
   | Application Root | `/teamprono.com`, si c'est bien la destination Git |
   | Document Root | `/teamprono.com/public` |
   | Application Startup File | `app.js` |
   | Application Mode | `production` |
   | Node.js | 24 LTS recommandé, minimum 22 |

   Le dossier `public/` est volontairement presque vide dans le dépôt.
   Le serveur Node sert le véritable contenu statique depuis la livraison
   sélectionnée. Le dossier public ne doit **jamais** être la racine entière
   de l'application : elle contient le serveur et pourrait contenir des secrets.
5. Activer Node.js, puis **Restart App**. Passenger gère le port de service ;
   il n'est pas nécessaire de fixer `PORT` dans Plesk. Hors Passenger,
   `PORT` est accepté, sinon le serveur utilise 3000.
6. Vérifier `/`, `/vip`, `/sign-in` et `/api/healthz`. Une réponse
   `{"status":"ok"}` signifie que le serveur tourne, **pas** que la base ou
   l'authentification sont opérationnelles.

Le **processus Node.js de l'application** doit pouvoir écrire dans la racine de
l'application et accéder en HTTPS à `api.github.com`, `github.com` et aux
serveurs de téléchargement utilisés par GitHub. Le premier démarrage ou celui
d'une nouvelle version télécharge environ un mégaoctet, sans compilation.
L'accès HTTPS et les droits du runtime ne sont pas encore vérifiés sur votre
hébergement réel. Une erreur de téléchargement s'affiche dans les journaux
Node.js avec un message explicite, sans exposer les secrets.

### Dépôt privé

Le dépôt public ne nécessite pas de jeton. Pour un dépôt privé, l'accès Git
configuré dans Plesk ne donne pas nécessairement accès aux pièces jointes des
Releases. Le démarrage accepte `PLESK_GITHUB_TOKEN`, un jeton à permission
de lecture du contenu de ce seul dépôt. Le fournir **uniquement par un
mécanisme secret côté hébergeur**, jamais dans Git ou dans une commande
enregistrée en clair dans le panneau. Il doit être disponible dans les
variables du processus Node.js de l'application, pas dans les actions Git.
Aucun jeton de ce type n'est requis pour le dépôt public ni configuré ici.

## Mises à jour suivantes

1. Faire le push sur `main`.
2. Attendre le workflow **Build Plesk** terminé avec succès.
3. Dans Plesk : récupérer les changements, **Deploy Now**, puis **Restart App**.

Ne pas utiliser le déploiement automatique sur le webhook de push : il
pourrait s'exécuter avant la fin de la compilation GitHub. Si un redémarrage
arrive trop tôt, attendre la réussite du workflow puis redémarrer à nouveau.
En cas d'échec, lire les journaux **Node.js** ; aucune commande de secours
d'installation ou de build n'est nécessaire dans Plesk.

Le tag `plesk-ready` est un canal de livraison, pas une référence historique
immuable. La version véritable est enregistrée dans l'archive et dans
`plesk-current.json`. Les téléchargements sont vérifiés, et une discordance
de version n'active pas de build ancien sous de nouvelles sources.

## Construire et vérifier depuis l'environnement de développement

```sh
pnpm install --frozen-lockfile
pnpm run build:plesk
pnpm run test:plesk
```

Le build utilise `BASE_PATH=/`, ne fournit aucune variable `VITE_*` héritée et
refuse les fichiers `.env` locaux. Il ne lit pas les valeurs de secrets
pour les incorporer. Les plugins d'aperçu Replit ne sont pas activés en
production. Les sorties restent dans `generated-artifacts/plesk/`, ignoré
par Git et par la publication depuis l'environnement de développement.

Les tests valident notamment un premier démarrage sans cache ni installateur
avec des réponses GitHub simulées, le redémarrage hors réseau de la même
version, le refus d'un cache modifié et les erreurs HTTPS. Les tests utilisent
un dossier isolé sans `node_modules`, et ne déploient rien sur Plesk.
L'ancien utilitaire d'installation est conservé pour les vérifications
hors ligne ; il n'est ni appelé par `app.js` ni requis dans la procédure Plesk.

## Paramètres réels et limites fonctionnelles

- Aucun secret Replit n'est automatiquement copié dans Plesk. Les véritables
  paramètres SQL, secrets de session et paramètres Mailtrap doivent y être
  renseignés séparément, côté serveur, au moment du raccordement.
- `localhost` peut être correct **si** l'application et MySQL/MariaDB sont
  sur le même hôte. Ne pas le supposer avant confirmation de l'hébergeur.
- Le passage du code PostgreSQL d'origine à MySQL/MariaDB n'est pas réalisé
  par cette livraison. Aucun schéma n'est créé, aucun SQL n'est exécuté.
- L'authentification directe et les OTP restent à implémenter/raccorder.
  Mailtrap reste déconnecté à la demande du propriétaire.
- Les routes métier répondent encore intentionnellement **503** ; seule
  la vérification de vie du serveur est disponible. Les pages signalent
  que le service est en préparation.
- Aucun build, push GitHub, activation Node.js ou déploiement sur Plesk n'est
  effectué à distance par la création de ces fichiers.

## Commandes GitHub

La branche de travail et de déploiement demandée est **uniquement `main`**.
Ne pas créer une autre branche de déploiement, ne pas forcer le push et ne
supprimer aucune branche distante sans accord. Le contrôle d'ascendance
ci-dessous bloque l'envoi si l'historique GitHub n'a pas été intégré :

```sh
git status
git fetch origin
git add app.js scripts/plesk docs/deploiement-plesk.md replit.md
git commit -m "Start prebuilt Plesk application without deployment actions"
git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main
```

Documentation de référence :
[Héberger des applications Node.js dans Plesk](https://docs.plesk.com/fr-FR/obsidian/administrator-guide/g%C3%A9rer-des-sites-web/h%C3%A9berger-des-applications-nodejs.76652/).
