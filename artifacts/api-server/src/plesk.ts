import express from "express";
import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";

// This entry point is bundled separately as CommonJS for Plesk Passenger.
const publicDir = path.join(__dirname, "public");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.static(publicDir, {
  dotfiles: "deny",
  index: false,
  setHeaders(res, filename) {
    res.setHeader(
      "Cache-Control",
      filename.includes(`${path.sep}assets${path.sep}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
  },
}));
// Only actual client routes receive the SPA, never a missing asset or secret.
app.get(/^\/(?:vip|admin|dashboard|sign-in(?:\/.*)?|sign-up(?:\/.*)?)?$/, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  // Give sendFile a root: absolute paths containing the hidden releases
  // directory would otherwise be rejected by Express's dotfile protection.
  res.sendFile("index.html", { root: publicDir });
});
app.use((_req, res) => {
  res.status(404).type("text").send("Ressource introuvable.");
});
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err }, "Échec du traitement de la requête");
  res.status(500).json({ error: "Erreur interne du serveur." });
});

// Passenger intercepts listen(). Outside Passenger, PORT or 3000 is used.
const rawPort = process.env.PORT ?? "3000";
if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
  throw new Error("PORT doit être un entier entre 1 et 65535.");
}
const server = app.listen(Number(rawPort), () => {
  logger.info("Serveur Plesk démarré en mode production");
});
server.on("error", () => {
  logger.fatal("Impossible de démarrer le serveur Plesk");
  process.exit(1);
});
