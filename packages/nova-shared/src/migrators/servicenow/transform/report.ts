/* SPDX-License-Identifier: AGPL-3.0-only */

export type MigrationNoteSeverity = 'info' | 'warning' | 'error';

export type MigrationNote = {
  severity: MigrationNoteSeverity;
  code: string;
  message: string;
  /** ServiceNow step label or variable name the note refers to. */
  subject?: string;
};

export type MigrationItemStatus = 'full' | 'partial' | 'unsupported';

export type MigrationItemReport = {
  externalKey: string;
  sysId: string;
  name: string;
  categoryName: string;
  status: MigrationItemStatus;
  flowName: string | null;
  fieldCount: number;
  taskCount: number;
  automationStateCount: number;
  scriptSteps: number;
  notes: MigrationNote[];
};

export type MigrationSubflowReport = {
  sysId: string;
  name: string;
  workflowType: string;
  status: MigrationItemStatus;
  notes: MigrationNote[];
};

export type MigrationReport = {
  generatedAt: string;
  instanceUrl: string;
  release: string | null;
  totals: {
    categories: number;
    items: number;
    full: number;
    partial: number;
    unsupported: number;
    fields: number;
    subflows: number;
    scriptSteps: number;
  };
  items: MigrationItemReport[];
  subflows: MigrationSubflowReport[];
  warnings: string[];
};

export class NoteCollector {
  readonly notes: MigrationNote[] = [];

  add(severity: MigrationNoteSeverity, code: string, message: string, subject?: string): void {
    if (this.notes.some((n) => n.code === code && n.message === message && n.subject === subject)) return;
    this.notes.push({ severity, code, message, ...(subject ? { subject } : {}) });
  }

  info(code: string, message: string, subject?: string): void {
    this.add('info', code, message, subject);
  }

  warn(code: string, message: string, subject?: string): void {
    this.add('warning', code, message, subject);
  }

  error(code: string, message: string, subject?: string): void {
    this.add('error', code, message, subject);
  }

  status(): MigrationItemStatus {
    if (this.notes.some((n) => n.severity === 'error')) return 'unsupported';
    if (this.notes.some((n) => n.severity === 'warning')) return 'partial';
    return 'full';
  }
}
