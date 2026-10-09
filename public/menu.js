// Menu principal: so quem tem a senha do admin entra. Daqui saem os links de cada ativacao.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var ACTS = [
    { id: 'peixes', title: 'Ativação Peixes São Carlos' },
    { id: 'aves', title: 'Ativação Aves São Carlos' },
    { id: 'projeta', title: 'Ativação Projeta 2026' }
  ];

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function show(nodes) { app.innerHTML = ''; nodes.forEach(function (n) { app.appendChild(n); }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function post(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Erro ' + r.status); return j; }); });
  }
  function copy(text, btn) {
    function done() { var old = btn.textContent; btn.textContent = 'Copiado'; setTimeout(function () { btn.textContent = old; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copie o link:', text); });
    else window.prompt('Copie o link:', text);
  }

  function login(msg) {
    var pw = el('input', { class: 'pw', type: 'password', placeholder: 'Senha', autofocus: '' });
    var err = el('p', { class: 'err', text: msg || '' });
    function go() {
      post('/api/login', { password: pw.value }).then(menu).catch(function (e) { err.textContent = e.message; pw.select(); });
    }
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    show([
      el('img', { class: 'logo', src: 'img/logo.png', alt: 'Terra da Gente' }), el('div', { class: 'rule' }),
      el('p', { class: 'eyebrow', text: 'Menu principal' }), pw, err,
      el('div', { class: 'actions' }, [el('button', { text: 'Entrar', onclick: go })])
    ]);
    setTimeout(function () { try { pw.focus(); } catch (e) {} }, 50);
  }

  function menu() {
    var rows = ACTS.map(function (a, i) {
      var link = location.origin + '/' + a.id;
      var small = el('small', {}, [el('code', { text: '/' + a.id })]);
      var title = el('b', { text: a.title });
      // pega o titulo e a quantidade de quizzes reais da ativacao
      fetch('/api/activation?id=' + a.id).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j) return;
        title.textContent = j.title || a.title;
        small.textContent = '';
        small.appendChild(el('code', { text: '/' + a.id }));
        small.appendChild(document.createTextNode('  ·  ' + j.quizzes.length + (j.quizzes.length === 1 ? ' quiz' : ' quizzes')));
      }).catch(function () {});
      var main = el('button', { class: 'main', onclick: function () { location.href = '/' + a.id; } }, [
        el('span', { class: 'num', text: pad(i + 1) }), el('span', { class: 'label' }, [title, small]), el('span', { class: 'chev' })
      ]);
      var cp = el('button', { class: 'copy', text: 'Copiar link' });
      cp.addEventListener('click', function () { copy(link, cp); });
      return el('div', { class: 'mrow' }, [main, cp]);
    });
    show([
      el('img', { class: 'logo', src: 'img/logo.png', alt: 'Terra da Gente' }), el('div', { class: 'rule' }),
      el('p', { class: 'eyebrow', text: 'Menu principal' }),
      el('div', { class: 'cards' }, rows),
      el('div', { class: 'foot' }, [
        el('a', { class: 'ghost', href: '/admin', text: 'Admin' }),
        el('button', { class: 'ghost', text: 'Sair', onclick: function () { post('/api/logout').then(function () { login(); }); } })
      ])
    ]);
  }

  fetch('/api/status', { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 401) return login();
    if (r.status === 503) return r.json().then(function (j) { show([el('p', { class: 'sub', text: j.error || 'Admin desativado.' })]); });
    menu();
  }).catch(function () { show([el('p', { class: 'sub', text: 'Sem conexão com o servidor.' })]); });
})();
