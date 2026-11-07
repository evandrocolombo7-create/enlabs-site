/* Menu do celular e links "Quero ser avisado" das páginas de vendas (/planos, /termos). */
(function () {
  var toggle = document.querySelector('[data-nav-toggle]');
  var links = document.querySelector('[data-nav-links]');
  if (toggle && links) {
    var setMenu = function (open) {
      toggle.classList.toggle('is-open', open);
      links.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    toggle.addEventListener('click', function () { setMenu(!links.classList.contains('is-open')); });
    links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  }
  if (window.EnlabsVendas) {
    document.querySelectorAll('[data-aviso]').forEach(function (a) { a.href = window.EnlabsVendas.avisoUrl; });
  }
})();
