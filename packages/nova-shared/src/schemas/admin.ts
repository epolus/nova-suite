/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { e164PhoneSchema } from './auth';

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(255),
  phone: e164PhoneSchema.optional().nullable(),
  mobile: e164PhoneSchema.optional().nullable(),
  vip: z.boolean().optional(),
  employee_number: z.string().max(100).optional().nullable(),
  locked_out: z.boolean().optional(),
  lock_reason: z.string().max(200).optional().nullable(),
}).loose();

export const adminUpdateUserSchema = z.object({
  phone: e164PhoneSchema.optional().nullable(),
  mobile: e164PhoneSchema.optional().nullable(),
  vip: z.boolean().optional(),
  employee_number: z.string().max(100).optional().nullable(),
  locked_out: z.boolean().optional(),
  lock_reason: z.string().max(200).optional().nullable(),
}).loose();

export type AdminCreateUserInput = z.input<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.input<typeof adminUpdateUserSchema>;

export type AdminCreateUser = z.output<typeof adminCreateUserSchema>;
export type AdminUpdateUser = z.output<typeof adminUpdateUserSchema>;
