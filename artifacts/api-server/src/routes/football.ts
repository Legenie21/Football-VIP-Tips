import { and, desc, eq, gte, gt, inArray, lt, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
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
import { requireSignedIn } from "../middlewares/auth";

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

function toPrediction(row: typeof predictionsTable.$inferSelect, activeVip: boolean) {
  const locked = row.tier === "vip" && !activeVip;
  return {
    id: row.id,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    league: row.league,
    kickoffAt: row.kickoffAt,
    tier: row.tier,
    market: locked ? null : row.market,
    selection: locked ? null : row.selection,
    odds: locked ? null : row.odds,
    confidence: locked ? null : row.confidence,
    analysis: locked ? null : row.analysis,
    status: locked ? "upcoming" : row.status,
    locked,
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
    latestResults: latestRows.map((row) => toPrediction(row, false)),
  };
  res.json(GetSummaryResponse.parse(data));
});

router.get("/predictions", async (req, res): Promise<void> => {
  const parsedQuery = GetPredictionsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const conditions = [];
  if (parsedQuery.data.tier) {
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
  const activeVip = await hasActiveVip(getAuth(req).userId);
  res.json(
    GetPredictionsResponse.parse(
      predictions.map((prediction) => toPrediction(prediction, activeVip)),
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
  const active = Boolean(
    membership?.startsAt &&
      membership.expiresAt &&
      membership.startsAt <= new Date() &&
      membership.expiresAt > new Date(),
  );
  res.json(
    GetMembershipResponse.parse({
      active,
      startsAt: membership?.startsAt ?? null,
      expiresAt: membership?.expiresAt ?? null,
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
