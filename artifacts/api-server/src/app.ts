import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Keep the imported legacy auth modules on disk without activating a provider.
// Frontend and API share the proxy origin; credentialed wildcard CORS is unnecessary.
app.disable("x-powered-by");
// Trust only local reverse proxies, never arbitrary forwarding headers.
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  const bodyError = error as { type?: string };
  // Body-parser errors may carry the raw request body, including passwords.
  // Never forward those to a generic logger/error serializer.
  if (bodyError.type === "entity.parse.failed") {
    res.status(400).json({ error: "Le formulaire envoyé est invalide." }); return;
  }
  if (bodyError.type === "entity.too.large") {
    res.status(413).json({ error: "Le formulaire envoyé est trop volumineux." }); return;
  }
  next(error);
});

app.use("/api", router);

export default app;
