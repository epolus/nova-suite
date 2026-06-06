/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – API Router ───
// Mounts all sub-routers under /api

import { Router } from 'express';
import authRoutes from './auth/routes';
import ssoRoutes from './auth/sso';
import adminRoutes from './admin/routes';
import catalogRoutes from './catalog/routes';
import requestRoutes from './requests/routes';
import incidentRoutes from './incidents/routes';
import cmdbRoutes from './cmdb/routes';
import temporalRoutes from './temporal/routes';
import importRoutes from './import/routes';
import attachmentRoutes from './attachments/routes';
import settingsRoutes from './settings/routes';
import datasourceRoutes from './datasources/routes';
import knowledgeRoutes from './knowledge/routes';
import problemRoutes from './problems/routes';
import changeRoutes from './changes/routes';
import notificationRoutes from './notifications/routes';
import searchRoutes from './search/routes';
import approvalRoutes from './approvals/routes';
import cartRoutes from './cart/routes';
import credentialsRoutes from './credentials/routes';
import assetRoutes from './assets/routes';
import releaseRoutes from './releases/routes';
import reportRoutes from './reports/routes';
import configPackageRoutes from './config-packages/routes';
import majorIncidentRoutes from './major-incidents/routes';
import aiRoutes from './ai/routes';

const router = Router();

router.use('/settings', settingsRoutes);
router.use('/auth', authRoutes);
router.use('/auth/sso', ssoRoutes);
router.use('/admin/config-packages', configPackageRoutes);
router.use('/admin', adminRoutes);
router.use('/catalog', catalogRoutes);
router.use('/requests', requestRoutes);
router.use('/incidents', incidentRoutes);
router.use('/major-incidents', majorIncidentRoutes);
router.use('/cmdb', cmdbRoutes);
router.use('/temporal', temporalRoutes);
router.use('/import', importRoutes);
router.use('/attachments', attachmentRoutes);
router.use('/datasources', datasourceRoutes);
router.use('/cart', cartRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/problems', problemRoutes);
router.use('/changes', changeRoutes);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);
router.use('/approvals', approvalRoutes);
router.use('/credentials', credentialsRoutes);
router.use('/assets', assetRoutes);
router.use('/releases', releaseRoutes);
router.use('/reports', reportRoutes);
router.use('/ai', aiRoutes);

export default router;
