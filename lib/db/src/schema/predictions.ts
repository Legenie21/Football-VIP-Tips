import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const predictionTier = pgEnum("prediction_tier", ["free", "vip"]);
export const predictionStatus = pgEnum("prediction_status", [
  "upcoming",
  "won",
  "lost",
  "void",
]);
export const mobileOperator = pgEnum("mobile_operator", ["MTN", "ORANGE"]);
export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "approved",
  "rejected",
]);

export const predictionsTable = pgTable(
  "predictions",
  {
    id: serial("id").primaryKey(),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    league: text("league").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    tier: predictionTier("tier").notNull(),
    market: text("market").notNull(),
    selection: text("selection").notNull(),
    odds: real("odds"),
    confidence: integer("confidence"),
    analysis: text("analysis"),
    status: predictionStatus("status").notNull().default("upcoming"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("predictions_kickoff_at_idx").on(table.kickoffAt),
    index("predictions_tier_status_idx").on(table.tier, table.status),
  ],
);

export const insertPredictionSchema = createInsertSchema(predictionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPrediction = typeof predictionsTable.$inferInsert;
export type Prediction = typeof predictionsTable.$inferSelect;

export const membershipsTable = pgTable("memberships", {
  userId: text("user_id").primaryKey(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const paymentRequestsTable = pgTable(
  "payment_requests",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    operator: mobileOperator("operator").notNull(),
    transactionReference: text("transaction_reference").notNull(),
    amount: integer("amount").notNull().default(1000),
    currency: text("currency").notNull().default("XAF"),
    status: paymentStatus("status").notNull().default("pending"),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
  },
  (table) => [
    index("payment_requests_user_created_idx").on(table.userId, table.createdAt),
    index("payment_requests_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("payment_requests_operator_reference_unique").on(
      table.operator,
      table.transactionReference,
    ),
  ],
);

export const paymentInstructionsTable = pgTable("payment_instructions", {
  id: serial("id").primaryKey(),
  operator: mobileOperator("operator"),
  walletNumber: text("wallet_number"),
  walletName: text("wallet_name"),
  instructions: text("instructions"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
