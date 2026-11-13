import { and, desc, eq, gte, gt, inArray, isNull, lt, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreatePaymentRequestBody,
  CreatePaymentRequestResponse,
  GetMembershipResponse,
  GetMyPaymentRequestsResponse,
  GetPaymentInstructionsResponse,
  GetPredictionsQueryParams,
  GetPredictionsResponse,
  GetSummaryResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  membershipsTable,
  paymentInstructionsTable,
  paymentRequestsTable,
  predictionsTable,
} from "@workspace/db";
import { optionalSignedIn, requireSignedIn } from "../middlewares/auth";

const router: IRouter = Router();
const monthlyPrice = 1000;
const currency = "XAF";

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

function toPrediction(row: typeof predictionsTable.$inferSelect) {
  return {
    id: row.id,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    league: row.league,
    kickoffAt: row.kickoffAt,
    tier: row.tier,
    market: row.market,
    selection: row.selection,
    odds: row.odds,
    confidence: row.confidence,
    analysis: row.analysis,
    status: row.status,
    locked: false,
    createdAt: row.createdAt,
  };
}

async function hasActiveVip(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const now = new Date();
  const [membership] = await db
    .select({ userId: membershipsTable.userId })
    .from(membershipsTable)
    .where(
      and(
        eq(membershipsTable.userId, userId),
        lte(membershipsTable.startsAt, now),
        gt(membershipsTable.expiresAt, now),
        isNull(membershipsTable.suspendedAt),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

async function getInstructions() {
  const [configured] = await db
    .select()
    .from(paymentInstructionsTable)
    .where(eq(paymentInstructionsTable.id, 1))
    .limit(1);
  const configuredDetails = Boolean(
    configured?.operator &&
      configured.walletNumber &&
      configured.walletName &&
      configured.instructions,
  );
  return {
    monthlyPrice,
    currency,
    operator: configured?.operator ?? null,
    walletNumber: configured?.walletNumber ?? null,
    walletName: configured?.walletName ?? null,
    instructions: configured?.instructions ?? null,
    configured: configuredDetails,
  };
}

router.get("/summary", async (_req, res): Promise<void> => {
  const [start, end] = cameroonDayBounds();
  const [todayRows, freeTodayRows, vipTodayRows, settledRows, wins, latestRows] =
    await Promise.all([
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(and(gte(predictionsTable.kickoffAt, start), lt(predictionsTable.kickoffAt, end))),
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(
          and(
            eq(predictionsTable.tier, "free"),
            gte(predictionsTable.kickoffAt, start),
            lt(predictionsTable.kickoffAt, end),
          ),
        ),
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(
          and(
            eq(predictionsTable.tier, "vip"),
            gte(predictionsTable.kickoffAt, start),
            lt(predictionsTable.kickoffAt, end),
          ),
        ),
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(inArray(predictionsTable.status, ["won", "lost"])),
      db
        .select({ id: predictionsTable.id })
        .from(predictionsTable)
        .where(eq(predictionsTable.status, "won")),
      db
        .select()
        .from(predictionsTable)
        .where(and(eq(predictionsTable.tier, "free"), inArray(predictionsTable.status, ["won", "lost", "void"])))
        .orderBy(desc(predictionsTable.kickoffAt))
        .limit(5),
    ]);
  const data = {
    todayCount: todayRows.length,
    freeTodayCount: freeTodayRows.length,
    vipTodayCount: vipTodayRows.length,
    settledCount: settledRows.length,
    hitRate: settledRows.length ? (wins.length / settledRows.length) * 100 : 0,
    latestResults: latestRows.map(toPrediction),
  };
  res.json(GetSummaryResponse.parse(data));
});

router.get("/predictions", optionalSignedIn, async (req, res): Promise<void> => {
  const parsedQuery = GetPredictionsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const conditions = [];
  const activeVip = await hasActiveVip(res.locals.userId as string | undefined);
  if (parsedQuery.data.tier === "vip" && !activeVip) {
    res.status(403).json({ error: "An active VIP membership is required" });
    return;
  }

  if (!activeVip) {
    conditions.push(eq(predictionsTable.tier, "free"));
  } else if (parsedQuery.data.tier) {
    conditions.push(eq(predictionsTable.tier, parsedQuery.data.tier));
  }
  if (parsedQuery.data.status) {
    conditions.push(eq(predictionsTable.status, parsedQuery.data.status));
  }

  const predictions = await db
    .select()
    .from(predictionsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(predictionsTable.kickoffAt));
  res.json(
    GetPredictionsResponse.parse(
      predictions.map(toPrediction),
    ),
  );
});

router.get("/payment-instructions", async (_req, res): Promise<void> => {
  res.json(GetPaymentInstructionsResponse.parse(await getInstructions()));
});

router.get("/membership", requireSignedIn, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const [membership] = await db
    .select()
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId))
    .limit(1);
  const now = new Date();
  const active = Boolean(
    membership?.startsAt &&
      membership.expiresAt &&
      !membership.suspendedAt &&
      membership.startsAt <= now &&
      membership.expiresAt > now,
  );
  const status = !membership
    ? "inactive"
    : membership.suspendedAt
      ? "suspended"
      : active
        ? "active"
        : "expired";
  res.json(
    GetMembershipResponse.parse({
      active,
      status,
      startsAt: membership?.startsAt ?? null,
      expiresAt: membership?.expiresAt ?? null,
      suspendedAt: membership?.suspendedAt ?? null,
      monthlyPrice,
      currency,
    }),
  );
});

router.get("/payment-requests", requireSignedIn, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const requests = await db
    .select()
    .from(paymentRequestsTable)
    .where(eq(paymentRequestsTable.userId, userId))
    .orderBy(desc(paymentRequestsTable.createdAt));
  res.json(
    GetMyPaymentRequestsResponse.parse(
      requests.map(({ userId: _userId, reviewedBy: _reviewedBy, ...request }) => request),
    ),
  );
});

router.post("/payment-requests", requireSignedIn, async (req, res): Promise<void> => {
  const parsed = CreatePaymentRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const instructions = await getInstructions();
  if (!instructions.configured || instructions.operator !== parsed.data.operator) {
    res.status(400).json({ error: "The selected payment method is not configured" });
    return;
  }

  const [request] = await db
    .insert(paymentRequestsTable)
    .values({
      userId: res.locals.userId as string,
      operator: parsed.data.operator,
      transactionReference: parsed.data.transactionReference.trim(),
      amount: monthlyPrice,
      currency,
    })
    .onConflictDoNothing()
    .returning();

  if (!request) {
    res.status(409).json({ error: "This transaction reference was already submitted" });
    return;
  }

  const { userId: _userId, reviewedBy: _reviewedBy, ...response } = request;
  res.status(201).json(CreatePaymentRequestResponse.parse(response));
});

export default router;
