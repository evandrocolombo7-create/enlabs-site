/* =========================================================
   Planos e moedas avulsas — desenhados a partir da ação "plans" (nunca preço fixo no HTML).
   Marcadores na página:
     [data-plans-monthly]  cartões dos planos mensais
     [data-plan-coin]      moeda avulsa com calculadora de quantidade
     [data-coin-price]     texto com o preço de uma moeda avulsa (ex.: "R$ 4,00")
   ========================================================= */
(function () {
  var V = window.EnlabsVendas;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function ctaSoon(label) {
    return '<a class="ec-btn" href="' + V.avisoUrl + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' +
      '<span class="tz-plan-soon">Vendas em breve</span>';
  }

  function monthlyCard(p) {
    var perCoin = Math.round(p.price_cents / p.coins);
    var cta = V.abertas
      ? '<a class="ec-btn" href="/conta?assinar=' + encodeURIComponent(p.id) + '">Assinar plano</a>'
      : ctaSoon('Quero ser avisado');
    return '<article class="tz-plan">' +
      '<span class="ec-label">/ plano mensal</span>' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<p class="tz-plan-price">' + V.money(p.price_cents).replace('R$ ', '<span>R$</span>') + '<small>/mês</small></p>' +
      '<p class="tz-plan-coins"><strong>' + p.coins + ' moedas</strong> por mês</p>' +
      '<ul>' +
        '<li>' + p.coins + ' imagens em 1K, ' + Math.floor(p.coins / 2) + ' em 2K ou ' + Math.floor(p.coins / 4) + ' em 4K</li>' +
        '<li>' + V.money(perCoin, 2) + ' por moeda</li>' +
        '<li>Renova todo mês no cartão; a sobra do mês zera</li>' +
      '</ul>' + cta + '</article>';
  }

  function coinCard(c) {
    var cta = V.abertas
      ? '<a class="ec-btn" href="/conta?comprar=10" data-coin-buy>Comprar moedas</a>'
      : ctaSoon('Quero ser avisado');
    return '<article class="tz-plan tz-plan--coin">' +
      '<span class="ec-label">/ avulsas</span>' +
      '<h3>' + esc(c.name) + '</h3>' +
      '<p class="tz-plan-price">' + V.money(c.price_cents, 2).replace('R$ ', '<span>R$</span>') + '<small>/moeda</small></p>' +
      '<p class="tz-plan-coins"><strong>Não expiram.</strong> Pix ou cartão.</p>' +
      '<label class="tz-calc"><span class="ec-label">Quantidade</span>' +
        '<input type="number" min="1" max="500" step="1" value="10" inputmode="numeric" data-coin-qty></label>' +
      '<p class="tz-calc-total" data-coin-total></p>' +
      '<ul><li>Sem mensalidade</li><li>Somam com as moedas do plano</li></ul>' + cta + '</article>';
  }

  function wireCalc(root, c) {
    var input = root.querySelector('[data-coin-qty]');
    var total = root.querySelector('[data-coin-total]');
    var buy = root.querySelector('[data-coin-buy]');
    function update() {
      var q = Math.max(1, Math.min(500, parseInt(input.value, 10) || 1));
      total.innerHTML = q + (q === 1 ? ' moeda' : ' moedas') + ' = <b>' + V.money(q * c.price_cents, 2) + '</b>';
      if (buy) buy.href = '/conta?comprar=' + q;
    }
    input.addEventListener('input', update);
    input.addEventListener('blur', function () { input.value = Math.max(1, Math.min(500, parseInt(input.value, 10) || 1)); update(); });
    update();
  }

  function fail(el) {
    el.innerHTML = '<p class="tz-plans-error">Não foi possível carregar os preços agora. Atualize a página.</p>';
  }

  var monthlyEl = document.querySelector('[data-plans-monthly]');
  var coinEl = document.querySelector('[data-plan-coin]');
  if (!monthlyEl && !coinEl && !document.querySelector('[data-coin-price]')) return;

  V.plans().then(function (p) {
    if (monthlyEl) monthlyEl.innerHTML = p.monthly.map(monthlyCard).join('') + (coinEl || !p.coin ? '' : coinCard(p.coin));
    if (coinEl && p.coin) { coinEl.innerHTML = coinCard(p.coin); }
    var calcRoot = document.querySelector('.tz-plan--coin');
    if (calcRoot && p.coin) wireCalc(calcRoot, p.coin);
    document.querySelectorAll('[data-coin-price]').forEach(function (el) { if (p.coin) el.textContent = V.money(p.coin.price_cents, 2); });
  }).catch(function () {
    if (monthlyEl) fail(monthlyEl);
    if (coinEl) coinEl.innerHTML = '';
  });
})();
