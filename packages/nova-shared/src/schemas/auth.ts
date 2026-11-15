/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { uuidSchema } from './common';

export const e164PhoneSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    // Normalize common user formatting before E.164 validation.
    return value.trim().replace(/[()\-\s]/g, '');
  },
  z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be a valid E.164 phone number'),
);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  display_name: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  phone: e164PhoneSchema.optional(),
  mobile: e164PhoneSchema.optional(),
  location: z.string().max(255).default('Zurich'),
  timezone: z.string().max(100).default('UTC'),
  time_format: z.enum(['12h', '24h']).default('24h'),
  date_format: z.enum(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('YYYY-MM-DD'),
  employee_type: z.enum(['employee', 'contractor', 'vendor', 'intern']).default('employee'),
  company: uuidSchema.optional(),
  preferred_language: z.string().max(10).default('en'),
  start_date: z.string().optional(),
  last_working_date: z.string().optional(),
  user_id: z.string().max(100).optional(),
  manager_id: uuidSchema.optional(),
  department_id: uuidSchema.optional(),
  cost_center_id: uuidSchema.optional(),
  role_ids: z.array(uuidSchema).min(1).default([]),
});

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
