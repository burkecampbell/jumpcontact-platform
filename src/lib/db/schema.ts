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

/**
 * call_records — per-call metrics from TaskRouter events.
 * Source of truth for real per-call wrap-up, queue time, talk time.
 * Scraped from TaskRouter (14-day retention) and stored permanently.
 * Retained for 75 days minimum (two full billing months + buffer).
 */
export const callRecords = pgTable('call_records', {
  callSid:           text('call_sid').primaryKey(),                 // Twilio CA... SID
  taskSid:           text('task_sid').notNull(),                    // TaskRouter WT... SID
  conferenceSid:     text('conference_sid'),                        // CF... SID
  date:              text('date').notNull(),                        // "2026-04-07" (MST)
  timeUtc:           text('time_utc'),                              // "14:30:05"
  createdAt:         text('created_at').notNull(),                  // ISO timestamp from event
  client:            text('client'),                                // Account name from task attributes
  agent:             text('agent'),                                 // Normalized first name
  agentEmail:        text('agent_email'),                           // Full email from worker
  queueSec:          integer('queue_sec'),                          // Seconds in queue
  talkSec:           integer('talk_sec'),                           // Actual talk duration
  wrapUpSec:         integer('wrap_up_sec'),                        // REAL per-call wrap-up
  billableWrapSec:   integer('billable_wrap_sec'),                  // Capped at 90s
  totalBillableSec:  integer('total_billable_sec'),                 // talk + billable wrap
  recordingSid:      text('recording_sid'),                         // RE... SID
  recordingDurSec:   integer('recording_dur_sec'),                  // Recording length
  scrapedAt:         timestamp('scraped_at', { withTimezone: true }).defaultNow().notNull(),
});
