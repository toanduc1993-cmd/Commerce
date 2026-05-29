/**
 * src/lib/schemas/auth.js — Zod schemas cho auth endpoints (S2-2)
 */
const { z } = require('zod');

const VALID_ROLES = ['MUA_HANG', 'KY_THUAT', 'QC', 'WAREHOUSE', 'BOD', 'ADMIN'];

const loginSchema = z.object({
  username: z.string().min(3, 'Username phải có ít nhất 3 ký tự').max(50),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mật khẩu hiện tại bắt buộc'),
    newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự').max(72),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu cũ',
    path: ['newPassword'],
  });

const createUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username chỉ được chứa chữ, số, _.-'),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự').max(72),
  name: z.string().min(1).max(100),
  role: z.enum(VALID_ROLES),
  dept: z.string().max(100).optional().nullable(),
});

module.exports = { loginSchema, changePasswordSchema, createUserSchema, VALID_ROLES };
