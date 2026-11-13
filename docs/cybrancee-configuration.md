# Préparation du raccordement à Cybrancee

## Ce qui est préparé

- Un modèle de variables : `config/cybrancee.env.example`.
- Un lecteur de configuration serveur avec validation :
  `artifacts/api-server/src/config/direct-auth.ts`.
- Une commande de contrôle et des tests sans connexion réseau.
- Aucune dépendance à Clerk ou Resend dans cette préparation.

**Il s'agit d'une préparation de configuration, pas d'une authentification
opérationnelle.** Aucun compte n'est créé, aucune connexion externe n'est ouverte,
aucun e-mail n'est envoyé et aucune donnée existante n'est modifiée.
Le dépôt GitHub du site n'est ni importé ni modifié par cette préparation locale.
Les paramètres ne sont pas encore raccordés aux écrans ou routes de connexion.

## Fonctionnement retenu pour le futur développement

1. Inscription avec nom, prénom, e-mail, téléphone avec indicatif et mot de passe.
2. Code OTP envoyé à l'e-mail ; activation du compte seulement après validation.
3. Connexion par e-mail ou téléphone international et mot de passe, sans OTP.
4. Mot de passe oublié : code OTP envoyé uniquement à l'e-mail vérifié du compte.
5. Aucun SMS. Le numéro n'est pas certifié comme appartenant à l'utilisateur.

La politique prépare des codes de six chiffres, expirant après dix minutes, avec
cinq essais maximum et au moins soixante secondes avant un nouvel envoi.
Ces valeurs sont une politique à appliquer dans le futur service, pas des
protections déjà actives.

## Renseignements à obtenir au moment du raccordement

### Base de données

Demander à Cybrancee le moteur réel, l'hôte, le port, le nom de base,
l'utilisateur, le mot de passe et les instructions TLS. Le modèle accepte
`mysql` (également pour MariaDB) ou `postgres` ; il ne présume pas de votre offre.
Ces deux configurations sont reconnues par le validateur ; les pilotes,
requêtes et migrations correspondants restent à implémenter après le choix
du moteur. Le PostgreSQL du squelette actuel n'est pas remplacé.

Ne pas modifier `DATABASE_URL` pour cette préparation : les paramètres
`CYBRANCEE_DB_*` sont séparés de la base éventuellement utilisée actuellement.
Ne jamais désactiver la vérification du certificat. Si un certificat d'autorité
est fourni, son contenu PEM peut être renseigné dans `CYBRANCEE_DB_CA`.
`CYBRANCEE_DB_TLS=false` est réservé au cas explicitement documenté par
l'hébergeur et ne doit pas être utilisé pour contourner une erreur de certificat.

### Envoi des e-mails

**Une base de données n'envoie pas d'e-mails.** Renseigner séparément le SMTP
de la messagerie de l'hébergeur, si votre offre en fournit un, ou d'une autre
messagerie. Aucune connexion Resend n'est requise.

Prévoir hôte, port, utilisateur, mot de passe et adresse d'expédition autorisée.
Utiliser `SMTP_SECURITY=starttls` pour une connexion qui doit être chiffrée par
STARTTLS, ou `tls` pour TLS implicite. Le futur transport SMTP devra refuser
une connexion non chiffrée et vérifier le certificat.
Faire configurer SPF/DKIM et les règles d'expédition selon les instructions de
votre messagerie ; la fourniture d'une base ne garantit pas celle d'un SMTP.

### Secrets et adresse du site

Renseigner les mots de passe et secrets uniquement dans le gestionnaire de
secrets du serveur, jamais dans le code, Git ou les variables `VITE_*`.
Le fichier d'exemple contient uniquement des champs vides et des réglages publics.
Ne pas remplacer un secret existant sans prévoir l'effet sur les futures sessions.
Prévoir deux secrets aléatoires distincts d'au moins 32 caractères :
`SESSION_SECRET` et `AUTH_OTP_SECRET`.
`AUTH_PUBLIC_ORIGIN` doit contenir l'origine HTTPS réelle du site, sans chemin.
Ne jamais afficher ni journaliser l'objet renvoyé par le lecteur de configuration.

## Contrôler les paramètres

Depuis la racine du projet, une fois les variables configurées sur le serveur :

```sh
pnpm --filter @workspace/api-server run check:direct-auth-config
```

Cette commande requiert Node.js 22.18+ ou 24+. Elle valide les paramètres
**sans tenter de connexion à la base ni au SMTP**. Elle affiche uniquement les
noms des paramètres manquants ou invalides et termine avec un code d'échec si la
configuration est incomplète. Sans vos paramètres, cet échec est attendu.

Le modèle `.env.example` n'est pas chargé automatiquement. Utiliser l'injection
des variables de l'hébergement ; ne pas copier de vrais identifiants dans ce modèle.

## Étapes restant nécessaires avant la mise en service

- Raccorder le code du site et implémenter les routes et écrans d'authentification.
- Installer le pilote correspondant au moteur choisi et créer les migrations
  pour les utilisateurs, sessions, challenges OTP et limites de requêtes.
- Hacher les mots de passe avec un algorithme adapté (scrypt ou Argon2id).
  Ne jamais les stocker en clair ni les chiffrer de façon réversible.
- Normaliser les e-mails et numéros internationaux ; garantir leur unicité.
- Stocker uniquement une empreinte protégée des OTP, associer chaque code à son
  usage, assurer expiration, nombre d'essais et consommation atomique.
- Persister les limites d'essais et d'envois ; ne jamais révéler l'existence d'un
  compte dans le parcours « mot de passe oublié ».
- Créer des sessions persistantes avec cookies sécurisés, protection CSRF,
  rotation à la connexion et révocation après réinitialisation du mot de passe.
- Brancher un vrai transport SMTP ; ne pas simuler l'envoi ni afficher les codes
  dans les journaux en cas d'échec.
- Tester les deux connexions et les deux parcours OTP avant de désactiver
  définitivement l'ancien fournisseur sur le site.
