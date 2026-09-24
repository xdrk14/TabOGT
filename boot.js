// Runs before the stylesheet and modules: applies the last theme classes and accent so a new tab
// paints in the right colours immediately (newtab.js keeps this cache up to date).
try {
  const b = JSON.parse(localStorage.getItem('tabogt-boot') || 'null');
  if (b) {
    document.documentElement.classList.add(...b.cls);
    document.documentElement.style.setProperty('--accent', b.accent);
    for (const [k, v] of Object.entries(b.vars || {})) document.documentElement.style.setProperty(k, v);
  }
} catch { /* first run or storage disabled */ }
