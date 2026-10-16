// Quiz interativo: funciona com toque, teclado e controle remoto de Smart TV (setas/OK/Voltar).
// ES5-friendly (sem módulos/optional chaining) para rodar em navegadores antigos de TV.
(function () {
  var app = document.getElementById('app');
  var data = null, quiz = null, qi = 0, correct = 0, pts = 0, spent = 0, fifty = 0;
  // Cada ativacao (/peixes, /aves, /projeta) e um app fechado: so enxerga os proprios quizzes e o proprio ranking.
  var seg = location.pathname.split('/')[1] || '';
  if (/\./.test(seg)) seg = '';   // ex.: /index.html nao e uma ativacao
  var ACT = (seg || (/[?&]a=([a-z0-9-]+)/.exec(location.search) || [])[1] || '').toLowerCase();
  var actTitle = '';
  var PROXY = ACT === 'projeta' && !/[?&]proxy=0/.test(location.search);
  var player = '', idleTimer = null, tick = null, onKey = null, screenToken = 0;

  // ---------- helpers ----------
  // Midias: se MEDIA_BASE_URL (bucket R2) estiver definida, "video1.mp4" vira "<bucket>/video1.mp4".
  function mediaUrl(src) {
    if (!src || /^(https?:)?\/\//i.test(src) || src.charAt(0) === '/') return src;
    if (PROXY) return '/m/' + encodeURI(src.replace(/^media\//, ''));   // Projeta: pela ponte do servidor (guardavel offline, sem CORS)
    var base = (window.APP_CONFIG && window.APP_CONFIG.mediaBase) || '';
    if (!base) return src.indexOf('/') < 0 ? 'media/' + src : src;
    return base + '/' + src.replace(/^media\//, '');
  }
  // Foto quadrada (object-fit: cover) centrada no ponto escolhido no admin (f = {x,y} de 0 a 1). Sem ajuste: centro, como sempre.
  function focusPos(w, h, f) {
    if (!f || !w || !h) return '50% 50%';
    var r = w / h, px = 50, py = 50;
    if (r > 1) { var ox = Math.min(Math.max(f.x * r - 0.5, 0), r - 1); px = ox / (r - 1) * 100; }
    else if (r < 1) { var oy = Math.min(Math.max(f.y / r - 0.5, 0), 1 / r - 1); py = oy / (1 / r - 1) * 100; }
    return px + '% ' + py + '%';
  }
  function photo(cls, key, f) {
    var img = document.createElement('img');
    img.className = cls; img.alt = '';
    if (f) {
      var apply = function () { img.style.objectPosition = focusPos(img.naturalWidth, img.naturalHeight, f); };
      img.addEventListener('load', apply);
      img.src = mediaUrl(key);
      if (img.complete && img.naturalWidth) apply();
    } else img.src = mediaUrl(key);
    return img;
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
  // Listeners "passivos": nunca seguram o toque/rolagem (era uma fonte de travadinhas em tablet).
  var passiveOpt = true;
  try { var po = Object.defineProperty({}, 'passive', { get: function () { passiveOpt = { passive: true, capture: true }; return true; } }); window.addEventListener('t', null, po); } catch (e) {}
  ['keydown', 'click', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, bumpIdle, passiveOpt); });

  // Tablet: mantem a tela acesa durante o jogo, bloqueia zoom por pinca e tira o foco "grudado" dos botoes apos o toque.
  var LITE = /(^|\s)lite(\s|$)/.test(document.documentElement.className);
  var wakeLock = null, wakePending = false;
  function paintDot() { var d = document.getElementById('t-dot'); if (d) d.className = wakeLock ? 'on' : ''; }
  function keepAwake() {
    try {
      if (navigator.wakeLock && !wakeLock && !wakePending && document.visibilityState === 'visible') {
        wakePending = true;
        navigator.wakeLock.request('screen').then(function (s) {
          wakePending = false; wakeLock = s; paintDot();
          s.addEventListener('release', function () { wakeLock = null; paintDot(); setTimeout(keepAwake, 1000); });   // o sistema derrubou: pede de novo
        }, function () { wakePending = false; });
      }
    } catch (e) { wakePending = false; }
  }
  keepAwake(); setInterval(keepAwake, 20000);       // tenta ao abrir e reforca a cada 20 s (alguns navegadores so liberam apos um toque)
  ['click', 'touchend', 'keydown'].forEach(function (ev) { document.addEventListener(ev, keepAwake, passiveOpt); });
  document.addEventListener('visibilitychange', keepAwake);
  ['gesturestart', 'gesturechange'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }); });
  // Toque (tablet): o botao ACENDE no toque e a acao roda ~160 ms depois, para o olho ver o feedback.
  // Teclado de nomes e botoes do rodape ficam sem atraso. A pontuacao usa o instante da acao (igual para todos).
  var TAP = LITE || /[?&]tap=1/.test(location.search);
  if (TAP) {
    var unlit = function (b) { if (b && !b.__pending) b.classList.remove('lit'); };
    document.addEventListener('touchstart', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || b.disabled) return;
      b.classList.add('lit'); clearTimeout(b.__lt); b.__lt = setTimeout(function () { unlit(b); }, 700);
    }, passiveOpt);
    document.addEventListener('touchend', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) setTimeout(function () { unlit(b); }, 150); }, passiveOpt);
    document.addEventListener('touchmove', function (e) { var b = e.target.closest && e.target.closest('button'); unlit(b); }, passiveOpt);
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || b.disabled || b.closest('#tools') || b.classList.contains('key')) return;
      if (b.__replay) { b.__replay = false; return; }                 // clique reenviado depois do brilho
      e.stopImmediatePropagation(); e.preventDefault();
      if (b.__pending) return;                                         // toque repetido enquanto acende
      b.__pending = true; b.classList.add('lit');
      setTimeout(function () {
        b.__pending = false; b.classList.remove('lit');
        if (b.isConnected && !b.disabled) { b.__replay = true; b.click(); b.__replay = false; }
      }, 160);
    }, true);
  }
  if (LITE) {
    document.addEventListener('click', function () {
      setTimeout(function () { var a = document.activeElement; if (a && a !== document.body && a.blur && a.tagName === 'BUTTON') a.blur(); }, 0);
    }, true);
  }

  // ---------- pontuação ----------
  // 10 a 100 pontos conforme o tempo que sobrou. Errou ou acabou o tempo: 0.
  function calcPoints(left, limit) {
    return Math.max(10, Math.round(10 + 90 * (left / limit)));
  }
  function limitMs() { return ((quiz && quiz.timeLimit) || 45) * 1000; }      // 45 s por padrao; os pontos (10 a 100) se dividem ao longo deste tempo

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
    quiz = null; qi = 0; player = '';          // tela compartilhada: o proximo jogador digita o proprio nome
    if (!data.quizzes.length) {
      render([el('img', { class: 'logo', src: 'img/logo.png', alt: 'Terra da Gente' }), el('div', { class: 'rule' }),
        el('p', { class: 'eyebrow', text: actTitle }), el('p', { class: 'sub', text: 'Conteúdo em preparação. Volte em instantes.' })], -1);
      return;
    }
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
      el('p', { class: 'eyebrow', text: actTitle || 'Escolha um quiz' }),
      cards,
      el('div', { class: 'actions' }, [el('button', { class: 'ghost', text: 'Ver ranking', onclick: function () { rankingScreen(null, null); } })])
    ]);
  }

  // Nome do jogador com teclado na tela (toque e controle remoto); teclado físico também funciona.
  function nameScreen(q) {
    quiz = q;
    var name = player || '';
    var disp = el('div', { class: 'namebox' });
    var startB = el('button', { class: 'go', text: 'Continuar' });
    function paint() {
      disp.innerHTML = '';
      disp.appendChild(name ? el('span', { text: name }) : el('span', { class: 'ph', text: 'Digite seu nome' }));
      disp.appendChild(el('i', { class: 'caret' }));
      startB.disabled = name.replace(/\s/g, '').length < 1;
    }
    function add(ch) { if (name.length < 16) { name += ch; paint(); } }
    function del() { name = name.slice(0, -1); paint(); }
    var rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(function (r) {
      return el('div', { class: 'krow' }, r.split('').map(function (ch) {
        return el('button', { class: 'key', text: ch, onclick: function () { add(ch); } });
      }));
    });
    var tools = el('div', { class: 'krow' }, [
      el('button', { class: 'key wide', text: 'Apagar', onclick: del }),
      el('button', { class: 'key space', text: 'Espaço', onclick: function () { add(' '); } }),
      startB
    ]);
    startB.addEventListener('click', function () { if (!startB.disabled) { player = name.replace(/\s+/g, ' ').trim(); rulesScreen(); } });
    render([
      el('div', { class: 'top' }, [el('img', { class: 'mini', src: 'img/logo.png', alt: '' }), el('div', { class: 'progress' }, [el('span', { text: q.title })])]),
      el('p', { class: 'eyebrow', text: 'Quem vai jogar?' }), disp, el('div', { class: 'kb' }, rows.concat([tools]))
    ], 0);
    paint();
    onKey = function (e) {
      var k = e.keyCode, c = e.key || '';
      if (k === 8) { del(); e.preventDefault(); return true; }
      if (k === 32) { add(' '); e.preventDefault(); return true; }
      if (c.length === 1 && /[A-Za-zÀ-ÿ0-9]/.test(c)) { add(c.toUpperCase()); e.preventDefault(); return true; }
      return false;
    };
  }

  // Regras curtas antes da partida: so as linhas que valem para este quiz (canto, pontos por velocidade, eliminar).
  function rulesScreen() {
    var hasSound = quiz.questions.some(function (p) { return p.sound; });
    var l = quiz.lifelines || {}, chances = l.fifty == null ? 3 : l.fifty;
    var rows = [];
    if (hasSound) rows.push(['Ouça o canto', 'Ele toca no início da pergunta e é a dica para chegar à resposta.']);
    rows.push(['Seja rápido', 'Quanto mais rápido você responde, mais pontos ganha: até 100 por pergunta.']);
    if (chances > 0) rows.push(['Eliminar alternativas', 'Você tem ' + chances + (chances === 1 ? ' chance' : ' chances') + ' de sortear e tirar de 1 a 3 alternativas erradas.']);
    render([
      top(false),
      el('p', { class: 'eyebrow', text: 'Como jogar' }),
      el('div', { class: 'rules' }, rows.map(function (r, i) {
        return el('div', { class: 'rule-row' }, [
          el('span', { class: 'rnum', text: String(i + 1) }),
          el('div', { class: 'rtxt' }, [el('b', { text: r[0] }), el('span', { text: r[1] })])
        ]);
      })),
      el('div', { class: 'actions' }, [el('button', { text: 'Iniciar', onclick: startGame })])
    ], 0);
  }

  function startGame() {
    qi = 0; correct = 0; pts = 0; spent = 0;
    var l = quiz.lifelines || {};
    fifty = l.fifty == null ? 3 : l.fifty;      // 3 usos de "Eliminar" por partida (ajustavel no admin)
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
      // Foto pequena da alternativa (ex.: a ave) no lugar da letra; sem foto, fica a letra.
      var badge = el('span', { class: 'badge', text: String.fromCharCode(65 + i) });
      var picKey = q.images && q.images[i], pic = null;
      if (picKey) {
        pic = photo('pic', picKey, q.imageFocus && q.imageFocus[i]);
        pic.addEventListener('error', function () { if (pic.parentNode) { pic.parentNode.replaceChild(badge, pic); b.classList.remove('has-pic'); } });
      }
      var b = el('button', { class: pic ? 'has-pic' : '' }, [
        pic || badge,
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
      listenB = el('button', { class: 'help', text: 'Toque para ouvir', hidden: '' });   // so aparece se o navegador bloquear o som
      listenB.addEventListener('click', function () {
        if (paused || done || started) return;
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
      var lastSecs = secs.textContent, wasLow = false;
      tick = setInterval(function () {
        if (paused || done) return;
        var left = Math.max(0, limit - (Date.now() - t0)), r = left / limit;
        bar.style.transform = 'scaleX(' + r + ')';          // escala (barato) em vez de mexer na largura
        var s = String(Math.ceil(left / 1000));
        if (s !== lastSecs) { secs.textContent = s; lastSecs = s; }
        var low = r < 0.25;
        if (low !== wasLow) { clock.className = 'clock' + (low ? ' low' : ''); wasLow = low; }
        if (left <= 0) { done = true; clearInterval(tick); spent += limit; miss(q, 'time'); }
      }, 100);
    }

    if (!audio) { startClock(); return; }
    audio.addEventListener('playing', function () { eq.className = 'eq on'; listenB.hidden = true; startClock(); });
    audio.addEventListener('pause', function () { eq.className = 'eq'; });
    audio.addEventListener('ended', function () { eq.className = 'eq'; });
    audio.addEventListener('error', function () { listenB.hidden = true; say('Não foi possível tocar o áudio.'); startClock(); });
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () {            // navegador bloqueou o som automatico
      blocked = true; listenB.hidden = false; say('Toque em “Toque para ouvir” para começar.');
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
        for (var k = 0; k < count; k++) { var t = pool.splice(rnd(pool.length), 1)[0]; btns[t].classList.add('gone'); btns[t].disabled = true; }
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

  function miss(q, kind) { outcome(q, kind === 'time' ? 'time' : 'wrong', 0); }
  function reward(q, p) { outcome(q, 'ok', p); }

  // Resultado de uma pergunta (acertou, errou ou acabou o tempo). A foto/video da resposta certa
  // aparece nos tres casos: quem errou tambem fica conhecendo o bicho.
  function outcome(q, kind, p) {
    var ok = kind === 'ok', time = kind === 'time';
    var r = q.reward || {};
    var media = null;
    if (r.src && r.type === 'image') media = el('img', { src: mediaUrl(r.src), alt: '' });
    else if (r.src && r.type === 'video') {
      media = el('video', { src: mediaUrl(r.src), autoplay: '', playsinline: '', controls: '' });
      if (quiz.muteVideos) { media.setAttribute('muted', ''); media.muted = true; }   // quiz com videos sem som
    }
    else if (r.src && r.type === 'audio') media = el('audio', { src: mediaUrl(r.src), autoplay: '', controls: '' });

    var ico = svg(ok
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#4be08a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : time
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b57" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b57" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    ico.className = 'tick' + (ok ? '' : ' bad');
    var detail = ok
      ? el('div', { class: 'cap', text: r.caption || 'Resposta certa!' })
      : el('div', { class: 'reveal' }, [el('small', { text: 'A resposta certa era' })].concat(
          (q.images && q.images[q.answer]) ? [photo('revimg', q.images[q.answer], q.imageFocus && q.imageFocus[q.answer]), el('b', { text: q.options[q.answer] })]
                                           : [el('b', { text: String.fromCharCode(65 + q.answer) + '. ' + q.options[q.answer] })]));
    var info = [
      ico,
      el('p', { class: 'eyebrow ' + (ok ? 'ok' : 'bad'), text: ok ? 'Resposta correta' : time ? 'Tempo esgotado' : 'Resposta incorreta' }),
      el('p', { class: 'pts', text: '+ ' + fmt(p) + ' pontos' }),
      detail
    ];
    var nextB = nextBtn(), nextLabel = nextB.textContent, actions = el('div', { class: 'actions' }, [nextB]);

    // Premio em video: o botao so libera 5 s depois que o video comeca a tocar (a pessoa assiste o inicio).
    // Falha, fim do video ou 9 s sem iniciar liberam na hora, para ninguem ficar preso.
    var tok = 0, armed = false, freed = false;
    function free() {
      if (freed) return; freed = true;
      nextB.disabled = false; nextB.textContent = nextLabel;
      if (document.activeElement === document.body) { try { nextB.focus(); } catch (e) {} }
    }
    function arm() {
      if (armed || freed) return; armed = true;
      var left = 5;
      (function count() {
        if (tok !== screenToken || freed) return;
        if (left <= 0) { free(); return; }
        nextB.textContent = 'Aguarde ' + left + 's'; left--;
        setTimeout(count, 1000);
      })();
    }
    function gate() {
      tok = screenToken;
      if (!(media && r.type === 'video')) return;
      nextB.disabled = true; nextB.textContent = 'Assista ao vídeo';
      media.addEventListener('playing', arm);
      media.addEventListener('ended', free);
      media.addEventListener('error', free);
      setTimeout(function () { if (tok === screenToken && !armed) free(); }, 9000);
    }

    // Foto/video: midia a esquerda (cabe vertical) e informacoes a direita. Audio/texto: coluna unica.
    if (media && r.type !== 'audio') {
      var wrap = el('div', { class: 'rwd-media' }, [media]);
      var row = el('div', { class: 'rwd' + (r.type === 'image' ? ' photo' : '') }, [wrap, el('div', { class: 'rwd-info' }, info.concat([actions]))]);
      media.addEventListener('error', function () { row.className = 'rwd solo'; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); });
      render([top(true), row]);
      gate();
      if (r.type === 'video') { var vp = media.play && media.play(); if (vp && vp.catch) vp.catch(function () {}); }   // dentro do toque do jogador; se bloquear, ele usa o play
      return;
    }
    if (media) media.addEventListener('error', function () { if (media.parentNode) media.parentNode.removeChild(media); });
    render([top(true)].concat(info, media ? [media] : [], [actions]));
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
      if (r && r.queued) { rankLine.textContent = 'Sem internet: sua pontuação foi guardada e será enviada depois.'; }
      else if (r) { myId = r.id; rankLine.textContent = r.rank ? 'Você está em ' + r.rank + 'º lugar entre ' + r.players + ' jogador' + (r.players > 1 ? 'es' : '') : 'Pontuação registrada.'; rankBtn.disabled = false; }
      else { rankLine.textContent = 'Não foi possível salvar no ranking agora.'; }
    });
  }

  function rankingScreen(quizId, highlight) {
    var id = quizId || (data.quizzes[0] && data.quizzes[0].id) || '';
    render([top(false), el('p', { class: 'eyebrow', text: 'Ranking' }), el('p', { class: 'sub', text: 'Carregando...' })]);
    ajax('GET', 'api/ranking?activation=' + encodeURIComponent(ACT) + '&limit=100&_=' + Date.now(), null, function (r) {
      if (!r) { render([top(false), el('p', { class: 'eyebrow', text: 'Ranking' }), el('p', { class: 'sub', text: 'Ranking indisponível sem internet.' }), el('div', { class: 'actions' }, [el('button', { text: 'Voltar', onclick: home })])]); return; }
      var all = (r && r.ranking) || {};
      var tabs = el('div', { class: 'tabs' }, data.quizzes.length < 2 ? [] : data.quizzes.map(function (q) {
        return el('button', { class: 'tab' + (q.id === id ? ' on' : ''), text: q.title, onclick: function () { rankingScreen(q.id, highlight); } });
      }));
      var list = all[id] || [], board = el('div', { class: 'board', tabindex: '0' });
      if (!list.length) board.appendChild(el('p', { class: 'sub', text: 'Ninguém jogou este quiz ainda. Seja o primeiro!' }));
      list.forEach(function (e, i) {
        board.appendChild(el('div', { class: 'brow' + (e.id === highlight ? ' me' : '') + (i < 3 ? ' p' + (i + 1) : '') }, [
          el('span', { class: 'pos', text: String(i + 1) }), el('span', { class: 'nm', text: e.name }), el('span', { class: 'pt', text: fmt(e.points) })
        ]));
      });
      render([top(false), el('p', { class: 'eyebrow', text: 'Ranking' }), tabs, board,
        el('div', { class: 'actions' }, [el('button', { text: 'Voltar', onclick: home })])], 0);

      // A lista rola por dentro (a tela fica parada). Mostra o jogador logo que possivel.
      var me = board.querySelector('.me');
      if (me) board.scrollTop = Math.max(0, me.offsetTop - board.clientHeight / 2 + me.offsetHeight / 2);
      // Controle remoto: com a lista selecionada, cima/baixo rolam; nas pontas o foco segue para os outros botoes.
      onKey = function (e) {
        var k = e.keyCode;
        if (document.activeElement !== board || (k !== 38 && k !== 40)) return false;
        var max = board.scrollHeight - board.clientHeight, d = k === 40 ? 1 : -1;
        if (max <= 2 || (d > 0 && board.scrollTop >= max - 2) || (d < 0 && board.scrollTop <= 2)) return false;
        board.scrollTop += d * (board.clientHeight / 4);
        e.preventDefault(); return true;
      };
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
    var btns = Array.prototype.slice.call(app.querySelectorAll('button:not([disabled]), .board'));
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

  // ---------- modo instalado (tablet): Inicio / Sair discretos ----------
  var tools = document.getElementById('tools');
  var standalone = (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: minimal-ui)').matches)) || window.navigator.standalone === true;
  if (tools && (standalone || /[?&]tools=1/.test(location.search))) {
    tools.hidden = false;
    if (fsBtn) fsBtn.hidden = true;                  // instalado ja esta em tela cheia
    var bHome = document.getElementById('t-home'), bExit = document.getElementById('t-exit');
    // Segundo toque confirma (evita toque sem querer); volta ao normal apos 3 s.
    var arm = function (btn, label, fn) {
      if (btn.__armed) { btn.__armed = false; clearTimeout(btn.__t); btn.className = ''; btn.textContent = label; fn(); return; }
      btn.__armed = true; btn.className = 'armed'; btn.textContent = 'Confirmar?';
      btn.__t = setTimeout(function () { btn.__armed = false; btn.className = ''; btn.textContent = label; }, 3000);
    };
    bHome.addEventListener('click', function () { if (!quiz) { home(); return; } arm(bHome, 'Início', home); });
    bExit.addEventListener('click', function () {
      arm(bExit, 'Sair', function () {
        try { window.close(); } catch (e) {}
        setTimeout(function () { offSay('Não foi possível fechar por aqui. Use o botão Recentes do tablet.', 'bad', 6000); }, 500);   // ainda aberto: o navegador nao deixou
      });
    });
  }

  // ---------- uso offline (so /projeta) ----------
  // Guarda app, conteudo e midias no disco do tablet; pontuacoes feitas sem internet vao para uma fila.
  // Emergencia: /projeta?sw=off desregistra tudo, apaga os dados e mantem o modo offline DESLIGADO neste tablet; /projeta?sw=on religa.
  var offChip = document.getElementById('off'), offTimer = null;
  function offSay(text, cls, hideAfter) {
    if (!offChip) return;
    clearTimeout(offTimer);
    offChip.textContent = text; offChip.className = 'show ' + (cls || '');
    if (hideAfter) offTimer = setTimeout(function () { offChip.className = ''; }, hideAfter);
  }
  function mediaList() {
    var out = {};
    (data.quizzes || []).forEach(function (q) { (q.questions || []).forEach(function (p) {
      if (p.reward && p.reward.src && p.reward.type !== 'text') out[mediaUrl(p.reward.src)] = 1;
      if (p.sound) out[mediaUrl(p.sound)] = 1;
      (p.images || []).forEach(function (k) { if (k) out[mediaUrl(k)] = 1; });
    }); });
    return Object.keys(out).map(function (u) { return new URL(u, location.href).href; });
  }
  function offlineSetup() {
    if (ACT !== 'projeta' || !('serviceWorker' in navigator)) return;
    if (/[?&]sw=on/.test(location.search)) { try { localStorage.removeItem('swoff'); } catch (e) {} location.replace(location.pathname); return; }
    var swOff = false; try { swOff = localStorage.getItem('swoff') === '1'; } catch (e) {}
    if (/[?&]sw=off/.test(location.search)) {
      try { localStorage.setItem('swoff', '1'); } catch (e) {}     // fica desligado neste tablet ate abrir ?sw=on
      navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })
        .then(function () { return window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : null; })
        .then(function () { location.replace(location.pathname); });
      return;
    }
    if (swOff) return;
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'progress') offSay('Baixando para uso offline ' + (m.done + m.failed) + '/' + m.total, '');
      else if (m.type === 'done') {
        if (m.failed) offSay('Atenção: ' + m.failed + ' de ' + m.total + ' arquivo(s) não ficaram salvos para uso offline', 'bad');
        else offSay(m.total ? 'Pronto para uso offline' : '', 'ok', 5000);
      }
    });
    navigator.serviceWorker.register('/projeta/sw.js', { scope: '/projeta' }).then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // pede para o navegador nao apagar
      var urls = mediaList();
      if (reg.active) { reg.active.postMessage({ type: 'precache', urls: urls }); reg.active.postMessage({ type: 'flush' }); }
      window.addEventListener('online', function () { if (reg.active) reg.active.postMessage({ type: 'flush' }); });
    }).catch(function () {});
  }

  // ---------- boot ----------
  // Atalho escondido: segurar ~1,8 s o canto inferior direito leva ao menu principal (que ainda pede a senha).
  (function () {
    var hm = document.getElementById('hm'), t1 = null, t2 = null;
    if (!hm) return;
    function stop() { clearTimeout(t1); clearTimeout(t2); hm.className = ''; }
    function begin() { stop(); t2 = setTimeout(function () { hm.className = 'show'; }, 700); t1 = setTimeout(function () { location.href = '/'; }, 1800); }
    ['mousedown', 'touchstart'].forEach(function (ev) { hm.addEventListener(ev, begin); });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) { hm.addEventListener(ev, stop); });
    hm.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  })();

  if (!ACT) { app.textContent = 'Endereço sem ativação. Peça o link correto.'; return; }
  ajax('GET', 'api/activation?id=' + encodeURIComponent(ACT) + '&_=' + Date.now(), null, function (j) {
    if (!j) { app.textContent = 'Ativação não encontrada ou sem conexão.'; return; }
    data = { idleSeconds: j.idleSeconds, quizzes: j.quizzes || [] }; actTitle = j.title || '';
    if (actTitle) document.title = actTitle + ' - Terra da Gente';
    home(); bumpIdle(); offlineSetup();
  });
})();
