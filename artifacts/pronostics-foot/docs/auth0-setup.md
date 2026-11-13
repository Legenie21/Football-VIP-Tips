# Configurer la connexion Auth0 par e-mail et téléphone

L’application utilise Auth0 Universal Login pour les codes e-mail et SMS. Auth0 envoie les SMS via le fournisseur téléphonique configuré dans son tableau de bord; aucun secret Twilio n’est stocké dans le code du site.

## 1. Créer l’application Auth0

1. Dans Auth0, créez une application de type **Single Page Application**.
2. Créez aussi une API Auth0 avec un identifiant unique, par exemple `https://pronostics-foot-api`, et gardez l’algorithme de signature `RS256`.
3. Dans les réglages de l’application, ajoutez l’origine du site aux **Allowed Callback URLs**, **Allowed Logout URLs** et **Allowed Web Origins**. Ajoutez séparément le domaine de prévisualisation et le domaine du site publié.
4. Ajoutez les variables d’environnement demandées par Replit :
   - `AUTH0_DOMAIN` et `VITE_AUTH0_DOMAIN` : domaine Auth0 sans `https://`.
   - `AUTH0_AUDIENCE` et `VITE_AUTH0_AUDIENCE` : identifiant de l’API Auth0.
   - `VITE_AUTH0_CLIENT_ID` : identifiant client de l’application SPA.

Les valeurs serveur et navigateur `AUTH0_DOMAIN` / `VITE_AUTH0_DOMAIN` et `AUTH0_AUDIENCE` / `VITE_AUTH0_AUDIENCE` doivent correspondre.

## 2. Activer les comptes e-mail et SMS

1. Dans Auth0, activez les connexions **Passwordless Email** et **Passwordless SMS**.
2. Autorisez ces deux connexions pour l’application SPA.
3. Dans **Branding → Phone Provider**, choisissez Twilio et configurez le compte, le service d’envoi et l’expéditeur. Utilisez uniquement le formulaire sécurisé d’Auth0 pour les identifiants Twilio.
4. Configurez un message de code en français et une durée de validité courte pour les codes.

L’application sélectionne la connexion Auth0 `email` ou `sms`. Le premier code vérifié crée le compte; les utilisateurs peuvent ensuite reprendre la même méthode pour se connecter.

## 3. Autoriser l’administrateur

Le serveur n’accorde pas le rôle administrateur à partir d’un champ envoyé par le navigateur. Il vérifie l’adresse e-mail vérifiée dans le jeton Auth0. Pour l’ajouter, créez une **Post Login Action**, puis publiez-la et ajoutez-la au flux de connexion :

```js
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.email && event.user.email_verified === true) {
    api.accessToken.setCustomClaim(
      "https://pronostics-foot.app/email",
      event.user.email,
    );
    api.accessToken.setCustomClaim(
      "https://pronostics-foot.app/email_verified",
      true,
    );
  }
};
```

Le compte administrateur doit utiliser l’adresse déjà configurée dans le projet et la vérifier auprès d’Auth0.

## Migration progressive

Tant que les variables Auth0 ne sont pas définies, le site conserve la connexion Clerk existante. Dès que les trois variables `VITE_AUTH0_*` sont présentes, l’écran de connexion passe à Auth0; l’API exige alors un jeton Auth0 valide pour les requêtes connectées. Les routes d’administration restent protégées dans tous les cas.
