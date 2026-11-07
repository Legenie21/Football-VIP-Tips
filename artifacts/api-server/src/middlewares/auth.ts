import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireSignedIn: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  res.locals.userId = userId;
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) {
    res.status(503).json({ error: "Administrator email is not configured" });
    return;
  }

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

  res.locals.userId = userId;
  next();
};
