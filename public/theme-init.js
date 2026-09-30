// Apply the saved theme before first paint so there is no flash; night is the default.
// Kept as a file (not inline) so the server can send a strict Content-Security-Policy.
(function () {
  var theme = 'dark';
  try {
    if (localStorage.getItem('shri-pharmacy-theme') === 'light') theme = 'light';
  } catch {
    /* storage unavailable: use the default */
  }
  document.documentElement.setAttribute('data-theme', theme);
  var bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.setAttribute('content', theme === 'light' ? '#f5f8fc' : '#131b2b');
})();
