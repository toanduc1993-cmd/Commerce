/**
 * src/lib/schemas/common.js — Reusable Zod schemas (S2-2)
 */
const { z } = require('zod');

const cuidOrUuid = z
  .string()
  .min(8)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, 'ID không hợp lệ');

const idParam = z.object({ id: cuidOrUuid });

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const dateRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

module.exports = { cuidOrUuid, idParam, paginationQuery, dateRangeQuery };
