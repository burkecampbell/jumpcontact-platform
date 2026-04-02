import { pgTable, text, integer, real, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * daily_snapshots — immutable daily metrics per brand.
 * One row per date per brand (mixed, jc, msc).
 * Once written, these rows are NEVER updated — they are the
 * investor-grade source of truth for historical trend data.
 */
export const dailySnapshots = pgTable('daily_snapshots', {
  id:             text('id').primaryKey(),                       // `${date}_${brand}` e.g. "2026-03-15_jc"
  date:           text('date').notNull(),                        // "2026-03-15"
  brand:          text('brand').notNull(),                       // "mixed" | "jc" | "msc"
  answeredCalls:  integer('answered_calls').notNull(),
  missedCalls:    integer('missed_calls').notNull(),
  totalCalls:     integer('total_calls').notNull(),
  conversions:    integer('conversions').notNull(),
  avgSpeedSec:    real('avg_speed_sec'),                         // null if no data
  avgWrapSec:     real('avg_wrap_sec'),                          // null if no data
  agentCount:     integer('agent_count').notNull(),
  agentData:      jsonb('agent_data'),                           // per-agent breakdown
  reconciliation: jsonb('reconciliation'),                       // Ytica vs CDR vs agent sums
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('daily_snapshots_date_brand_idx').on(table.date, table.brand),
]);

export type DailySnapshot = typeof dailySnapshots.$inferSelect;
export type NewDailySnapshot = typeof dailySnapshots.$inferInsert;
