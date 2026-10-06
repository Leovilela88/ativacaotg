// Quiz interativo: funciona com toque, teclado e controle remoto de Smart TV (setas/OK/Voltar).
// ES5-friendly (sem módulos/optional chaining) para rodar em navegadores antigos de TV.
(function () {
  var app = document.getElementById('app');
  var data = null, quiz = null, qi = 0, correct = 0, pts = 0, spent = 0, fifty = 0;
  var player = '', idleTimer = null, tick = null, onKey = null, screenToken = 0;

  // ---------- helpers ----------
  // Midias: se MEDIA_BASE_URL (bucket R2) estiver definida, "video1.mp4" vira "<bucket>/video1.mp4".
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
  // focusIdx: indice do botao que ja nasce selecionado; -1 = nenhum (a 1a seta do controle seleciona o primeiro).
  function render(nodes, focusIdx) {
    clearInterval(tick); onKey = null; screenToken++; stopMedia();
    app.innerHTML = '';
    nodes.forEach(function (n) { app.appendChild(n); });
    app.scrollTop = 0;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (focusIdx === -1) return;
    var btns = app.querySelectorAll('button:not([disabled])');
    if (btns.length) btns[Math.min(focusIdx || 0, btns.length - 1)].focus();
  }
  function stopMedia() {
    var m = app.querySelectorAll('video,audio');
    for (var i = 0; i < m.length; i++) { try { m[i].pause(); } catch (e) {} }
  }
  function ajax(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url);
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} cb(x.status === 200 ? j : null); };
    x.onerror = function () { cb(null); };
    x.send(body ? JSON.stringify(body) : null);
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function svg(html) { var s = el('span', { class: 'ico' }); s.innerHTML = html; return s; }

  // ---------- inatividade (modo quiosque) ----------
  function bumpIdle() {
    clearTimeout(idleTimer);
    var s = data && data.idleSeconds;
    if (s) idleTimer = setTimeout(function () { if (quiz) home(); }, s * 1000);
  }
  ['keydown', 'click', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, bumpIdle, true); });

  // ---------- pontuação ----------
  // 10 a 100 pontos conforme o tempo que sobrou. Errou ou acabou o tempo: 0.
  function calcPoints(left, limit) {
    return Math.max(10, Math.round(10 + 90 * (left / limit)));
  }
  function limitMs() { return ((quiz && quiz.timeLimit) || 30) * 1000; }

  // ---------- peças comuns ----------
  function top(withProgress) {
    var kids = [el('img', { class: 'mini', src: 'img/logo.png', alt: 'Terra da Gente' })];
    if (withProgress) {
      var bars = el('div', { class: 'bars' });
      for (var i = 0; i < quiz.questions.length; i++) bars.appendChild(el('i', { class: i <= qi ? 'on' : '' }));
      kids.push(el('div', { class: 'progress' }, [
        el('span', { text: player }), bars, el('span', { class: 'chip', text: fmt(pts) + ' pts' })
      ]));
    }
    return el('div', { class: 'top' }, kids);
  }

  // ---------- telas ----------
  function home() {
    quiz = null; qi = 0;
    var cards = el('div', { class: 'cards' }, data.quizzes.map(function (q, i) {
      return el('button', { onclick: function () { nameScreen(q); } }, [
        el('span', { class: 'num', text: pad(i + 1) }),
        el('span', { class: 'label' }, [el('b', { text: q.title }), el('small', { text: q.subtitle || '' })]),
        el('span', { class: 'chev' })
      ]);
    }));
    render([
      el('img', { class: 'logo', src: 'img/logo.png', alt: 'Terra da Gente' }),
      el('div', { class: 'rule' }),
      el('p', { class: 'eyebrow', text: 'Escolha um quiz' }),
      cards,
      el('div', { class: 'actions' }, [el('button', { class: 'ghost', text: 'Ver ranking', onclick: function () { rankingScreen(null, null); } })])
    ]);
  }

  // Nome do jogador com teclado na tela (toque e controle remoto); teclado físico também funciona.
  function nameScreen(q) {
    quiz = q;
    var name = player || '';
    var disp = el('div', { class: 'namebox' });
    var startB = el('button', { class: 'go', text: 'Começar' });
    function paint() {
      disp.innerHTML = '';
      disp.appendChild(name ? el('span', { text: name }) : el('span', { class: 'ph', text: 'Digite seu nome' }));
      disp.appendChild(el('i', { class: 'caret' }));
      startB.disabled = name.replace(/\s/g, '').length < 1;
    }
    function add(ch) { if (name.length < 16) { name += ch; paint(); } }
    function del() { name = name.slice(0, -1); paint(); }
    var rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(function (r) {
      return el('div', { class: 'krow' }, r.split('').map(function (ch) {
        return el('button', { class: 'key', text: ch, onclick: function () { add(ch); } });
      }));
    });
    var tools = el('div', { class: 'krow' }, [
      el('button', { class: 'key wide', text: 'Apagar', onclick: del }),
      el('button', { class: 'key space', text: 'Espaço', onclick: function () { add(' '); } }),
      startB
    ]);
    startB.addEventListener('click', function () { if (!startB.disabled) { player = name.replace(/\s+/g, ' ').trim(); startGame(); } });
    render([
      el('div', { class: 'top' }, [el('img', { class: 'mini', src: 'img/logo.png', alt: '' }), el('div', { class: 'progress' }, [el('span', { text: q.title })])]),
      el('p', { class: 'eyebrow', text: 'Quem vai jogar?' }), disp, el('div', { class: 'kb' }, rows.concat([tools]))
    ], 0);
    paint();
    onKey = function (e) {
      var k = e.keyCode, c = e.key || '';
      if (k === 8) { del(); e.preventDefault(); return true; }
      if (k === 32) { add(' '); e.preventDefault(); return true; }
      if (c.length === 1 && /[A-Za-zÀ-ÿ]/.test(c)) { add(c.toUpperCase()); e.preventDefault(); return true; }
      return false;
    };
  }

  function startGame() {
    qi = 0; correct = 0; pts = 0; spent = 0;
    var l = quiz.lifelines || {};
    fifty = l.fifty == null ? 1 : l.fifty;
    question();
  }

  function question() {
    var q = quiz.questions[qi], limit = limitMs(), paused = false, pauseAt = 0, done = false, t0 = 0, started = false;
    var hint = el('p', { class: 'hint' });
    var opts = el('div', { class: 'opts' }), btns = [];
    function say(t) { hint.textContent = t; hint.className = 'hint show'; }
    var bar = el('i'), secs = el('b', { text: String(Math.ceil(limit / 1000)) });
    var clock = el('div', { class: 'clock' }, [el('div', { class: 'cbar' }, [bar]), secs]);

    q.options.forEach(function (label, i) {
      var b = el('button', {}, [
        el('span', { class: 'badge', text: String.fromCharCode(65 + i) }),
        el('span', { class: 'label', text: label })
      ]);
      b.addEventListener('click', function () {
        if (paused || done) return;
        if (!started) { say('Ouça o canto para começar.'); return; }
        done = true;
        var elapsed = Math.min(limit, Date.now() - t0);
        spent += elapsed;
        if (i === q.answer) { var p = calcPoints(limit - elapsed, limit); pts += p; correct++; reward(q, p); }
        else miss(q, 'wrong');
      });
      btns.push(b); opts.appendChild(b);
    });

    var fiftyB = el('button', { class: 'help' });
    function paintHelp() {
      fiftyB.innerHTML = 'Eliminar alternativas <span class="count">' + fifty + '</span>';
      fiftyB.disabled = fifty < 1;
    }
    fiftyB.addEventListener('click', function () {
      if (paused || done) return;
      var cand = [];
      btns.forEach(function (b, i) { if (i !== q.answer && !b.disabled) cand.push(i); });
      if (cand.length < 2) { say('Não há mais alternativas para eliminar.'); return; }
      fifty--; paintHelp();
      paused = true; pauseAt = Date.now();           // o relógio para durante o sorteio
      runDraw(btns, cand, Math.min(3, cand.length), function () { paused = false; t0 += Date.now() - pauseAt; });
    });
    paintHelp();

    var title = q.text || (q.sound ? 'Quem está cantando?' : '');
    var panelKids = [
      el('p', { class: 'eyebrow', text: 'Pergunta ' + (qi + 1) + ' de ' + quiz.questions.length }),
      el('h2', { class: title.length > 150 ? 'long' : '', text: title })
    ];

    // Pergunta de canto: o som toca ao abrir; o relogio so comeca quando ele realmente toca.
    var audio = null, eq = null, listenB = null, blocked = false;
    if (q.sound) {
      audio = el('audio', { src: mediaUrl(q.sound), preload: 'auto' });
      eq = el('div', { class: 'eq' }, [el('i'), el('i'), el('i'), el('i'), el('i'), el('i'), el('i')]);
      listenB = el('button', { class: 'help', text: 'Ouvir novamente' });
      listenB.addEventListener('click', function () {
        if (paused || done) return;
        try { audio.currentTime = 0; } catch (e) {}
        var pr = audio.play(); if (pr && pr.catch) pr.catch(function () {});
      });
      panelKids.push(el('div', { class: 'sound' }, [eq, listenB, audio]));
    }
    var panel = el('div', { class: 'panel' }, panelKids);
    render([top(true), clock, panel, opts, hint, el('div', { class: 'helps' }, [fiftyB])], -1);

    function startClock() {
      if (started) return;
      started = true; hint.className = 'hint';
      t0 = Date.now();
      tick = setInterval(function () {
        if (paused || done) return;
        var left = Math.max(0, limit - (Date.now() - t0)), r = left / limit;
        bar.style.width = (r * 100) + '%';
        secs.textContent = String(Math.ceil(left / 1000));
        clock.className = 'clock' + (r < 0.25 ? ' low' : '');
        if (left <= 0) { done = true; clearInterval(tick); spent += limit; miss(q, 'time'); }
      }, 100);
    }

    if (!audio) { startClock(); return; }
    audio.addEventListener('playing', function () { eq.className = 'eq on'; startClock(); });
    audio.addEventListener('pause', function () { eq.className = 'eq'; });
    audio.addEventListener('ended', function () { eq.className = 'eq'; });
    audio.addEventListener('error', function () { listenB.disabled = true; say('Não foi possível tocar o áudio.'); startClock(); });
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () {            // navegador bloqueou o som automatico
      blocked = true; listenB.textContent = 'Toque para ouvir'; say('Toque em “Toque para ouvir” para começar.');
      try { listenB.focus(); } catch (e) {}
    });
    setTimeout(function () { if (!started && !blocked && tokOk()) startClock(); }, 12000);   // rede muito lenta: nao trava a partida
    var myTok = screenToken;
    function tokOk() { return myTok === screenToken; }
  }

  // Sorteio visivel: so o NUMERO de alternativas eliminadas (1 a 3). Quando o numero para,
  // as eliminadas (escolhidas ao acaso entre as erradas) saem todas de uma vez.
  function runDraw(btns, cand, maxN, onDone) {
    var tok = screenToken;
    var letter = el('b', { text: '?' }), msg = el('p', { class: 'dtxt', text: 'Sorteando quantas alternativas serão eliminadas' });
    var drum = el('div', { class: 'drum' }, [letter]), chips = el('div', { class: 'chips' });
    var ov = el('div', { class: 'draw' }, [el('div', { class: 'dbox' }, [el('p', { class: 'eyebrow', text: 'Sorteio' }), drum, chips, msg])]);
    app.appendChild(ov);
    function rnd(n) { return Math.floor(Math.random() * n); }

    var nums = [], count = 1 + rnd(maxN);
    for (var i = 1; i <= maxN; i++) nums.push(i);
    var chipEls = nums.map(function (v) { var c = el('span', { class: 'chip2', text: String(v) }); chips.appendChild(c); return c; });

    // o numero gira e desacelera ate parar em "count"
    var steps = 11 + rnd(4), seq = [], start = rnd(nums.length);
    for (var s = 0; s < steps; s++) seq.push(nums[(start + s) % nums.length]);
    seq[steps - 1] = count;
    if (seq[steps - 2] === count) seq[steps - 2] = nums[(nums.indexOf(count) + 1) % nums.length];

    var n = 0;
    (function step() {
      if (tok !== screenToken) return;
      var cur = seq[n];
      letter.textContent = String(cur);
      chipEls.forEach(function (c, k) { c.className = 'chip2' + (nums[k] === cur ? ' on' : ''); });
      n++;
      if (n < seq.length) { setTimeout(step, 70 * Math.pow(1.12, n)); return; }
      drum.className = 'drum stop ok';
      msg.textContent = count === 1 ? 'Será eliminada 1 alternativa' : 'Serão eliminadas ' + count + ' alternativas';
      setTimeout(function () {
        if (tok !== screenToken) return;
        var pool = cand.slice();
        for (var k = 0; k < count; k++) { var t = pool.splice(rnd(pool.length), 1)[0]; btns[t].className = 'gone'; btns[t].disabled = true; }
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        onDone();
      }, 1400);
    })();
  }

  function focusFirst(c) { var b = c.querySelector('button:not([disabled])'); if (b) b.focus(); }

  function nextBtn() {
    var last = qi >= quiz.questions.length - 1;
    return el('button', { text: last ? 'Ver resultado' : 'Próxima pergunta', onclick: function () { if (last) end(); else { qi++; question(); } } });
  }

  // Errou ou o tempo acabou: 0 pontos, mostra a certa e segue (sem segunda chance).
  function miss(q, kind) {
    var time = kind === 'time';
    var ico = svg(time
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b57" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b57" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    ico.className = 'tick bad';
    render([
      top(true), ico, el('p', { class: 'eyebrow bad', text: time ? 'Tempo esgotado' : 'Resposta incorreta' }),
      el('p', { class: 'pts', text: '+ 0 pontos' }),
      el('div', { class: 'reveal' }, [el('small', { text: 'A resposta certa era' }), el('b', { text: String.fromCharCode(65 + q.answer) + '. ' + q.options[q.answer] })]),
      el('div', { class: 'actions' }, [nextBtn()])
    ]);
  }

  function reward(q, p) {
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
    var tickIco = svg('<svg viewBox="0 0 24 24" fill="none" stroke="#4be08a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>');
    tickIco.className = 'tick';
    render([top(true), tickIco, el('p', { class: 'eyebrow ok', text: 'Resposta correta' }), el('p', { class: 'pts', text: '+ ' + fmt(p) + ' pontos' }), box, el('div', { class: 'actions' }, [nextBtn()])]);
  }

  function end() {
    var total = quiz.questions.length, ratio = total ? correct / total : 0, thisQuiz = quiz;
    var rankLine = el('p', { class: 'sub', text: 'Salvando sua pontuação...' });
    var ring = el('div', { class: 'ring' });
    ring.innerHTML = '<svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="bar" cx="60" cy="60" r="52" style="stroke-dashoffset:326.7"/></svg>';
    ring.appendChild(el('b', { text: correct + '/' + total }));
    var rankBtn = el('button', { text: 'Ver ranking', disabled: 'disabled' });
    var myId = null;
    rankBtn.addEventListener('click', function () { rankingScreen(thisQuiz.id, myId); });
    render([
      top(false), el('p', { class: 'eyebrow', text: 'Fim do quiz' }), ring,
      el('h1', { text: fmt(pts) + ' pontos' }), rankLine,
      el('div', { class: 'actions' }, [
        rankBtn,
        el('button', { text: 'Voltar ao início', onclick: home })
      ])
    ], 0);
    setTimeout(function () { var b = ring.querySelector('.bar'); if (b) b.style.strokeDashoffset = String(326.7 * (1 - ratio)); }, 120);
    ajax('POST', 'api/score', { quizId: thisQuiz.id, name: player, points: pts, correct: correct, total: total, ms: Math.round(spent) }, function (r) {
      if (!rankLine.parentNode) return;
      if (r) { myId = r.id; rankLine.textContent = r.rank ? 'Você está em ' + r.rank + 'º lugar entre ' + r.players + ' jogador' + (r.players > 1 ? 'es' : '') : 'Pontuação registrada.'; rankBtn.disabled = false; }
      else { rankLine.textContent = 'Não foi possível salvar no ranking agora.'; }
    });
  }

  function rankingScreen(quizId, highlight) {
    var id = quizId || data.quizzes[0].id;
    render([top(false), el('p', { class: 'eyebrow', text: 'Ranking' }), el('p', { class: 'sub', text: 'Carregando...' })]);
    ajax('GET', 'api/ranking?limit=10&_=' + Date.now(), null, function (r) {
      var all = (r && r.ranking) || {};
      var tabs = el('div', { class: 'tabs' }, data.quizzes.map(function (q) {
        return el('button', { class: 'tab' + (q.id === id ? ' on' : ''), text: q.title, onclick: function () { rankingScreen(q.id, highlight); } });
      }));
      var list = all[id] || [], board = el('div', { class: 'board' });
      if (!list.length) board.appendChild(el('p', { class: 'sub', text: 'Ninguém jogou este quiz ainda. Seja o primeiro!' }));
      list.forEach(function (e, i) {
        board.appendChild(el('div', { class: 'brow' + (e.id === highlight ? ' me' : '') + (i < 3 ? ' p' + (i + 1) : '') }, [
          el('span', { class: 'pos', text: String(i + 1) }), el('span', { class: 'nm', text: e.name }), el('span', { class: 'pt', text: fmt(e.points) })
        ]));
      });
      render([top(false), el('p', { class: 'eyebrow', text: 'Ranking' }), tabs, board,
        el('div', { class: 'actions' }, [el('button', { text: 'Voltar', onclick: home })])], 0);
    });
  }

  // ---------- navegação por controle remoto (espacial) ----------
  var KEY = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  var BACK = { 8: 1, 27: 1, 461: 1, 10009: 1, 166: 1 }; // Backspace, Esc, webOS, Tizen, Android TV
  document.addEventListener('keydown', function (e) {
    if (onKey && onKey(e)) return;
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

  // ---------- tela cheia ----------
  // Botao no canto + tecla F. Com ?kiosk na URL, o primeiro toque/tecla ja entra em tela cheia.
  // (iPhone nao permite: la, usar "Adicionar a Tela de Inicio" - o manifest abre em tela cheia.)
  var fsBtn = document.getElementById('fs'), root = document.documentElement;
  var reqFs = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFs() {
    try {
      if (isFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      else if (reqFs) { reqFs.call(root); }
    } catch (e) {}
  }
  var ICON_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  function paintFs() { if (fsBtn) { fsBtn.innerHTML = isFs() ? ICON_OUT : ICON_IN; fsBtn.setAttribute('aria-label', isFs() ? 'Sair da tela cheia' : 'Tela cheia'); } }
  if (fsBtn && reqFs) {
    fsBtn.hidden = false; paintFs();
    fsBtn.addEventListener('click', toggleFs);
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, paintFs); });
    document.addEventListener('keydown', function (e) { if (!onKey && (e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) toggleFs(); });
    if (/[?&]kiosk\b/.test(location.search)) {
      var once = function () { document.removeEventListener('click', once, true); document.removeEventListener('keydown', once, true); document.removeEventListener('touchend', once, true); if (!isFs()) toggleFs(); };
      document.addEventListener('click', once, true); document.addEventListener('keydown', once, true); document.addEventListener('touchend', once, true);
    }
  }

  // ---------- boot ----------
  ajax('GET', 'data/quiz.json?_=' + Date.now(), null, function (j) {
    if (!j) { app.textContent = 'Erro ao carregar o conteúdo.'; return; }
    data = j; home(); bumpIdle();
  });
})();
