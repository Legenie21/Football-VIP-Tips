import { and, desc, eq, gt, gte, lt, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreatePredictionBody,
  CreatePredictionResponse,
  GetAdminPaymentRequestsQueryParams,
  GetAdminPaymentRequestsResponse,
  GetAdminPredictionsResponse,
  GetAdminSummaryResponse,
  ReviewPaymentRequestBody,
  ReviewPaymentRequestParams,
  ReviewPaymentRequestResponse,
  UpdatePaymentInstructionsBody,
  UpdatePaymentInstructionsResponse,
  UpdatePredictionBody,
  UpdatePredictionParams,
  UpdatePredictionResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  membershipsTable,
  paymentInstructionsTable,
  paymentRequestsTable,
  predictionsTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();
const monthlyPrice = 1000;
const currency = "XAF";

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function cameroonDayBounds(now = new Date()): [Date, Date] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${parts}T00:00:00+01:00`);
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

function addCalendarMonth(date: Date): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function toAdminPrediction(row: typeof predictionsTable.$inferSelect) {
  return {
    ...row,
    locked: false,
  };
}

async function paymentInstructionsResponse() {
  const [instructions] = await db
    .select()
    .from(paymentInstructionsTable)
    .where(eq(paymentInstructionsTable.id, 1))
    .limit(1);
  const configured = Boolean(
    instructions?.operator &&
      instructions.walletNumber &&
      instructions.walletName &&
      instructions.instructions,
  );
  return {
    monthlyPrice,
    currency,
    operator: instructions?.operator ?? null,
    walletNumber: instructions?.walletNumber ?? null,
    walletName: instructions?.walletName ?? null,
    instructions: instructions?.instructions ?? null,
    configured,
  };
}

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const [start, end] = cameroonDayBounds(now);
  const [allPredictions, todayPredictions, activeMembers, pendingPayments, settled, wins] =
    await Promise.all([
      db.select({ id: predictionsTable.id }).from(predictionsTable),
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(
          and(
            gte(predictionsTable.kickoffAt, start),
            lt(predictionsTable.kickoffAt, end),
          ),
        ),
      db
        .select({ userId: membershipsTable.userId })
        .from(membershipsTable)
        .where(
          and(lte(membershipsTable.startsAt, now), gt(membershipsTable.expiresAt, now)),
        ),
      db
        .select({ id: paymentRequestsTable.id })
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.status, "pending")),
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(eq(predictionsTable.status, "won")),
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(eq(predictionsTable.status, "lost")),
    ]);
  const settledCount = settled.length + wins.length;
  res.json(
    GetAdminSummaryResponse.parse({
      totalPredictions: allPredictions.length,
      todayPredictions: todayPredictions.length,
      activeMembers: activeMembers.length,
      pendingPayments: pendingPayments.length,
      hitRate: settledCount ? (settled.length / settledCount) * 100 : 0,
    }),
  );
});

router.get("/admin/predictions", requireAdmin, async (_req, res): Promise<void> => {
  const predictions = await db
    .select()
    .from(predictionsTable)
    .orderBy(desc(predictionsTable.kickoffAt));
  res.json(
    GetAdminPredictionsResponse.parse(predictions.map(toAdminPrediction)),
  );
});

router.post("/admin/predictions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePredictionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [prediction] = await db
    .insert(predictionsTable)
    .values({
      homeTeam: data.homeTeam.trim(),
      awayTeam: data.awayTeam.trim(),
      league: data.league.trim(),
      kickoffAt: asDate(data.kickoffAt),
      tier: data.tier,
      market: data.market.trim(),
      selection: data.selection.trim(),
      odds: data.odds ?? null,
      confidence: data.confidence ?? null,
      analysis: data.analysis?.trim() ?? null,
    })
    .returning();
  res.status(201).json(
    CreatePredictionResponse.parse(toAdminPrediction(prediction)),
  );
});

router.patch(
  "/admin/predictions/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdatePredictionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdatePredictionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const [prediction] = await db
      .update(predictionsTable)
      .set({
        ...data,
        ...(data.kickoffAt
          ? { kickoffAt: asDate(data.kickoffAt) }
          : {}),
        ...(data.homeTeam ? { homeTeam: data.homeTeam.trim() } : {}),
        ...(data.awayTeam ? { awayTeam: data.awayTeam.trim() } : {}),
        ...(data.league ? { league: data.league.trim() } : {}),
        ...(data.market ? { market: data.market.trim() } : {}),
        ...(data.selection ? { selection: data.selection.trim() } : {}),
        ...(data.analysis !== undefined
          ? { analysis: data.analysis?.trim() ?? null }
          : {}),
      })
      .where(eq(predictionsTable.id, params.data.id))
      .returning();
    if (!prediction) {
      res.status(404).json({ error: "Prediction not found" });
      return;
    }
    res.json(
      UpdatePredictionResponse.parse(toAdminPrediction(prediction)),
    );
  },
);

router.get(
  "/admin/payment-requests",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = GetAdminPaymentRequestsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const requests = await db
      .select()
      .from(paymentRequestsTable)
      .where(
        parsed.data.status
          ? eq(paymentRequestsTable.status, parsed.data.status)
          : undefined,
      )
      .orderBy(desc(paymentRequestsTable.createdAt));
    res.json(GetAdminPaymentRequestsResponse.parse(requests));
  },
);

router.patch(
  "/admin/payment-requests/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ReviewPaymentRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ReviewPaymentRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.id, params.data.id))
        .for("update");
      if (!request) return { kind: "missing" as const };
      if (request.status !== "pending") {
        return { kind: "already-reviewed" as const };
      }

      const reviewedAt = new Date();
      const reviewerId = res.locals.userId as string;
      const [updated] = await tx
        .update(paymentRequestsTable)
        .set({
          status: parsed.data.status,
          adminNote: parsed.data.adminNote?.trim() ?? null,
          reviewedAt,
          reviewedBy: reviewerId,
        })
        .where(eq(paymentRequestsTable.id, request.id))
        .returning();

      if (parsed.data.status === "approved") {
        const [membership] = await tx
          .select()
          .from(membershipsTable)
          .where(eq(membershipsTable.userId, request.userId))
          .for("update");
        const now = new Date();
        const stillActive =
          membership?.startsAt &&
          membership.expiresAt &&
          membership.startsAt <= now &&
          membership.expiresAt > now;
        const startsAt = stillActive ? membership.startsAt! : now;
        const currentExpiry = stillActive ? membership.expiresAt! : now;
        await tx
          .insert(membershipsTable)
          .values({
            userId: request.userId,
            startsAt,
            expiresAt: addCalendarMonth(currentExpiry),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: membershipsTable.userId,
            set: {
              startsAt,
              expiresAt: addCalendarMonth(currentExpiry),
              updatedAt: now,
            },
          });
      }
      return { kind: "ok" as const, request: updated };
    });

    if (result.kind === "missing") {
      res.status(404).json({ error: "Payment request not found" });
      return;
    }
    if (result.kind === "already-reviewed") {
      res.status(400).json({ error: "Payment request was already reviewed" });
      return;
    }
    res.json(ReviewPaymentRequestResponse.parse(result.request));
  },
);

router.patch(
  "/admin/payment-instructions",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = UpdatePaymentInstructionsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;
    await db
      .insert(paymentInstructionsTable)
      .values({
        id: 1,
        operator: data.operator,
        walletNumber: data.walletNumber.trim(),
        walletName: data.walletName.trim(),
        instructions: data.instructions.trim(),
      })
      .onConflictDoUpdate({
        target: paymentInstructionsTable.id,
        set: {
          operator: data.operator,
          walletNumber: data.walletNumber.trim(),
          walletName: data.walletName.trim(),
          instructions: data.instructions.trim(),
          updatedAt: new Date(),
        },
      });
    res.json(
      UpdatePaymentInstructionsResponse.parse(
        await paymentInstructionsResponse(),
      ),
    );
  },
);

export default router;
