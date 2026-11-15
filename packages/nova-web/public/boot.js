/* SPDX-License-Identifier: AGPL-3.0-only */
// Runs before the app bundle to avoid a light-mode / wrong-language flash.
// Kept as a file (not inline) so the Content-Security-Policy can forbid inline scripts.
try {
  if (localStorage.getItem('nova_dark_mode') === 'true') {
    document.documentElement.classList.add('dark');
  }
  var locale = localStorage.getItem('nova_locale');
  if (locale) {
    document.documentElement.lang = locale;
  }
} catch (_) {
  // storage unavailable
}
