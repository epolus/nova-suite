/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { settings as settingsApi, type ThemeSettings } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { normalizeCurrencyCode } from '../../utils/currency';
import { ColorInput } from './ThemingColorInput';
import { COLOR_FIELDS, DARK_COLOR_FIELDS } from './themingFields';

const DEFAULT_LOGO_SRC = '/default-logo.svg';

export default function ThemingPage() {
  const t = useTranslations('pages.admin.theming');
  const tActions = useTranslations('common.actions');
  const { reload } = useTheme();
  const [form, setForm] = useState<Partial<ThemeSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>(DEFAULT_LOGO_SRC);
  const [hasLogo, setHasLogo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    settingsApi.get().then((res) => {
      setForm(res.settings);
      setHasLogo(!!res.settings.logo_url);
      setLoading(false);
    });
    // Load logo preview
    const token = localStorage.getItem('nova_token');
    fetch('/api/settings/logo', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => { if (r.ok) return r.blob(); throw new Error(); })
      .then((blob) => setLogoPreview(URL.createObjectURL(blob)))
      .catch(() => setLogoPreview(DEFAULT_LOGO_SRC));
  }, []);


  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await settingsApi.update(form);
      reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      await settingsApi.uploadLogo(file);
      setHasLogo(true);
      const blob = new Blob([file], { type: file.type });
      setLogoPreview(URL.createObjectURL(blob));
      reload();
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoDelete = async () => {
    setUploadingLogo(true);
    try {
      await settingsApi.deleteLogo();
      setHasLogo(false);
      setLogoPreview(DEFAULT_LOGO_SRC);
      reload();
    } finally {
      setUploadingLogo(false);
    }
  };

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetDarkDefaults = () => {
    setForm((prev) => {
      const next = { ...prev };
      DARK_COLOR_FIELDS.forEach((field) => {
        next[field.key] = field.default;
      });
      return next;
    });
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* App Identity */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{t('applicationIdentity')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('appName')}</label>
                <input
                  type="text"
                  value={form.app_name || ''}
                  onChange={(e) => setField('app_name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={t('appNamePlaceholder')}
                />
                <p className="text-xs text-gray-400 mt-1">{t('appNameHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('subtitle')}</label>
                <input
                  type="text"
                  value={form.app_subtitle || ''}
                  onChange={(e) => setField('app_subtitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={t('subtitlePlaceholder')}
                />
                <p className="text-xs text-gray-400 mt-1">{t('subtitleHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('catalogCurrency')}</label>
                <input
                  type="text"
                  value={form.catalog_currency || 'USD'}
                  onChange={(e) => setField('catalog_currency', normalizeCurrencyCode(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase"
                  placeholder={t('catalogCurrencyPlaceholder')}
                  maxLength={8}
                />
                <p className="text-xs text-gray-400 mt-1">{t('catalogCurrencyHint')}</p>
              </div>
            </div>
          </Card>

          {/* Logo */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{t('logo')}</h3>
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 flex-shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt={t('logoAlt')} className="w-full h-full object-contain p-2" />
                ) : (
                  <span className="text-3xl text-gray-300">🖼️</span>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  {t('logoHint')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingLogo}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {uploadingLogo ? t('uploading') : t('uploadLogo')}
                  </button>
                  {hasLogo && (
                    <button
                      onClick={handleLogoDelete}
                      disabled={uploadingLogo}
                      className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {tActions('remove')}
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </Card>

          {/* Colors */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{t('colorsTitle')}</h3>
            <div className="space-y-4">
              {COLOR_FIELDS.map((cf) => (
                <ColorInput
                  key={cf.key}
                  label={t(`colors.${cf.labelKey}.label`)}
                  description={t(`colors.${cf.labelKey}.description`)}
                  value={(form[cf.key] as string) || cf.default}
                  onChange={(v) => setField(cf.key, v)}
                />
              ))}
            </div>
          </Card>

          {/* Dark mode colors */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-1">{t('darkModeColors')}</h3>
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="text-xs text-gray-500">
                {t('darkModeHint')}
              </p>
              <button
                type="button"
                onClick={resetDarkDefaults}
                className="shrink-0 px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                {t('resetDarkDefaults')}
              </button>
            </div>
            <div className="space-y-4">
              {DARK_COLOR_FIELDS.map((cf) => (
                <ColorInput
                  key={cf.key}
                  label={t(`colors.${cf.labelKey}.label`)}
                  description={t(`colors.${cf.labelKey}.description`)}
                  value={(form[cf.key] as string) || cf.default}
                  onChange={(v) => setField(cf.key, v)}
                />
              ))}
            </div>
          </Card>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : tActions('save')}
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-medium">{t('saved')}</span>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{t('preview')}</h3>

            {/* Sidebar preview */}
            <div
              className="rounded-xl overflow-hidden shadow-lg"
              style={{ backgroundColor: form.sidebar_bg || '#0f172a' }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex items-center gap-2">
                  {logoPreview && (
                    <img src={logoPreview} alt="" className="w-6 h-6 object-contain rounded" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      <span style={{ color: form.primary_color || '#4f46e5' }}>
                        {(form.app_name || t('defaultAppName')).split(' ')[0]}
                      </span>
                      {' '}
                      {(form.app_name || t('defaultAppName')).split(' ').slice(1).join(' ')}
                    </h4>
                    <p className="text-[10px] text-gray-400">{form.app_subtitle || t('defaultSubtitle')}</p>
                  </div>
                </div>
              </div>
              <div className="p-2 space-y-0.5">
                <div
                  className="px-3 py-2 rounded-md text-xs font-medium text-white"
                  style={{ backgroundColor: form.sidebar_active_bg || '#4f46e5' }}
                >
                  {t('previewNav.dashboard')}
                </div>
                <div className="px-3 py-2 rounded-md text-xs font-medium text-gray-400">
                  {t('previewNav.myTodo')}
                </div>
                <div className="px-3 py-2 rounded-md text-xs font-medium text-gray-400">
                  {t('previewNav.incidents')}
                </div>
              </div>
            </div>

            {/* Login preview */}
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">{t('loginPageBackground')}</p>
              <div
                className="rounded-xl h-24 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${form.login_bg_from || '#0f172a'}, ${form.login_bg_to || '#1e1b4b'})`,
                }}
              >
                <div className="text-center">
                  <p className="text-sm font-bold text-white">
                    <span style={{ color: form.primary_color || '#4f46e5' }}>
                      {(form.app_name || t('defaultAppName')).split(' ')[0]}
                    </span>
                    {' '}
                    {(form.app_name || t('defaultAppName')).split(' ').slice(1).join(' ')}
                  </p>
                  <p className="text-[10px] text-gray-400">{form.app_subtitle || t('defaultSubtitle')}</p>
                </div>
              </div>
            </div>

            {/* Button preview */}
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">{t('buttonPreview')}</p>
              <button
                className="px-4 py-2 text-white rounded-lg text-sm font-medium"
                style={{ backgroundColor: form.primary_color || '#4f46e5' }}
              >
                {t('primaryButton')}
              </button>
            </div>

            {/* Dark mode preview */}
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">{t('darkModePreview')}</p>
              <div
                className="rounded-xl p-3 border"
                style={{
                  backgroundColor: form.dark_content_bg || '#0b1220',
                  borderColor: form.dark_border_color || '#475569',
                }}
              >
                <div
                  className="rounded-lg p-3 border"
                  style={{
                    backgroundColor: form.dark_surface_bg || '#1e293b',
                    borderColor: form.dark_border_color || '#475569',
                  }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: form.dark_text_primary || '#f1f5f9' }}
                  >
                    {t('incidentInsights')}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: form.dark_text_muted || '#94a3b8' }}
                  >
                    {t('similarIncidents')}
                  </p>
                  <div
                    className="mt-3 rounded px-2 py-1 text-xs"
                    style={{
                      backgroundColor: form.dark_muted_bg || '#111827',
                      color: form.dark_text_primary || '#f1f5f9',
                    }}
                  >
                    {t('exampleInputSurface')}
                  </div>
                </div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </>
  );
}
