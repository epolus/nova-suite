/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import DarkModeToggle from '../components/DarkModeToggle';
import { auth as authApi } from '../api/client';
import { useTranslations } from 'use-intl';

const DEFAULT_LOGO_SRC = '/default-logo.svg';

export default function Login() {
  const tAuth = useTranslations('auth.login');
  const tCommon = useTranslations('common');
  const { user, login } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoSrc, setLogoSrc] = useState(DEFAULT_LOGO_SRC);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoProvider, setSsoProvider] = useState('OpenID');
  const [localLoginEnabled, setLocalLoginEnabled] = useState(true);

  // If user is already logged in (e.g. from sso_token), redirect
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Check for SSO error in URL
  useEffect(() => {
    const ssoError = searchParams.get('sso_error');
    if (ssoError) {
      setError(decodeURIComponent(ssoError));
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  // Load SSO config
  useEffect(() => {
    authApi.ssoConfig()
      .then((cfg) => {
        setSsoEnabled(cfg.enabled);
        if (cfg.provider_name) setSsoProvider(cfg.provider_name);
        if (typeof cfg.local_login_enabled === 'boolean') {
          setLocalLoginEnabled(cfg.local_login_enabled);
        }
      })
      .catch(() => { /* SSO not available */ });
  }, []);

  useEffect(() => {
    if (!theme.logo_url) { setLogoSrc(DEFAULT_LOGO_SRC); return; }
    fetch('/api/settings/logo')
      .then((r) => { if (r.ok) return r.blob(); throw new Error(); })
      .then((blob) => setLogoSrc(URL.createObjectURL(blob)))
      .catch(() => setLogoSrc(DEFAULT_LOGO_SRC));
  }, [theme.logo_url]);

  const appNameParts = (theme.app_name || 'Nova Suite').split(' ');
  const firstName = appNameParts[0];
  const restName = appNameParts.slice(1).join(' ');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      const rawMessage = String(err?.message || '').trim();
      const isAuthFailure = rawMessage === 'Unauthorized' || rawMessage.toLowerCase().includes('401');
      setError(isAuthFailure ? tAuth('invalidCredentials') : (rawMessage || tAuth('loginFailed')));
    } finally {
      setLoading(false);
    }
  };

  const handleSsoLogin = () => {
    window.location.href = '/api/auth/sso/authorize';
  };

  return (
    <div
      className="relative min-h-full flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, var(--color-login-from), var(--color-login-to))`,
      }}
    >
      <div className="absolute top-4 right-4 z-10">
        <DarkModeToggle variant="on-dark-header" />
      </div>
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          {logoSrc && (
            <img src={logoSrc} alt="" className="w-16 h-16 mx-auto mb-4 object-contain rounded-xl" />
          )}
          <h1 className="text-4xl font-bold text-white tracking-tight">
            <span style={{ color: 'var(--color-primary)' }}>{firstName}</span>
            {restName ? ` ${restName}` : ''}
          </h1>
          <p className="mt-2 text-slate-400">{theme.app_subtitle || tAuth('serviceManagementPlatform')}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{tAuth('title')}</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SSO Button */}
          {ssoEnabled && (
            <>
              <button
                type="button"
                onClick={handleSsoLogin}
                className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                {tAuth('signInWith', { provider: ssoProvider })}
              </button>
              {localLoginEnabled && (
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 text-gray-400">{tAuth('orContinueWithPassword')}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {localLoginEnabled && (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{tAuth('email')}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm"
                    placeholder="admin@acme.local"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{tAuth('password')}</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 text-white rounded-lg font-medium text-sm hover:opacity-90 focus:ring-2 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {loading ? tAuth('signingIn') : tAuth('submit')}
                </button>
              </form>

              {/* Quick credentials hint */}
              <div className="mt-6 pt-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center mb-2">{tAuth('demoCredentials')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: tCommon('roles.admin'), email: 'admin@acme.local' },
                    { label: tCommon('roles.fulfiller'), email: 'fulfiller@acme.local' },
                    { label: tCommon('roles.user'), email: 'user@acme.local' },
                  ].map((cred) => (
                    <button
                      key={cred.email}
                      type="button"
                      onClick={() => { setEmail(cred.email); setPassword('admin123'); }}
                      className="text-xs py-1.5 px-2 bg-gray-50 hover:bg-gray-100 rounded-md text-gray-600 transition-colors"
                    >
                      {cred.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {!localLoginEnabled && !ssoEnabled && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {tAuth('localDisabledSsoMissing')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
