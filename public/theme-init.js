// Apply the saved theme before first paint so there is no flash; day (light) is the default.
// Kept as a file (not inline) so the server can send a strict Content-Security-Policy.
(function () {
  var theme = 'light';
  try {
    // Only a theme someone picked is stored (see PharmacyApp.tsx).
    if (localStorage.getItem('shri-pharmacy-theme-choice') === 'dark') theme = 'dark';
  } catch {
    /* storage unavailable: use the default */
  }
  document.documentElement.setAttribute('data-theme', theme);
  var bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.setAttribute('content', theme === 'light' ? '#f5f8fc' : '#131b2b');
})();
