/* =========================================================
   /conta — entrar, cadastro, esqueci a senha e "minha conta"
   Conta: supabase-js (chave pública). Moedas e pagamentos: função "billing" (BILLING_API.md).
   Só roda com VENDAS_ABERTAS = true (com false, conta.html já redirecionou para /planos).
   ========================================================= */
(function () {
  var V = window.EnlabsVendas;
  if (!V || !V.abertas) return;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var AUTH = ['entrar', 'cadastro', 'esqueci', 'enviado'];
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var params = new URLSearchParams(location.search);
  var wantPlan = params.get('assinar');
  var wantQty = parseInt(params.get('comprar'), 10) || null;
  var payment = params.get('pagamento');
  if (payment || wantPlan || wantQty) history.replaceState(null, '', location.pathname + location.hash);

  var sb = null, session = null, me = null, plans = null, pollTimer = null;

  // ---------- formatação ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function dateLong(iso) { var d = new Date(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function dateShort(iso) { var d = new Date(iso); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function coins(n) { return n + (Math.abs(n) === 1 ? ' moeda' : ' moedas'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bind(name, text) { $$('[data-bind="' + name + '"]').forEach(function (el) { el.textContent = text; }); }

  // Mensagens do Supabase Auth em português.
  function authError(err) {
    var m = String((err && (err.message || err.code)) || '').toLowerCase();
    if (m.indexOf('invalid login') >= 0) return 'E-mail ou senha incorretos.';
    if (m.indexOf('not confirmed') >= 0) return 'Confirme o seu e-mail antes de entrar. Procure a mensagem da enlabs na caixa de entrada ou no spam.';
    if (m.indexOf('signup') >= 0 && m.indexOf('disabled') >= 0 || m.indexOf('signups not allowed') >= 0) return 'O cadastro ainda não está aberto.';
    if (m.indexOf('already registered') >= 0) return 'Este e-mail já tem conta. Entre ou use "Esqueci a senha".';
    if (m.indexOf('password') >= 0 && (m.indexOf('least') >= 0 || m.indexOf('weak') >= 0)) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (m.indexOf('rate limit') >= 0 || m.indexOf('too many') >= 0) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    if (m.indexOf('same password') >= 0 || m.indexOf('different from the old') >= 0) return 'A nova senha precisa ser diferente da atual.';
    return 'Algo deu errado. Tente de novo.';
  }

  // ---------- navegação ----------
  function route() {
    if (session) { showAccount(); return; }
    var view = (location.hash || '').slice(1);
    if (AUTH.indexOf(view) < 0) view = wantPlan ? 'cadastro' : 'entrar';
    showAuth(view);
  }

  function showAuth(view) {
    $('[data-view="conta"]').hidden = true;
    $('[data-view="auth"]').hidden = false;
    $$('[data-when="in"]').forEach(function (el) { el.hidden = true; });
    $$('[data-when="out"]').forEach(function (el) { el.hidden = false; });
    $$('[data-form]', $('[data-view="auth"]')).forEach(function (f) { f.hidden = f.getAttribute('data-form') !== view; });
    $$('[data-auth-tabs] a').forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('data-tab') === view); });
    $('[data-auth-tabs]').hidden = view === 'esqueci' || view === 'enviado';
    var t = {
      entrar: ['Entre na sua conta.', 'Saldo de moedas, plano, pagamentos e download do plugin. É a mesma conta do plugin.'],
      cadastro: ['Crie a sua conta.', 'Um cadastro para o site e para o plugin. Depois você escolhe o plano ou compra moedas no Mercado Pago.'],
      esqueci: ['Recupere o acesso.', 'O link chega em alguns minutos. Confira também a caixa de spam.'],
      enviado: ['Quase lá.', 'Siga o link que enviamos por e-mail para continuar.']
    }[view];
    $('[data-auth-title]').textContent = t[0];
    $('[data-auth-lede]').textContent = t[1];
    showChosen(view);
    var first = $('[data-form="' + view + '"] input');
    if (first && window.innerWidth > 820) first.focus();
  }

  function showChosen(view) {
    var box = $('[data-chosen]');
    box.hidden = true;
    if (view === 'esqueci' || (!wantPlan && !wantQty)) return;
    V.plans().then(function (p) {
      if (wantPlan) {
        var plan = p.monthly.filter(function (x) { return x.id === wantPlan; })[0];
        if (!plan) return;
        $('[data-chosen-label]').textContent = 'Plano escolhido';
        $('[data-chosen-name]').textContent = plan.name;
        $('[data-chosen-price]').textContent = V.money(plan.price_cents) + '/mês';
        $('[data-chosen-coins]').textContent = coins(plan.coins) + ' por mês';
      } else if (p.coin) {
        $('[data-chosen-label]').textContent = 'Moedas avulsas';
        $('[data-chosen-name]').textContent = coins(wantQty);
        $('[data-chosen-price]').textContent = V.money(wantQty * p.coin.price_cents, 2);
        $('[data-chosen-coins]').textContent = 'Pix ou cartão · não expiram';
      }
      box.hidden = false;
    }).catch(function () {});
  }

  function showAccount() {
    $('[data-view="auth"]').hidden = true;
    $('[data-view="conta"]').hidden = false;
    $$('[data-when="in"]').forEach(function (el) { el.hidden = false; });
    $$('[data-when="out"]').forEach(function (el) { el.hidden = true; });
  }

  window.addEventListener('hashchange', function () { if (!session) route(); });

  // ---------- formulários ----------
  function setMsg(form, text, kind) {
    var m = $('[data-msg]', form);
    m.textContent = text || '';
    m.className = 'ct-msg' + (kind ? ' is-' + kind : '');
  }
  function busy(form, on) { $$('button', form).forEach(function (b) { if (b.value !== 'cancel') b.disabled = on; }); }
  function onSubmit(name, h) {
    var form = $('[data-form="' + name + '"]');
    form.addEventListener('submit', function (ev) {
      if (ev.submitter && ev.submitter.value === 'cancel') return; // "Voltar" do diálogo fecha normalmente
      ev.preventDefault();
      setMsg(form, '');
      var problem = h.validate && h.validate(form);
      if (problem) { setMsg(form, problem, 'error'); return; }
      busy(form, true);
      Promise.resolve().then(function () { return h.send(form); })
        .then(function (r) { return h.done && h.done(form, r); })
        .catch(function (err) { setMsg(form, h.error ? h.error(err) : authError(err), 'error'); })
        .then(function () { busy(form, false); });
    });
  }
  function authCall(p) { return p.then(function (r) { if (r.error) throw r.error; return r.data; }); }

  onSubmit('entrar', {
    validate: function (f) {
      if (!EMAIL.test(f.email.value.trim())) return 'Confira o e-mail.';
      if (!f.password.value) return 'Digite a senha.';
    },
    send: function (f) { return authCall(sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value })); },
    done: function (f) { f.reset(); }
  });

  onSubmit('cadastro', {
    validate: function (f) {
      if (!EMAIL.test(f.email.value.trim())) return 'Confira o e-mail.';
      if (f.password.value.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
      if (!f.terms.checked) return 'Para criar a conta, aceite os termos de uso e o aviso de privacidade.';
    },
    send: function (f) {
      return authCall(sb.auth.signUp({
        email: f.email.value.trim(), password: f.password.value,
        options: { emailRedirectTo: V.site + '/conta' }
      }));
    },
    done: function (f, data) {
      var email = f.email.value.trim();
      f.reset();
      if (data && data.session) return; // confirmação desligada no servidor: já entrou
      $('[data-done-title]').textContent = 'Confira o seu e-mail.';
      $('[data-done-text]').textContent = 'Enviamos um link de confirmação para ' + email + '. Depois de confirmar, você volta para esta página já com a conta aberta.';
      location.hash = 'enviado';
    }
  });

  onSubmit('esqueci', {
    validate: function (f) { if (!EMAIL.test(f.email.value.trim())) return 'Confira o e-mail.'; },
    send: function (f) { return authCall(sb.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: V.site + '/nova-senha' })); },
    done: function (f) {
      var email = f.email.value.trim();
      f.reset();
      $('[data-done-title]').textContent = 'Link enviado.';
      $('[data-done-text]').textContent = 'Se existir uma conta com ' + email + ', o link para criar uma senha nova chega em alguns minutos.';
      location.hash = 'enviado';
    }
  });

  onSubmit('senha', {
    validate: function (f) {
      if (f.password.value.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
      if (f.password.value !== f.password2.value) return 'As duas senhas não são iguais.';
    },
    send: function (f) { return authCall(sb.auth.updateUser({ password: f.password.value })); },
    done: function (f) { f.reset(); setMsg(f, 'Senha alterada. Use a nova senha também no plugin.', 'ok'); }
  });

  onSubmit('comprar', {
    validate: function (f) {
      var q = parseInt(f.quantity.value, 10);
      if (!(q >= 1 && q <= 500)) return V.errorText('bad_quantity');
    },
    send: function (f) { return V.billing('buy_coins', { quantity: parseInt(f.quantity.value, 10) }); },
    done: function (f, r) { location.href = r.checkout_url; },
    error: billingError
  });

  var subDialog = $('[data-subscribe-dialog]');
  var subPlan = null;
  onSubmit('assinar', {
    validate: function (f) { if (!EMAIL.test(f.payer_email.value.trim())) return V.errorText('bad_email'); },
    send: function (f) { return V.billing('subscribe', { plan_id: subPlan.id, payer_email: f.payer_email.value.trim() }); },
    done: function (f, r) { location.href = r.checkout_url; },
    error: billingError
  });

  function billingError(code) {
    if (code === 'session_expired') { sb.auth.signOut(); }
    return V.errorText(typeof code === 'string' ? code : 'server');
  }

  function openSubscribe(plan) {
    subPlan = plan;
    var f = $('[data-form="assinar"]');
    setMsg(f, '');
    $('[data-sub-title]').textContent = plan.name + ' · ' + V.money(plan.price_cents) + '/mês';
    $('[data-sub-text]').textContent = coins(plan.coins) + ' por mês, cobradas no cartão todo mês. Você conclui o pagamento no Mercado Pago e volta para cá.';
    f.payer_email.value = (me && me.email) || '';
    if (subDialog.showModal) subDialog.showModal(); else subDialog.setAttribute('open', '');
  }

  $('[data-action="logout"]').addEventListener('click', function () { sb.auth.signOut(); });

  // ---------- minha conta ----------
  function loadAccount(silent) {
    if (!silent) { $('[data-loading]').hidden = false; $('[data-account]').hidden = true; }
    return Promise.all([V.billing('me'), V.plans().catch(function () { return null; })])
      .then(function (r) {
        me = r[0]; plans = r[1];
        renderAccount();
        $('[data-loading]').hidden = true;
        $('[data-account]').hidden = false;
      })
      .catch(function (code) {
        if (code === 'session_expired') { sb.auth.signOut(); return; }
        $('[data-loading]').textContent = V.errorText(code);
      });
  }

  function renderAccount() {
    bind('email', me.email);
    bind('balance', me.balance);
    bind('balanceHint', coins(me.balance) + ' para gerar · 1K = 1, 2K = 2, 4K = 4');
    bind('monthly', me.monthly);
    bind('monthlyHint', me.monthly > 0 && me.monthly_expires_at ? 'Valem até ' + dateLong(me.monthly_expires_at) + '.' : 'Sem moedas do plano agora.');
    bind('extra', me.extra);
    bind('status', me.status === 'active' ? 'Ativa' : 'Suspensa. Fale com a enlabs.');
    bind('device', me.device ? 'Ligada a um computador' : 'Ainda não usada em nenhum computador');
    renderSub();
    renderPlans();
    renderPayments();
    renderBuyTotal();
  }

  function renderSub() {
    var s = me.subscription, el = $('[data-sub]');
    if (!s) {
      el.innerHTML = '<div class="ct-sub"><p class="ct-sub-name">Sem plano</p>' +
        '<p class="ct-sub-line">Assine um plano para receber moedas todo mês, ou compre moedas avulsas ao lado.</p></div>';
      return;
    }
    var st = { authorized: ['Ativo', true], pending: ['Aguardando o 1º pagamento', false], paused: ['Pausado', false] }[s.status] || [s.status, false];
    var lines = '<p class="ct-sub-line"><b>' + coins(s.coins) + '</b> por mês · ' + V.money(s.price_cents) + '/mês</p>';
    if (s.next_payment_date && s.status === 'authorized') lines += '<p class="ct-sub-line">Próxima cobrança em <b>' + dateLong(s.next_payment_date) + '</b></p>';
    if (s.status === 'pending') lines += '<p class="ct-sub-line">Se você não concluiu o pagamento no Mercado Pago, cancele e assine de novo.</p>';
    el.innerHTML = '<div class="ct-sub"><span class="ct-badge' + (st[1] ? ' ct-badge--on' : '') + '">' + st[0] + '</span>' +
      '<p class="ct-sub-name">' + esc(s.name) + '</p>' + lines +
      '<p class="ct-sub-line">Para trocar de plano, cancele o atual e assine o novo.</p></div>' +
      '<div class="ct-actions"><button class="ct-link" type="button" data-cancel>Cancelar plano</button></div>';
  }

  function renderPlans() {
    var box = $('[data-plans-box]');
    box.hidden = !!me.subscription || !plans;
    if (box.hidden) return;
    $('[data-plans]').innerHTML = plans.monthly.map(function (p) {
      return '<article class="ct-plan">' +
        '<span class="ec-label">/ plano mensal</span><h3>' + esc(p.name) + '</h3>' +
        '<p class="ct-plan-price">' + V.money(p.price_cents) + '<small>/mês</small></p>' +
        '<p><b class="ct-strong-inline">' + coins(p.coins) + '</b> por mês · ' + V.money(Math.round(p.price_cents / p.coins), 2) + ' por moeda</p>' +
        '<button class="ec-btn' + (p.id === wantPlan ? ' ec-btn--primary' : '') + '" type="button" data-subscribe="' + esc(p.id) + '">Assinar ' + esc(p.name) + '</button>' +
        '</article>';
    }).join('');
  }

  var PAY_STATUS = {
    approved: 'Aprovado', pending: 'Pendente', in_process: 'Em análise', authorized: 'Autorizado',
    rejected: 'Recusado', cancelled: 'Cancelado', refunded: 'Estornado', charged_back: 'Contestado'
  };
  function renderPayments() {
    var list = me.payments || [];
    if (!list.length) { $('[data-payments]').innerHTML = '<p class="ct-empty">Nenhum pagamento ainda.</p>'; return; }
    $('[data-payments]').innerHTML = '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>' +
      '<th>Data</th><th>Compra</th><th>Situação</th><th class="ct-num">Moedas</th><th class="ct-num">Valor</th></tr></thead><tbody>' +
      list.map(function (p) {
        var ok = p.status === 'approved';
        var credit = ok ? (p.credited ? ' · moedas creditadas' : ' · creditando…') : '';
        return '<tr><td>' + dateShort(p.created_at) + '</td>' +
          '<td class="ct-strong">' + (p.kind === 'subscription' ? 'Plano mensal' : 'Moedas avulsas') + '</td>' +
          '<td><span class="ct-dot' + (ok && p.credited ? ' ct-dot--ok' : '') + '"></span>' + (PAY_STATUS[p.status] || esc(p.status)) + credit + '</td>' +
          '<td class="ct-num">' + (p.coins != null ? '+' + p.coins : '—') + '</td>' +
          '<td class="ct-num">' + (p.amount_cents != null ? V.money(p.amount_cents, 2) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  var qty = $('[data-form="comprar"]').quantity;
  if (wantQty) qty.value = Math.max(1, Math.min(500, wantQty));
  function renderBuyTotal() {
    var q = Math.max(1, Math.min(500, parseInt(qty.value, 10) || 1));
    $('[data-buy-total]').innerHTML = plans && plans.coin
      ? coins(q) + ' = <b class="ct-strong-inline">' + V.money(q * plans.coin.price_cents, 2) + '</b>' : '';
  }
  qty.addEventListener('input', renderBuyTotal);

  // volta do Mercado Pago
  function showPaymentReturn() {
    var el = $('[data-alert]');
    var msg = {
      aprovado: 'Pagamento recebido. Suas moedas aparecem em instantes.',
      pendente: 'Pagamento pendente. As moedas entram assim que o Mercado Pago confirmar.',
      recusado: 'O pagamento foi recusado pelo Mercado Pago. Tente de novo com outro cartão ou com Pix.'
    }[payment];
    if (!msg) return;
    el.innerHTML = '<p>' + msg + '</p>';
    el.hidden = false;
    if (payment === 'aprovado') {
      var tries = 0;
      pollTimer = setInterval(function () {
        tries++;
        loadAccount(true);
        if (tries >= 12) {
          clearInterval(pollTimer);
          el.innerHTML = '<p>Se as moedas ainda não apareceram, atualize a página em alguns minutos. O Pix às vezes demora mais.</p>';
        }
      }, 5000);
    }
  }

  // ---------- diálogos e botões ----------
  var dialog = $('[data-dialog]');
  function confirmBox(label, title, text, ok) {
    return new Promise(function (resolve) {
      $('[data-dialog-label]').textContent = label;
      $('[data-dialog-title]').textContent = title;
      $('[data-dialog-text]').textContent = text;
      $('[data-dialog-ok]').textContent = ok;
      if (!dialog.showModal) { resolve(window.confirm(title + '\n\n' + text)); return; }
      dialog.returnValue = '';
      dialog.onclose = function () { resolve(dialog.returnValue === 'ok'); };
      dialog.showModal();
    });
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-subscribe],[data-cancel],[data-download]');
    if (!t || !me) return;
    ev.preventDefault();
    if (t.hasAttribute('data-subscribe')) {
      var plan = plans.monthly.filter(function (p) { return p.id === t.getAttribute('data-subscribe'); })[0];
      if (plan) openSubscribe(plan);
    } else if (t.hasAttribute('data-cancel')) {
      var until = me.monthly_expires_at ? dateLong(me.monthly_expires_at) : 'o fim do ciclo';
      confirmBox('Cancelar plano', 'Cancelar o plano?',
        'O plano não renova mais. As moedas do mês continuam valendo até ' + until + ', e as avulsas não expiram.', 'Cancelar plano')
        .then(function (ok) {
          if (!ok) return;
          t.disabled = true;
          return V.billing('cancel_subscription').then(function () { return loadAccount(true); })
            .catch(function (code) { confirmBox('Aviso', 'Não deu certo.', billingError(code), 'Entendi'); })
            .then(function () { t.disabled = false; });
        });
    } else if (t.hasAttribute('data-download')) {
      if (V.downloadUrl) location.href = V.downloadUrl;
      else confirmBox('Plugin', 'Download em breve.', 'O link do instalador entra aqui no lançamento.', 'Entendi');
    }
  });

  // ---------- início ----------
  V.supabase().then(function (client) {
    sb = client;
    sb.auth.onAuthStateChange(function (event, s) {
      var was = !!session;
      session = s;
      if (s && !was) {
        route();
        loadAccount().then(function () {
          showPaymentReturn();
          if (wantPlan && me && !me.subscription && plans) {
            var plan = plans.monthly.filter(function (p) { return p.id === wantPlan; })[0];
            if (plan) openSubscribe(plan);
          } else if (wantQty) {
            var buy = $('#comprar'); if (buy) buy.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      } else if (!s && was) {
        me = null;
        if (pollTimer) clearInterval(pollTimer);
        location.hash = 'entrar';
        route();
      }
    });
    return sb.auth.getSession();
  }).then(function (r) {
    if (!r.data.session) route(); // logado: o onAuthStateChange já abriu a conta
  }).catch(function () {
    $('[data-view="auth"]').hidden = false;
    $('[data-auth-title]').textContent = 'Não foi possível carregar.';
    $('[data-auth-lede]').textContent = 'Verifique a conexão e atualize a página.';
  });
})();
