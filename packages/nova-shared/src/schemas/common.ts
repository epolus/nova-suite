/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';

export const uuidSchema = z.guid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).loose();

export const rankedSuggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
}).loose();

export type PaginationQuery = z.input<typeof paginationSchema>;
export type RankedSuggestionsQuery = z.input<typeof rankedSuggestionsQuerySchema>;
