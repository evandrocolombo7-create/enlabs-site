/* =========================================================
   enlabs — vendas do IA Render Lab (configuração e chamadas ao servidor)
   Contrato: docs/BILLING_API.md e docs/SITE_BRIEFING.md (repositório dos plugins).
   O site só CHAMA o servidor. Nada de Supabase além do login (chave pública) e da função "billing".
   ========================================================= */

// Chave única do lançamento. false: botões "Em breve", sem cadastro/entrar, /conta e /nova-senha levam para /planos.
// true no dia do lançamento (o Evandro avisa).
const VENDAS_ABERTAS = false;

(function () {
  var SUPABASE_URL = 'https://lmoawfwyjkguicjxwtko.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_6k8GjulhaRhUrglC5nfC5A_sLw5zAYw'; // chave PÚBLICA. Nunca a secreta.
  var SITE = 'https://enlabs.com.br';

  // "Quero ser avisado" enquanto as vendas estão fechadas (contato que o site já tem).
  var AVISO_URL = 'https://wa.me/5514998564066?text=' +
    encodeURIComponent('Olá! Quero ser avisado(a) quando o IA Render Lab abrir as vendas.');

  // Link do instalador do plugin (botão "Baixar o plugin" em /conta). Vazio = "em breve".
  var DOWNLOAD_URL = '';

  // Textos da tabela "Erros" do BILLING_API.md.
  var ERRORS = {
    session_expired: 'Sua sessão expirou. Entre de novo.',
    suspended: 'Conta suspensa. Fale com a enlabs.',
    no_account: 'Conta suspensa. Fale com a enlabs.',
    bad_plan: 'Plano indisponível. Atualize a página.',
    bad_quantity: 'Escolha de 1 a 500 moedas.',
    bad_email: 'Confira o e-mail da sua conta Mercado Pago.',
    already_subscribed: 'Você já tem um plano ativo. Cancele o atual para trocar.',
    no_subscription: 'Você não tem plano ativo.',
    payment_provider: 'O Mercado Pago não respondeu. Tente de novo em instantes.',
    server: 'Algo deu errado. Tente de novo.'
  };

  var supabasePromise = null;
  // supabase-js só é baixado quando precisa (login, conta, compra).
  function supabase() {
    if (!supabasePromise) {
      supabasePromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm')
        .then(function (m) { return m.createClient(SUPABASE_URL, SUPABASE_KEY); });
    }
    return supabasePromise;
  }

  // POST /functions/v1/billing. Erro: rejeita com o código (string), como no contrato.
  function billing(action, args) {
    var withSession = action === 'plans' ? Promise.resolve(null)
      : supabase().then(function (sb) { return sb.auth.getSession(); }).then(function (r) { return r.data.session; });
    return withSession.then(function (session) {
      var headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
      if (session) headers.Authorization = 'Bearer ' + session.access_token;
      return fetch(SUPABASE_URL + '/functions/v1/billing', {
        method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, args || {}))
      });
    }).then(function (res) {
      return res.json().catch(function () { throw 'server'; });
    }, function () { throw 'server'; }).then(function (body) {
      if (body && body.error) throw body.error.code || 'server';
      return body;
    });
  }

  function errorText(code) { return ERRORS[code] || ERRORS.server; }

  // Preços sempre do servidor (centavos → "R$ 70" ou "R$ 4,00").
  function money(cents, decimals) {
    var v = cents / 100;
    var d = decimals == null ? (Number.isInteger(v) ? 0 : 2) : decimals;
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  var plansPromise = null;
  function plans() {
    if (!plansPromise) {
      plansPromise = billing('plans').then(function (r) {
        var list = r.plans || [];
        return {
          monthly: list.filter(function (p) { return p.kind === 'monthly'; }).sort(function (a, b) { return a.coins - b.coins; }),
          coin: list.filter(function (p) { return p.kind === 'coin'; })[0] || null,
          all: list
        };
      });
      plansPromise.catch(function () { plansPromise = null; });
    }
    return plansPromise;
  }

  window.EnlabsVendas = {
    abertas: VENDAS_ABERTAS,
    site: SITE,
    avisoUrl: AVISO_URL,
    downloadUrl: DOWNLOAD_URL,
    supabase: supabase,
    billing: billing,
    plans: plans,
    money: money,
    errorText: errorText
  };

  // Marca a página para o CSS esconder o que é só de vendas abertas ([data-vendas="abertas"]) ou fechadas.
  document.documentElement.setAttribute('data-vendas', VENDAS_ABERTAS ? 'abertas' : 'fechadas');
})();
