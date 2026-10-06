// Quiz interativo: funciona com toque, teclado e controle remoto de Smart TV (setas/OK/Voltar).
// ES5-friendly (sem módulos/optional chaining) para rodar em navegadores antigos de TV.
(function () {
  var app = document.getElementById('app');
  var data = null, quiz = null, qi = 0, score = 0, idleTimer = null;

  // ---------- helpers ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k === 'onclick') n.addEventListener('click', attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function render(nodes, focusIdx) {
    stopMedia();
    app.innerHTML = '';
    nodes.forEach(function (n) { app.appendChild(n); });
    var btns = app.querySelectorAll('button:not([disabled])');
    if (btns.length) btns[Math.min(focusIdx || 0, btns.length - 1)].focus();
  }
  function stopMedia() {
    var m = app.querySelectorAll('video,audio');
    for (var i = 0; i < m.length; i++) { try { m[i].pause(); } catch (e) {} }
  }

  // ---------- inatividade (modo quiosque) ----------
  function bumpIdle() {
    clearTimeout(idleTimer);
    var s = data && data.idleSeconds;
    if (s) idleTimer = setTimeout(function () { if (quiz) home(); }, s * 1000);
  }
  ['keydown', 'click', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, bumpIdle, true); });

  // ---------- telas ----------
  function top(withProgress) {
    var kids = [el('img', { class: 'mini', src: 'img/logo.png', alt: 'Terra da Gente' })];
    if (withProgress) {
      var bars = el('div', { class: 'bars' });
      for (var i = 0; i < quiz.questions.length; i++) bars.appendChild(el('i', { class: i <= qi ? 'on' : '' }));
      kids.push(el('div', { class: 'progress' }, [el('span', { text: quiz.title }), bars]));
    }
    return el('div', { class: 'top' }, kids);
  }

  function home() {
    quiz = null; qi = 0; score = 0;
    var cards = el('div', { class: 'cards' }, data.quizzes.map(function (q) {
      return el('button', { onclick: function () { start(q); } }, [
        el('span', { class: 'label' }, [el('b', { text: q.title }), el('small', { text: q.subtitle || '' })]),
        el('span', { class: 'chev' })
      ]);
    }));
    render([
      el('img', { class: 'logo', src: 'img/logo.png', alt: 'Terra da Gente' }),
      el('p', { class: 'eyebrow', text: 'Escolha um quiz para começar' }),
      cards
    ]);
  }
  function start(q) { quiz = q; qi = 0; score = 0; question(); }

  function question() {
    var q = quiz.questions[qi], tries = 0;
    var opts = el('div', { class: 'opts' });
    q.options.forEach(function (label, i) {
      var b = el('button', {}, [
        el('span', { class: 'badge', text: String.fromCharCode(65 + i) }),
        el('span', { class: 'label', text: label })
      ]);
      b.addEventListener('click', function () {
        if (i === q.answer) { if (tries === 0) score++; reward(q); }
        else { tries++; b.className = 'wrong'; b.disabled = true; b.blur(); focusFirst(opts); }
      });
      opts.appendChild(b);
    });
    render([top(true), el('h2', { text: q.text }), opts]);
  }
  function focusFirst(c) { var b = c.querySelector('button:not([disabled])'); if (b) b.focus(); }

  function reward(q) {
    var r = q.reward || { type: 'text', caption: 'Resposta certa!' };
    var box = el('div', { class: 'reward' }, [el('div', { class: 'cap', text: r.caption || 'Resposta certa!' })]);
    var media = null;
    if (r.type === 'image') media = el('img', { src: r.src, alt: '' });
    else if (r.type === 'video') media = el('video', { src: r.src, autoplay: '', playsinline: '', controls: '' });
    else if (r.type === 'audio') media = el('audio', { src: r.src, autoplay: '', controls: '' });
    if (media) {
      media.addEventListener('error', function () { if (media.parentNode) media.parentNode.removeChild(media); });
      box.insertBefore(media, box.firstChild);
    }
    var last = qi >= quiz.questions.length - 1;
    var next = el('button', { text: last ? 'Ver resultado' : 'Próxima pergunta', onclick: function () { if (last) end(); else { qi++; question(); } } });
    render([top(true), el('p', { class: 'eyebrow ok', text: 'Resposta correta' }), box, el('div', { class: 'actions' }, [next])]);
  }

  function end() {
    var total = quiz.questions.length;
    render([
      top(false),
      el('p', { class: 'eyebrow', text: 'Fim do quiz' }),
      el('p', { class: 'big', text: score + '/' + total }),
      el('p', { class: 'sub', text: 'acertos de primeira' }),
      el('div', { class: 'actions' }, [
        el('button', { text: 'Jogar de novo', onclick: function () { start(quiz); } }),
        el('button', { text: 'Outros quizzes', onclick: home })
      ])
    ]);
  }

  // ---------- navegação por controle remoto (espacial) ----------
  var KEY = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  var BACK = { 8: 1, 27: 1, 461: 1, 10009: 1, 166: 1 }; // Backspace, Esc, webOS, Tizen, Android TV
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (BACK[k]) { if (quiz) { e.preventDefault(); home(); } return; }
    var dir = KEY[k];
    if (!dir) return; // OK/Enter já dispara click no botão focado
    e.preventDefault();
    var btns = Array.prototype.slice.call(app.querySelectorAll('button:not([disabled])'));
    var cur = document.activeElement;
    if (btns.indexOf(cur) < 0) { if (btns[0]) btns[0].focus(); return; }
    var c = cur.getBoundingClientRect(), best = null, bestScore = 1e12;
    btns.forEach(function (b) {
      if (b === cur) return;
      var r = b.getBoundingClientRect();
      var dx = (r.left + r.width / 2) - (c.left + c.width / 2);
      var dy = (r.top + r.height / 2) - (c.top + c.height / 2);
      var ok = (dir === 'left' && dx < -2) || (dir === 'right' && dx > 2) || (dir === 'up' && dy < -2) || (dir === 'down' && dy > 2);
      if (!ok) return;
      var main = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
      var cross = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
      var s = main + cross * 2.5;
      if (s < bestScore) { bestScore = s; best = b; }
    });
    if (best) best.focus();
  });

  // ---------- boot ----------
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'data/quiz.json?_=' + Date.now());
  xhr.onload = function () {
    try { data = JSON.parse(xhr.responseText); home(); bumpIdle(); }
    catch (e) { app.textContent = 'Erro ao ler quiz.json'; }
  };
  xhr.onerror = function () { app.textContent = 'Erro ao carregar o conteúdo.'; };
  xhr.send();
})();
