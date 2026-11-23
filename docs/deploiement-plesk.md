# Maestro Tips VIP : livraison précompilée pour Plesk Linux

## Ce que fait cette préparation

Le build est effectué ici ou dans GitHub Actions, **jamais dans Plesk**.
Le serveur et ses dépendances JavaScript sont regroupés dans `server.cjs`,
et le site React est compilé en fichiers statiques. Aucun `node_modules`,
TypeScript, pnpm, npm install ou Vite n'est nécessaire au démarrage dans Plesk.
Le contrôle du build refuse toute dépendance serveur externe non embarquée.

Les fichiers compilés sont conservés comme pièces jointes d'une livraison
GitHub (`plesk-ready`), pas dans l'historique du dépôt. Le workflow
`.github/workflows/plesk.yml` les produit après chaque push sur `main` ou `plesk-prebuilt`,
après vérification TypeScript et tests de démarrage isolés.
Il ne déploie pas le site et ne contacte pas la base de données.
GitHub Actions doit être autorisé sur le dépôt ; son utilisation est soumise
aux quotas et conditions de votre compte GitHub.

L'action de déploiement Plesk télécharge cette livraison, vérifie sa somme
SHA-256 et son adéquation avec les sources récupérées dans Plesk, puis
change atomiquement la référence de version. Si le build n'est pas terminé
ou si les sources diffèrent, elle échoue sans remplacer la livraison active.
Les livraisons précédentes sont conservées, sans nettoyage automatique.
Surveiller l'espace disque et supprimer les anciennes uniquement après
identification de celles qui ne sont plus utilisées.

## Configuration initiale dans Plesk

La capture fournie montre Node.js disponible mais **Disabled**, le mode
`production`, une racine d'application `/teamprono.com` et un démarrage `app.js`.
La version affichée est `26.13.1`. Le code cible Node.js **22 ou supérieur** ;
les vérifications locales et le workflow utilisent Node.js 24.
Privilégier Node.js 24 LTS si votre hébergeur le propose ; la version 26
affichée n'a pas été testée dans votre hébergement.

1. Dans **Git**, configurer le dépôt `Legenie21/Football-VIP-Tips`,
   branche `plesk-prebuilt`, et un déploiement **manuel** dans le dossier de
   l'application `/teamprono.com`. Ne pas choisir un répertoire contenant
   un autre site sans l'accord du propriétaire et sans protection adaptée
   chez l'hébergeur.
2. Dans les actions supplémentaires de déploiement Git, ajouter :

   ```sh
   node scripts/plesk/install.cjs
   ```

   Cette commande doit s'exécuter dans la racine de déploiement. Si `node`
   n'est pas dans le PATH des actions Git, utiliser le chemin absolu du
   binaire correspondant à la version choisie dans Plesk. Sur de nombreuses
   installations Linux il est `/opt/plesk/node/24/bin/node` pour Node 24 :
   **faire confirmer le chemin par l'hébergeur**, ne pas l'inventer.
   Ne pas ajouter `npm install`, `pnpm install` ni une commande de build.
3. Attendre la réussite du workflow GitHub **Build Plesk**, puis récupérer
   les modifications et cliquer **Deploy Now**. Vérifier que l'action annonce
   « Livraison précompilée installée ».
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

L'hébergement doit autoriser les actions de déploiement et les sorties HTTPS
vers GitHub et ses serveurs de téléchargement. Ce n'est pas encore vérifié
sur votre compte Plesk. Si ces permissions sont absentes, l'hébergeur doit
les autoriser avant que cette procédure puisse fonctionner.

### Dépôt privé

Le dépôt public ne nécessite pas de jeton. Pour un dépôt privé, l'accès Git
configuré dans Plesk ne donne pas nécessairement accès aux pièces jointes des
Releases. L'installateur accepte `PLESK_GITHUB_TOKEN`, un jeton à permission
de lecture du contenu de ce seul dépôt. Le fournir **uniquement par un
mécanisme secret côté hébergeur**, jamais dans Git ou dans une commande
enregistrée en clair dans le panneau. Les variables Node.js de l'application
ne sont pas forcément transmises aux actions Git : vérifier ce point avec
l'hébergeur. Aucun jeton de ce type n'est requis ni configuré ici.

## Mises à jour suivantes

1. Faire le push sur `plesk-prebuilt` (ou `main` après réconciliation explicite des historiques).
2. Attendre le workflow **Build Plesk** terminé avec succès.
3. Dans Plesk : récupérer les changements, **Deploy Now**, puis **Restart App**.

Ne pas utiliser le déploiement automatique sur le webhook de push : il
pourrait s'exécuter avant la fin de la compilation GitHub. En cas d'échec,
lire le message de l'action et ne pas redémarrer sur une première installation
sans livraison valide.

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

Un installateur hors ligne est également prévu :

```sh
node scripts/plesk/install.cjs --file generated-artifacts/plesk/maestro-plesk.json.gz
```

Le fichier `.sha256` adjacent est obligatoire. Le build doit correspondre
exactement aux sources présentes. Cette commande n'est pas l'action Plesk
habituelle : sur Plesk elle s'utilise seulement après transfert manuel des
deux fichiers précompilés.

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

La vérification actuelle a constaté que l'historique local et `origin/main`
n'ont pas d'ancêtre commun. **Ne pas forcer un push sur `main`.** La commande
ci-dessous publie cette préparation sur une nouvelle branche `plesk-prebuilt`,
sans modifier la branche d'origine. Sélectionner cette branche dans Plesk.
Si elle existe déjà et que le push est refusé, ne pas forcer : examiner son
historique avant toute réconciliation.

```sh
git status
git add app.js package.json .gitignore .replitignore replit.md public/.gitkeep \
  artifacts/api-server/src/plesk.ts artifacts/pronostics-foot/vite.config.ts \
  scripts/plesk .github/workflows/plesk.yml docs/deploiement-plesk.md
git commit -m "Prepare prebuilt Plesk delivery"
git push origin HEAD:plesk-prebuilt
```

Documentation de référence :
[Héberger des applications Node.js dans Plesk](https://docs.plesk.com/fr-FR/obsidian/administrator-guide/g%C3%A9rer-des-sites-web/h%C3%A9berger-des-applications-nodejs.76652/).
