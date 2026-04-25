/* SPDX-License-Identifier: AGPL-3.0-only */
export {
  getIncident,
  markSlaBreached,
  escalateIncident,
  autoAssignIncident,
  autoCloseIncident,
  sendNotification,
} from './incident-activities';

export {
  getTaskDefinitions,
  createRequestTasks,
  activateTaskGroup,
  completeRequestTask,
  skipRemainingTasks,
  updateRequestStatus,
  getPendingTaskCount,
  getAwaitingHumanTaskIds,
} from './catalog-activities';

export {
  executeAutomatedCatalogTask,
  skipRequestTasksByOrders,
} from './catalog-automation-activities';

export {
  runDataSourceImport,
} from './datasource-activities';

export {
  setKnowledgeArticleStatus,
} from './knowledge-activities';

export {
  dispatchConfiguredNotifications,
} from './notification-activities';
