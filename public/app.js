// Quiz interativo: funciona com toque, teclado e controle remoto de Smart TV (setas/OK/Voltar).
// ES5-friendly (sem módulos/optional chaining) para rodar em navegadores antigos de TV.
(function () {
  var app = document.getElementById('app');
  var data = null, quiz = null, qi = 0, score = 0, idleTimer = null, order = [], life = { skip: 0, fifty: 0 };

  // ---------- helpers ----------
  // Midias: se MEDIA_BASE_URL (bucket R2) estiver definida, "video1.mp4" vira "<bucket>/video1.mp4".
  // URLs completas (http/https) e caminhos absolutos passam sem alteracao.
  function mediaUrl(src) {
    if (!src || /^(https?:)?\/\//i.test(src) || src.charAt(0) === '/') return src;
    var base = (window.APP_CONFIG && window.APP_CONFIG.mediaBase) || '';
    if (!base) return src.indexOf('/') < 0 ? 'media/' + src : src;
    return base + '/' + src.replace(/^media\//, '');
  }
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
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
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
    var cards = el('div', { class: 'cards' }, data.quizzes.map(function (q, i) {
      return el('button', { onclick: function () { start(q); } }, [
        el('span', { class: 'num', text: pad(i + 1) }),
        el('span', { class: 'label' }, [el('b', { text: q.title }), el('small', { text: q.subtitle || '' })]),
        el('span', { class: 'chev' })
      ]);
    }));
    render([
      el('img', { class: 'logo', src: 'img/logo.png', alt: 'Terra da Gente' }),
      el('div', { class: 'rule' }),
      el('p', { class: 'eyebrow', text: 'Escolha um quiz' }),
      cards
    ]);
  }
  function start(q) {
    quiz = q; qi = 0; score = 0;
    order = q.questions.map(function (x, i) { return i; });
    var l = q.lifelines || {};
    life = { skip: l.skip == null ? 1 : l.skip, fifty: l.fifty == null ? 1 : l.fifty };
    question();
  }

  function question() {
    var q = quiz.questions[order[qi]], tries = 0;
    var hint = el('p', { class: 'hint' });
    var opts = el('div', { class: 'opts' }), btns = [];
    function say(t) { hint.textContent = t; hint.className = 'hint show'; }
    q.options.forEach(function (label, i) {
      var b = el('button', {}, [
        el('span', { class: 'badge', text: String.fromCharCode(65 + i) }),
        el('span', { class: 'label', text: label })
      ]);
      b.addEventListener('click', function () {
        if (i === q.answer) { if (tries === 0) score++; reward(q); }
        else { tries++; b.className = 'wrong'; b.disabled = true; b.blur(); say('Quase! Tente outra alternativa.'); focusFirst(opts); }
      });
      btns.push(b); opts.appendChild(b);
    });

    // ----- ajudas -----
    var last = qi >= quiz.questions.length - 1;
    var skipB = el('button', { class: 'help' }), fiftyB = el('button', { class: 'help' });
    function paintHelps() {
      skipB.innerHTML = 'Pular <span class="count">' + life.skip + '</span>';
      fiftyB.innerHTML = 'Eliminar alternativas <span class="count">' + life.fifty + '</span>';
      skipB.disabled = life.skip < 1 || last;
      fiftyB.disabled = life.fifty < 1;
    }
    skipB.addEventListener('click', function () {
      life.skip--; order.push(order.splice(qi, 1)[0]); question();
    });
    fiftyB.addEventListener('click', function () {
      var wrong = btns.filter(function (b, i) { return i !== q.answer && !b.disabled; });
      if (wrong.length < 2) { say('Não há mais alternativas para eliminar.'); return; }
      var n = Math.max(1, Math.floor(wrong.length / 2));
      for (var k = 0; k < n; k++) {
        var j = Math.floor(Math.random() * wrong.length), b = wrong.splice(j, 1)[0];
        b.className = 'gone'; b.disabled = true;
      }
      life.fifty--; paintHelps(); focusFirst(opts);
    });
    paintHelps();
    var helps = el('div', { class: 'helps' }, [skipB, fiftyB]);

    var panel = el('div', { class: 'panel' }, [
      el('p', { class: 'eyebrow', text: 'Pergunta ' + (qi + 1) + ' de ' + quiz.questions.length }),
      el('h2', { class: q.text.length > 150 ? 'long' : '', text: q.text })
    ]);
    render([top(true), panel, opts, hint, helps]);
  }
  function focusFirst(c) { var b = c.querySelector('button:not([disabled])'); if (b) b.focus(); }

  function reward(q) {
    var r = q.reward || { type: 'text', caption: 'Resposta certa!' };
    var box = el('div', { class: 'reward' }, [el('div', { class: 'cap', text: r.caption || 'Resposta certa!' })]);
    var media = null;
    if (r.type === 'image') media = el('img', { src: mediaUrl(r.src), alt: '' });
    else if (r.type === 'video') media = el('video', { src: mediaUrl(r.src), autoplay: '', playsinline: '', controls: '' });
    else if (r.type === 'audio') media = el('audio', { src: mediaUrl(r.src), autoplay: '', controls: '' });
    if (media) {
      media.addEventListener('error', function () { if (media.parentNode) media.parentNode.removeChild(media); });
      box.insertBefore(media, box.firstChild);
    }
    var tick = el('div', { class: 'tick' });
    tick.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#4be08a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var last = qi >= quiz.questions.length - 1;
    var next = el('button', { text: last ? 'Ver resultado' : 'Próxima pergunta', onclick: function () { if (last) end(); else { qi++; question(); } } });
    render([top(true), tick, el('p', { class: 'eyebrow ok', text: 'Resposta correta' }), box, el('div', { class: 'actions' }, [next])]);
  }

  function end() {
    var total = quiz.questions.length, ratio = total ? score / total : 0;
    var msg = ratio === 1 ? 'Perfeito! Você conhece bem a nossa terra.' : ratio >= 0.5 ? 'Muito bem! Falta pouco para gabaritar.' : 'Boa tentativa! Jogue de novo e descubra mais.';
    var ring = el('div', { class: 'ring' });
    ring.innerHTML = '<svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="bar" cx="60" cy="60" r="52" style="stroke-dashoffset:326.7"/></svg>';
    ring.appendChild(el('b', { text: score + '/' + total }));
    render([
      top(false),
      el('p', { class: 'eyebrow', text: 'Fim do quiz' }),
      ring,
      el('h1', { text: msg.split('!')[0] + '!' }),
      el('p', { class: 'sub', text: msg.split('! ')[1] || 'acertos de primeira' }),
      el('div', { class: 'actions' }, [
        el('button', { text: 'Jogar de novo', onclick: function () { start(quiz); } }),
        el('button', { text: 'Outros quizzes', onclick: home })
      ])
    ]);
    setTimeout(function () {
      var bar = ring.querySelector('.bar');
      if (bar) bar.style.strokeDashoffset = String(326.7 * (1 - ratio));
    }, 120);
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
