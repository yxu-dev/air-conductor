// A stale Vite process can serve @apply without the Tailwind plugin. Never mount
// the canvas or SVG-heavy studio until the actual compiled layout is available.
export function requireStudioStyles(root) {
  const probe = document.createElement('div');
  probe.className = 'studio';
  probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:1px;overflow:hidden;';
  root.append(probe);
  const compiled = getComputedStyle(probe).display === 'grid';
  probe.remove();
  if (compiled) return;
  root.style.cssText = 'max-width:640px;margin:48px auto;padding:24px;font:16px/1.6 Arial,sans-serif;';
  root.innerHTML = '<h1 style="font-size:24px">The studio styles did not load.</h1><p>Restart the local development server, then reload this page.</p><pre style="overflow:auto">cd web\nnpm run dev -- --host 127.0.0.1 --port 5173 --strictPort</pre>';
  throw new Error('Studio styles are uncompiled. Restart Vite with the Tailwind plugin.');
}
