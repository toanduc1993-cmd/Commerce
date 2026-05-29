/**
 * src/lib/schemas/alerts.js — Zod schemas cho F04 Alert Center
 */
const { z } = require('zod');

const SEVERITY = ['HIGH', 'MEDIUM', 'LOW'];
const FLAGS = ['ORPHAN_INVOICE', 'CHƯA_XUẤT_HĐ', 'PQLDA_KHÔNG_INV'];

const alertFilterSchema = z.object({
  severity: z.enum(SEVERITY).optional(),
  flag: z.enum(FLAGS).optional(),
  resolved: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  search: z.string().trim().max(120).optional(),
});

const resolveBodySchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const canonicalKeyParam = z.object({
  canonicalKey: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._\-/ ]+$/, 'canonical_key chỉ chấp nhận chữ/số/.-_/'),
});

module.exports = {
  SEVERITY,
  FLAGS,
  alertFilterSchema,
  resolveBodySchema,
  canonicalKeyParam,
};
