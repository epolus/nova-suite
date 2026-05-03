/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { __test__ } from './notification-activities';

describe('notification locale/template helpers', () => {
  it('normalizes locale with base fallback', () => {
    expect(__test__.normalizeLocale('DE-CH')).toBe('de-ch');
    expect(__test__.normalizeLocale('de-at')).toBe('de');
    expect(__test__.normalizeLocale('xx')).toBe('');
  });

  it('resolves recipient locale with fallback chain', () => {
    const preferred = __test__.resolveRecipientLocale(
      { locale_preference: 'fr', preferred_language: 'de' },
      'it',
    );
    expect(preferred).toBe('fr');

    const fromUserLanguage = __test__.resolveRecipientLocale(
      { locale_preference: null, preferred_language: 'de-ch' },
      'it',
    );
    expect(fromUserLanguage).toBe('de-ch');

    const fromTenant = __test__.resolveRecipientLocale(
      { locale_preference: null, preferred_language: null },
      'it',
    );
    expect(fromTenant).toBe('it');
  });

  it('resolves templates by exact/base/en/default order', () => {
    const templates = [
      { locale: 'en', title_template: 'hello', body_template: 'body', body_html_template: null },
      { locale: 'de', title_template: 'hallo', body_template: 'text', body_html_template: null },
    ];

    expect(__test__.resolveTemplateForLocale(templates, 'de-ch').locale).toBe('de');
    expect(__test__.resolveTemplateForLocale(templates, 'fr').locale).toBe('en');
    expect(__test__.resolveTemplateForLocale(templates, 'de').template.title_template).toBe('hallo');
  });

  it('converts html to text and renders placeholders', () => {
    expect(__test__.toPlainTextFromHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    expect(__test__.renderTemplate('Ticket {entity_number}', { entity_number: 'INC001' })).toBe('Ticket INC001');
  });
});

