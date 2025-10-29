<script>
(function() {
  const btn  = document.getElementById('hrk-hamburger');
  const menu = document.getElementById('hrk-mobile-menu');
  if (!btn || !menu) return;

  const openMenu  = () => { menu.classList.add('is-open');  btn.setAttribute('aria-expanded','true'); };
  const closeMenu = () => { menu.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); };

  // Estado inicial cerrado
  closeMenu();

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    expanded ? closeMenu() : openMenu();
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', (e) => {
    if (menu.classList.contains('is-open') && !menu.contains(e.target) && !btn.contains(e.target)) {
      closeMenu();
    }
  });

  // Cerrar al pasar a desktop
  const mq = window.matchMedia('(min-width: 1025px)');
  mq.addEventListener('change', closeMenu);
})();
</script>

