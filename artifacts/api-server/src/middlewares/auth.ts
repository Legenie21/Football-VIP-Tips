import { clerkClient, getAuth } from "@clerk/express";
import { auth as auth0Jwt } from "express-oauth2-jwt-bearer";
import type { Request, RequestHandler } from "express";

type Auth0Payload = Record<string, unknown> & { sub?: unknown };

const auth0Verifier =
  process.env.AUTH0_DOMAIN && process.env.AUTH0_AUDIENCE
    ? auth0Jwt({
        issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
        audience: process.env.AUTH0_AUDIENCE,
      })
    : null;

function requestAuth0Payload(req: Request): Auth0Payload | null {
  return (
    (req as Request & { auth?: { payload?: Auth0Payload } }).auth?.payload ?? null
  );
}

export const optionalSignedIn: RequestHandler = (req, res, next) => {
  const authorization = req.get("authorization");
  if (authorization && /^Bearer\s+/i.test(authorization)) {
    if (!auth0Verifier) {
      res.status(503).json({ error: "Auth0 API authentication is not configured" });
      return;
    }

    auth0Verifier(req, res, (error?: unknown) => {
      if (error) {
        res.status(401).json({ error: "Invalid or expired access token" });
        return;
      }
      const payload = requestAuth0Payload(req);
      if (typeof payload?.sub !== "string" || !payload.sub) {
        res.status(401).json({ error: "Access token has no user identity" });
        return;
      }
      res.locals.userId = payload.sub;
      res.locals.authProvider = "auth0";
      res.locals.authPayload = payload;
      next();
    });
    return;
  }

  if (!auth0Verifier) {
    const clerkUserId = getAuth(req).userId;
    if (clerkUserId) {
      res.locals.userId = clerkUserId;
      res.locals.authProvider = "clerk";
    }
  }
  next();
};

export const requireSignedIn: RequestHandler = (req, res, next) => {
  optionalSignedIn(req, res, () => {
    if (!res.locals.userId) {
      res.status(401).json({ error: "Sign-in required" });
      return;
    }
    next();
  });
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  requireSignedIn(req, res, async (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }

    const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!configuredEmail) {
      res.status(503).json({ error: "Administrator email is not configured" });
      return;
    }

    if (res.locals.authProvider === "auth0") {
      const payload = res.locals.authPayload as Auth0Payload | undefined;
      const email = payload?.["https://pronostics-foot.app/email"];
      const verified = payload?.["https://pronostics-foot.app/email_verified"];
      if (
        typeof email !== "string" ||
        verified !== true ||
        email.trim().toLowerCase() !== configuredEmail
      ) {
        res.status(403).json({ error: "Administrator access required" });
        return;
      }
      next();
      return;
    }

    const userId = res.locals.userId as string;
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    );
    if (
      !primaryEmail ||
      primaryEmail.verification?.status !== "verified" ||
      primaryEmail.emailAddress.toLowerCase() !== configuredEmail
    ) {
      res.status(403).json({ error: "Administrator access required" });
      return;
    }
    next();
  });
};
