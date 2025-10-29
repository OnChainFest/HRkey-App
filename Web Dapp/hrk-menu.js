<script>
(function() {
  const btn   = document.getElementById('hrk-hamburger');
  const menu  = document.getElementById('hrk-mobile-menu');
  if (!btn || !menu) return;

  const openMenu  = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
  const closeMenu = () => { menu.hidden = true;  btn.setAttribute('aria-expanded', 'false'); };

  // Estado inicial
  closeMenu();

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    expanded ? closeMenu() : openMenu();
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      closeMenu();
    }
  });

  // Cerrar si pasa a desktop
  const mq = window.matchMedia('(min-width: 1025px)');
  mq.addEventListener('change', closeMenu);
})();
</script>
