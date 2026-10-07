// Painel admin: perguntas + biblioteca de mídias (Cloudflare R2). Sem dependências.
(function () {
  'use strict';
  var root = document.getElementById('root');
  var S = { status: null, content: null, media: [], tab: 'perguntas', qi: 0, dirty: false, msg: '', kind: '', uploads: [] };
  var IMG = ['jpg', 'jpeg', 'png', 'webp', 'gif'], VID = ['mp4', 'webm', 'mov'], AUD = ['mp3', 'm4a', 'ogg', 'wav'];

  // ---------- utilidades ----------
  function h(tag, props) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple') n[k] = v;
      else n.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(x); });
      else n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function typeOf(name) { var e = ext(name); return IMG.indexOf(e) >= 0 ? 'image' : VID.indexOf(e) >= 0 ? 'video' : AUD.indexOf(e) >= 0 ? 'audio' : 'text'; }
  var KIND = { image: 'foto', video: 'video', audio: 'som', text: '' };
  function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function urlOf(key) { var b = S.status && S.status.mediaBase; return b ? b + '/' + key : ''; }
  function say(msg, kind) { S.msg = msg; S.kind = kind || ''; var el = document.getElementById('msg'); if (el) { el.textContent = msg; el.className = 'msg ' + S.kind; } }

  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && url !== '/api/login') { S.status = null; render(); }
          if (!r.ok) { var e = new Error(j.error || 'Erro ' + r.status); e.status = r.status; throw e; }
          return j;
        });
      });
  }

  function upload(file, onPct) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', '/api/upload?name=' + encodeURIComponent(file.name));
      x.upload.onprogress = function (e) { if (e.lengthComputable) onPct(Math.round(e.loaded / e.total * 100)); };
      x.onload = function () {
        var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
        if (x.status === 200) resolve(j.key); else reject(new Error(j.error || 'Falha no envio (' + x.status + ')'));
      };
      x.onerror = function () { reject(new Error('Falha de conexão no envio')); };
      x.send(file);
    });
  }

  // Envia vários arquivos em sequência, mostrando progresso. Retorna as chaves enviadas.
  function uploadMany(files) {
    var keys = [];
    var items = Array.prototype.map.call(files, function (f) { var u = { name: f.name, pct: 0, err: '', done: false }; S.uploads.push(u); return { f: f, u: u }; });
    paintUploads();
    return items.reduce(function (p, it) {
      return p.then(function () {
        return upload(it.f, function (pct) { it.u.pct = pct; paintUploads(); })
          .then(function (k) { it.u.pct = 100; it.u.done = true; keys.push(k); })
          .catch(function (e) { it.u.err = e.message; });
      });
    }, Promise.resolve()).then(function () { paintUploads(); return loadMedia().then(function () { return keys; }); });
  }
  function paintUploads() {
    var box = document.getElementById('uploads'); if (!box) return;
    box.innerHTML = '';
    S.uploads.slice(-8).forEach(function (u) {
      box.appendChild(h('div', { style: 'margin-top:10px' },
        h('div', { class: 'row', style: 'justify-content:space-between;font-size:14px' }, h('span', { text: u.name }), h('span', { class: u.err ? 'err' : '', text: u.err || (u.done ? 'enviado' : u.pct + '%') })),
        u.err ? null : h('div', { class: 'progress' }, h('i', { style: 'width:' + u.pct + '%' }))));
    });
  }

  function loadMedia() { return api('GET', '/api/media').then(function (j) { S.media = j.items; }); }
  function mark() { S.dirty = true; say('Alterações não salvas', 'dirty'); var b = document.getElementById('save'); if (b) b.disabled = false; }

  // ---------- login ----------
  function viewLogin(errText) {
    var pw = h('input', { type: 'password', placeholder: 'Senha do admin', autofocus: '' });
    var err = h('p', { class: 'err', text: errText || '' });
    function go() {
      api('POST', '/api/login', { password: pw.value }).then(boot).catch(function (e) { err.textContent = e.message; });
    }
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    return h('div', { class: 'login' }, h('img', { src: 'img/logo.png', alt: 'Terra da Gente' }), h('label', { class: 'lbl', text: 'Senha' }), pw, err,
      h('button', { class: 'btn primary', style: 'width:100%;margin-top:6px', onclick: go, text: 'Entrar' }));
  }

  // ---------- cabeçalho ----------
  function header() {
    return h('header', { class: 'bar' }, h('img', { src: 'img/logo.png', alt: '' }), h('h1', { text: 'Admin' }),
      h('span', { class: 'chip ' + (S.status.r2 ? 'ok' : 'bad'), text: S.status.r2 ? 'R2 conectado' : 'R2 pendente' }),
      h('span', { class: 'chip ' + (S.status.mediaBase ? 'ok' : 'bad'), text: S.status.mediaBase ? 'URL pública ok' : 'Sem URL pública' }),
      h('a', { class: 'btn small', href: '/', target: '_blank', text: 'Ver site' }),
      h('button', { class: 'btn small', onclick: function () { api('POST', '/api/logout').then(function () { S.status = null; render(); }); }, text: 'Sair' }));
  }

  // ---------- aba Perguntas ----------
  function viewQuestions() {
    var c = S.content;
    if (S.qi >= c.quizzes.length) S.qi = Math.max(0, c.quizzes.length - 1);
    var quiz = c.quizzes[S.qi];
    var side = h('div', { class: 'side' },
      c.quizzes.map(function (q, i) { return h('button', { class: 'q' + (i === S.qi ? ' on' : ''), onclick: function () { S.qi = i; render(); }, text: q.title || '(sem título)' }); }),
      h('button', { class: 'btn small', style: 'width:100%;margin-top:8px', text: 'Novo quiz', onclick: function () {
        c.quizzes.push({ id: 'quiz-' + Date.now().toString(36), title: 'Novo quiz', subtitle: '', questions: [] }); S.qi = c.quizzes.length - 1; mark(); render();
      } }));
    if (!quiz) return h('div', { class: 'layout' }, side, h('div', { class: 'card', text: 'Crie um quiz para começar.' }));

    var head = h('div', { class: 'card' }, h('h3', { text: 'Quiz' }),
      h('label', { class: 'lbl', text: 'Título (botão da tela inicial)' }),
      h('input', { type: 'text', value: quiz.title, oninput: function (e) { quiz.title = e.target.value; mark(); } }),
      h('label', { class: 'lbl', text: 'Subtítulo' }),
      h('input', { type: 'text', value: quiz.subtitle || '', oninput: function (e) { quiz.subtitle = e.target.value; mark(); } }),
      h('label', { class: 'lbl', text: 'Regras do jogo' }),
      h('div', { class: 'row' },
        numField('Tempo por pergunta (s)', quiz.timeLimit == null ? 30 : quiz.timeLimit, 5, 300, function (n) { quiz.timeLimit = n; mark(); }),
        lifeField(quiz, 'fifty', 'Eliminações por partida')),
      h('label', { class: 'row', style: 'margin-top:12px;cursor:pointer' },
        h('input', { type: 'checkbox', checked: !!quiz.muteVideos, style: 'width:20px;height:20px;accent-color:#c6f432', onchange: function (e) { if (e.target.checked) quiz.muteVideos = true; else delete quiz.muteVideos; mark(); } }),
        h('span', { text: 'Vídeos do prêmio sem som (o áudio dos arquivos não toca neste quiz)' })),
      h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn danger small', text: 'Excluir este quiz', onclick: function () {
        if (confirm('Excluir o quiz "' + quiz.title + '" e todas as suas perguntas?')) { c.quizzes.splice(S.qi, 1); mark(); render(); }
      } })));

    var cards = quiz.questions.map(function (p, pi) { return questionCard(quiz, p, pi); });
    var add = h('button', { class: 'btn', text: 'Nova pergunta', onclick: function () {
      quiz.questions.push({ text: '', options: ['', '', '', ''], answer: 0, reward: { src: '', caption: '' } }); mark(); render(); window.scrollTo(0, document.body.scrollHeight);
    } });
    return h('div', { class: 'layout' }, side, h('div', {}, head, cards, add));
  }

  function numField(label, cur, min, max, onSet) {
    return h('label', { class: 'row', style: 'flex:1' }, h('span', { class: 'hint', style: 'white-space:nowrap', text: label }),
      h('input', { type: 'number', min: String(min), max: String(max), value: String(cur), style: 'width:90px', onchange: function (e) {
        var n = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)); e.target.value = String(n); onSet(n);
      } }));
  }
  function lifeField(quiz, key, label) {
    var cur = quiz.lifelines && quiz.lifelines[key] != null ? quiz.lifelines[key] : 1;
    return h('label', { class: 'row', style: 'flex:1' }, h('span', { class: 'hint', style: 'white-space:nowrap', text: label }),
      h('input', { type: 'number', min: '0', max: '9', value: String(cur), style: 'width:80px', oninput: function (e) {
        var n = Math.max(0, Math.min(9, parseInt(e.target.value, 10) || 0));
        quiz.lifelines = quiz.lifelines || { skip: 1, fifty: 1 }; quiz.lifelines[key] = n; mark();
      } }));
  }

  function questionCard(quiz, p, pi) {
    p.reward = p.reward || { src: '', caption: '' };
    var r = p.reward;
    function move(d) { var j = pi + d; if (j < 0 || j >= quiz.questions.length) return; var t = quiz.questions[pi]; quiz.questions[pi] = quiz.questions[j]; quiz.questions[j] = t; mark(); render(); }

    var opts = p.options.map(function (o, i) {
      return h('div', { class: 'opt' },
        h('input', { type: 'radio', name: 'ans-' + S.qi + '-' + pi, checked: p.answer === i, title: 'Resposta correta', onchange: function () { p.answer = i; mark(); } }),
        h('span', { class: 'letter', text: String.fromCharCode(65 + i) }),
        h('input', { type: 'text', value: o, placeholder: 'Alternativa ' + String.fromCharCode(65 + i), oninput: function (e) { p.options[i] = e.target.value; mark(); } }),
        p.options.length > 2 ? h('button', { class: 'btn small', text: 'Remover', onclick: function () {
          p.options.splice(i, 1); if (p.answer === i) p.answer = 0; else if (p.answer > i) p.answer--; mark(); render();
        } }) : null);
    });

    var sel = h('select', { onchange: function (e) { r.src = e.target.value; mark(); render(); } },
      h('option', { value: '', text: 'Sem mídia (só texto)' }),
      mediaOptions(r.src).map(function (k) { return h('option', { value: k, selected: r.src === k, text: k + (KIND[typeOf(k)] ? '  (' + KIND[typeOf(k)] + ')' : '') }); }));
    var file = h('input', { type: 'file', accept: 'image/*,video/*,audio/*', style: 'display:none', onchange: function (e) {
      if (!e.target.files.length) return;
      say('Enviando arquivo...', 'dirty');
      uploadMany(e.target.files).then(function (keys) { if (keys.length) { r.src = keys[0]; mark(); } render(); });
    } });

    var soundSel = h('select', { onchange: function (e) { if (e.target.value) p.sound = e.target.value; else delete p.sound; mark(); render(); } },
      h('option', { value: '', text: 'Sem áudio' }),
      mediaOptions(p.sound || '', 'audio').map(function (k) { return h('option', { value: k, selected: p.sound === k, text: k }); }));
    var soundFile = h('input', { type: 'file', accept: 'audio/*', style: 'display:none', onchange: function (e) {
      if (!e.target.files.length) return;
      say('Enviando áudio...', 'dirty');
      uploadMany(e.target.files).then(function (keys) { if (keys.length) { p.sound = keys[0]; mark(); } render(); });
    } });

    return h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: 'Pergunta ' + (pi + 1) }),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', text: 'Subir', onclick: function () { move(-1); } }),
          h('button', { class: 'btn small', text: 'Descer', onclick: function () { move(1); } }),
          h('button', { class: 'btn small danger', text: 'Excluir', onclick: function () { if (confirm('Excluir esta pergunta?')) { quiz.questions.splice(pi, 1); mark(); render(); } } }))),
      h('label', { class: 'lbl', text: 'Enunciado (pode ficar vazio nas perguntas de canto)' }),
      h('textarea', { placeholder: 'Ex.: Que ave está cantando?', oninput: function (e) { p.text = e.target.value; mark(); } }, p.text),
      h('label', { class: 'lbl', text: 'Áudio do canto (toca ao abrir a pergunta; deixe sem áudio para pergunta comum)' }),
      h('div', { class: 'row' }, soundSel, h('button', { class: 'btn', style: 'white-space:nowrap', text: 'Enviar áudio', onclick: function () { soundFile.click(); } }), soundFile),
      p.sound && urlOf(p.sound) ? h('div', { class: 'prev' }, h('audio', { src: urlOf(p.sound), controls: '' })) : null,
      h('label', { class: 'lbl', text: 'Alternativas (marque a correta)' }), opts,
      p.options.length < 6 ? h('button', { class: 'btn small', text: 'Adicionar alternativa', onclick: function () { p.options.push(''); mark(); render(); } }) : null,
      h('label', { class: 'lbl', text: 'Vídeo ou foto da resposta certa (aparece ao acertar e também ao errar)' }),
      h('div', { class: 'row' }, sel, h('button', { class: 'btn', style: 'white-space:nowrap', text: 'Enviar novo arquivo', onclick: function () { file.click(); } }), file),
      preview(r.src),
      h('label', { class: 'lbl', text: 'Legenda (opcional)' }),
      h('input', { type: 'text', value: r.caption || '', placeholder: 'Ex.: Acertou! É o Dourado.', oninput: function (e) { r.caption = e.target.value; mark(); } }));
  }
  function mediaOptions(current, type) {
    var keys = S.media.map(function (m) { return m.key; }).filter(function (k) { return !type || typeOf(k) === type; });
    if (current && keys.indexOf(current) < 0) keys.unshift(current);
    return keys;
  }
  function preview(key) {
    if (!key || !urlOf(key)) return null;
    var t = typeOf(key), u = urlOf(key);
    return h('div', { class: 'prev' }, t === 'image' ? h('img', { src: u, alt: '' }) : t === 'video' ? h('video', { src: u, controls: '', preload: 'metadata' }) : h('audio', { src: u, controls: '' }));
  }

  function toSave() {
    var c = JSON.parse(JSON.stringify(S.content));
    c.quizzes.forEach(function (q) { q.questions.forEach(function (p) {
      var r = p.reward || {}, cap = (r.caption || '').trim();
      if (r.src) { p.reward = { type: typeOf(r.src), src: r.src }; if (cap) p.reward.caption = cap; }
      else if (cap) p.reward = { type: 'text', caption: cap };
      else delete p.reward;
    }); });
    return c;
  }
  function save() {
    var b = document.getElementById('save'); if (b) b.disabled = true;
    say('Salvando...', 'dirty');
    api('PUT', '/api/content', toSave()).then(function () { S.dirty = false; say('Salvo. O site público já usa o novo conteúdo.', 'good'); })
      .catch(function (e) { say('Não salvou: ' + e.message, 'err'); if (b) b.disabled = false; });
  }

  // ---------- aba Mídias ----------
  function viewMedia() {
    var input = h('input', { type: 'file', multiple: true, accept: 'image/*,video/*,audio/*', style: 'display:none', onchange: function (e) { send(e.target.files); } });
    function send(files) { if (files.length) uploadMany(files).then(render); }
    var drop = h('div', { class: 'drop', onclick: function () { input.click(); },
      ondragover: function (e) { e.preventDefault(); drop.classList.add('over'); }, ondragleave: function () { drop.classList.remove('over'); },
      ondrop: function (e) { e.preventDefault(); drop.classList.remove('over'); send(e.dataTransfer.files); } },
      h('div', { style: 'font-size:18px;font-weight:600', text: 'Arraste fotos, vídeos e sons aqui' }),
      h('div', { class: 'hint', style: 'margin-top:6px', text: 'ou clique para escolher. Formatos: jpg, png, webp, gif, mp4, webm, mp3, m4a, ogg, wav. Até 300 MB cada.' }), input);
    var grid = h('div', { class: 'grid' }, S.media.map(function (m) {
      var u = urlOf(m.key), t = typeOf(m.key);
      return h('div', { class: 'media' },
        h('div', { class: 'thumb' }, u && t === 'image' ? h('img', { src: u, alt: '', loading: 'lazy' }) : u && t === 'video' ? h('video', { src: u + '#t=0.5', preload: 'metadata', muted: '' }) : h('span', { text: KIND[t] || t })),
        h('div', { class: 'meta' }, m.key, h('small', { text: size(m.size) })),
        h('div', { class: 'acts' },
          u ? h('button', { class: 'btn small', text: 'Copiar link', onclick: function (e) { navigator.clipboard && navigator.clipboard.writeText(u); e.target.textContent = 'Copiado'; } }) : null,
          h('button', { class: 'btn small danger', text: 'Excluir', onclick: function () {
            if (!confirm('Excluir "' + m.key + '" do bucket? Perguntas que usam este arquivo ficam sem mídia.')) return;
            api('DELETE', '/api/media?key=' + encodeURIComponent(m.key)).then(loadMedia).then(render).catch(function (e) { alert(e.message); });
          } })));
    }));
    return h('div', {}, drop, h('div', { id: 'uploads' }), S.media.length ? grid : h('p', { class: 'hint', text: 'Nenhuma mídia enviada ainda.' }));
  }

  // ---------- aba Ranking ----------
  function loadRank() {
    var q = S.content.quizzes[S.rq || 0];
    if (!q) { S.rank = []; return Promise.resolve(); }
    return api('GET', '/api/admin/ranking?quizId=' + encodeURIComponent(q.id)).then(function (j) { S.rank = j.entries || []; }).catch(function () { S.rank = []; });
  }
  function downloadCsv(qz) {
    var rows = [['posicao', 'nome', 'pontos', 'acertos', 'total_perguntas', 'tempo_segundos', 'data']];
    (S.rank || []).forEach(function (e, i) { rows.push([i + 1, e.name, e.points, e.correct, e.total, (e.ms / 1000).toFixed(1), new Date(e.at).toLocaleString('pt-BR')]); });
    var csv = '\ufeff' + rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ranking-' + qz.id + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function viewRanking() {
    var c = S.content, qz = c.quizzes[S.rq || 0];
    if (!qz) return h('p', { class: 'hint', text: 'Crie um quiz primeiro.' });
    var sel = h('select', { style: 'max-width:320px', onchange: function (e) { S.rq = parseInt(e.target.value, 10); S.rank = null; render(); loadRank().then(render); } },
      c.quizzes.map(function (q, i) { return h('option', { value: String(i), selected: i === (S.rq || 0), text: q.title }); }));
    var head = h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:14px' }, sel,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', text: 'Baixar CSV', onclick: function () { downloadCsv(qz); } }),
        h('button', { class: 'btn small', text: 'Atualizar', onclick: function () { S.rank = null; render(); loadRank().then(render); } }),
        h('button', { class: 'btn small danger', text: 'Limpar ranking', onclick: function () {
          if (!confirm('Apagar TODO o ranking de "' + qz.title + '"? Isso não pode ser desfeito.')) return;
          api('DELETE', '/api/ranking?quizId=' + encodeURIComponent(qz.id) + '&all=1').then(function () { S.rank = []; render(); }).catch(function (e) { alert(e.message); });
        } })));
    if (S.rank == null) return h('div', {}, head, h('p', { class: 'hint', text: 'Carregando...' }));
    if (!S.rank.length) return h('div', {}, head, h('p', { class: 'hint', text: 'Ninguém jogou este quiz ainda.' }));
    var rows = S.rank.map(function (e, i) {
      return h('tr', {}, h('td', { text: String(i + 1) }), h('td', { text: e.name }), h('td', { text: String(e.points) }),
        h('td', { text: e.correct + '/' + e.total }), h('td', { text: (e.ms / 1000).toFixed(1) + ' s' }),
        h('td', { text: new Date(e.at).toLocaleString('pt-BR') }),
        h('td', {}, h('button', { class: 'btn small danger', text: 'Excluir', onclick: function () {
          if (!confirm('Remover "' + e.name + '" do ranking?')) return;
          api('DELETE', '/api/ranking?quizId=' + encodeURIComponent(qz.id) + '&id=' + encodeURIComponent(e.id)).then(loadRank).then(render).catch(function (er) { alert(er.message); });
        } })));
    });
    return h('div', {}, head, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['#', 'Nome', 'Pontos', 'Acertos', 'Tempo', 'Quando', ''].map(function (t) { return h('th', { text: t }); }))), h('tbody', {}, rows)));
  }

  // ---------- montagem ----------
  function render() {
    var y = window.scrollY;
    root.innerHTML = '';
    if (!S.status) { root.appendChild(viewLogin()); return; }
    root.appendChild(header());
    var wrap = h('div', { class: 'wrap' });
    if (!S.status.r2) {
      wrap.appendChild(h('div', { class: 'notice' }, 'O R2 ainda não está configurado. No Railway, defina as variáveis: ' + S.status.missing.join(', ') + '.'));
    } else {
      if (!S.status.mediaBase) wrap.appendChild(h('div', { class: 'notice' }, 'Defina MEDIA_BASE_URL no Railway (endereço público do bucket) para as mídias aparecerem no site e nas prévias.'));
      wrap.appendChild(h('div', { class: 'tabs' },
        ['perguntas', 'midias', 'ranking'].map(function (t) { return h('button', { class: S.tab === t ? 'on' : '', text: t === 'perguntas' ? 'Perguntas' : t === 'midias' ? 'Mídias' : 'Ranking', onclick: function () { S.tab = t; if (t === 'ranking') { S.rank = null; render(); loadRank().then(render); } else render(); } }); })));
      wrap.appendChild(S.tab === 'perguntas' ? viewQuestions() : S.tab === 'midias' ? viewMedia() : viewRanking());
    }
    root.appendChild(wrap);
    if (S.status.r2 && S.tab === 'perguntas') {
      root.appendChild(h('div', { class: 'savebar' }, h('span', { id: 'msg', class: 'msg ' + S.kind, text: S.msg }),
        h('button', { id: 'save', class: 'btn primary', text: 'Salvar alterações', disabled: !S.dirty, onclick: save })));
    }
    paintUploads();
    window.scrollTo(0, y);
  }

  function boot() {
    api('GET', '/api/status').then(function (st) {
      S.status = st;
      if (!st.r2) return render();
      return Promise.all([api('GET', '/api/content'), loadMedia()]).then(function (r) { S.content = r[0]; render(); });
    }).catch(function (e) {
      if (e.status === 401) { S.status = null; return render(); }
      root.innerHTML = ''; root.appendChild(h('div', { class: 'login' }, h('p', { class: 'err', text: e.message })));
    });
  }
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  boot();
})();
