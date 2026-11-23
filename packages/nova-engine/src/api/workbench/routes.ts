/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  setTenantRLS,
} from '../../middleware/auth';
import { validateQuery } from '../../middleware/validate';
import { isFulfillerRole } from '../roles';
import { listWorkbenchQueue, resolveWorkbenchRecords, WORKBENCH_BUCKETS } from './queue';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

const queueQuerySchema = z.object({
  bucket: z.enum(WORKBENCH_BUCKETS).default('mine'),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const resolveQuerySchema = z.object({
  numbers: z.string().max(400).optional(),
});

router.get('/queue', validateQuery(queueQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query as unknown as z.infer<typeof queueQuerySchema>;
    const items = await listWorkbenchQueue(getRequestClient(req), {
      bucket: query.bucket,
      search: query.search?.trim() ?? '',
      limit: query.limit,
      user: { id: req.user!.id },
      isFulfiller: isFulfillerRole(req),
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.get('/resolve', validateQuery(resolveQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query as unknown as z.infer<typeof resolveQuerySchema>;
    const records = await resolveWorkbenchRecords(getRequestClient(req), query.numbers);
    res.json({ records });
  } catch (err) {
    next(err);
  }
});

export default router;
