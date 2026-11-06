/* app.js — 화면 + GitHub 저장소 동기화 */
(function () {
  'use strict';
  var C = window.Core;
  var FILE = 'ledger-data.json';
  var LS = { cfg: 'spend.sync', data: 'spend.data', sha: 'spend.sha', dirty: 'spend.dirty' };
  var TONES = [['#E6EAFB', '#3A4596'], ['#DCEFFB', '#1B5E8C'], ['#E3F5EE', '#1F6A4A'], ['#FDEBDD', '#8A3B00'], ['#F3E6FA', '#6A2E86']];
  var ICONS = {
    card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8a3 3 0 016 0"/>',
    ticket: '<path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V8z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
    home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9v11M3 9h18"/><path d="M12 9c-3 0-4-4-1.5-4S12 9 12 9zm0 0c3 0 4-4 1.5-4S12 9 12 9z"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>'
  };
  var ICON_NAMES = { card: '카드', bag: '쇼핑', ticket: '티켓', phone: '통신', play: '구독', home: '생활', gift: '선물', heart: '좋아요' };

  /* ---------- 작은 도구 ---------- */
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function ico(n, size) { return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || ICONS.card) + '</svg>'; }
  function svgx(path) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'; }
  function toB64(str) { var b = new TextEncoder().encode(str), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function fromB64(b) { var s = atob(String(b).replace(/\s/g, '')), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new TextDecoder().decode(a); }
  function b64url(str) { return toB64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return fromB64(s); }
  var won = C.won;
  function today() { return C.todayStr(); }

  /* ---------- 데이터 ---------- */
  function emptyData() { return { v: 1, rev: 0, updatedAt: '', settings: { pastDays: 10, futureDays: 20 }, cards: [], items: [] }; }
  function normalize(d) {
    if (!d || typeof d !== 'object') return emptyData();
    var o = emptyData();
    o.rev = Number(d.rev) || 0; o.updatedAt = d.updatedAt || '';
    o.settings.pastDays = clampInt(d.settings && d.settings.pastDays, 0, 60, 10);
    o.settings.futureDays = clampInt(d.settings && d.settings.futureDays, 1, 90, 20);
    o.cards = Array.isArray(d.cards) ? d.cards : [];
    o.items = Array.isArray(d.items) ? d.items.filter(function (i) { return i && Array.isArray(i.payments); }) : [];
    return o;
  }
  function clampInt(v, a, b, def) { v = parseInt(v, 10); if (isNaN(v)) return def; return Math.min(b, Math.max(a, v)); }
  var data;
  try { data = normalize(JSON.parse(lsGet(LS.data) || 'null')); } catch (e) { data = emptyData(); }

  var ui = { month: C.ymOf(today()), pf: 'active', ff: 'active', dlgFn: null, undo: null };
  var sync = { cfg: null, sha: lsGet(LS.sha) || '', dirty: lsGet(LS.dirty) === '1', state: 'off', msg: '', at: '', timer: null, busy: false, again: false };
  try { sync.cfg = JSON.parse(lsGet(LS.cfg) || 'null'); } catch (e) { sync.cfg = null; }

  function cardById(id) { for (var i = 0; i < data.cards.length; i++) if (data.cards[i].id === id) return data.cards[i]; return null; }
  function itemById(id) { for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) return data.items[i]; return null; }
  function tone(card) { return TONES[(card && card.tone != null ? card.tone : 0) % TONES.length]; }
  function cardTag(card) { if (!card) return ''; var t = tone(card); return '<span class="tag" style="background:' + t[0] + ';color:' + t[1] + '">' + esc(card.name) + '</span>'; }
  function cacheData() { lsSet(LS.data, JSON.stringify(data)); }

  function commit() {
    data.rev = (data.rev || 0) + 1; data.updatedAt = new Date().toISOString();
    cacheData(); markDirty(); render();
  }
  function snapshot() { return JSON.stringify({ cards: data.cards, items: data.items }); }
  function restore(snap) { var s = JSON.parse(snap); data.cards = s.cards; data.items = s.items; commit(); }

  /* ---------- 동기화 (GitHub Contents API) ---------- */
  function apiUrl(path) { return 'https://api.github.com/repos/' + encodeURIComponent(sync.cfg.o) + '/' + encodeURIComponent(sync.cfg.r) + path; }
  function api(path, opt) {
    opt = opt || {};
    return fetch(apiUrl(path), {
      method: opt.method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + sync.cfg.t, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
  }
  function setState(st, msg) { sync.state = st; sync.msg = msg || ''; if (st === 'ok') sync.at = new Date().toTimeString().slice(0, 5); renderSyncBtn(); }
  function markDirty() { sync.dirty = true; lsSet(LS.dirty, '1'); if (sync.cfg) { setState('busy', '저장 대기'); clearTimeout(sync.timer); sync.timer = setTimeout(push, 800); } }
  function clearDirty() { sync.dirty = false; lsDel(LS.dirty); }
  function httpMsg(status) {
    if (status === 401) return '토큰이 올바르지 않거나 만료됐어요';
    if (status === 403) return '권한이 없어요 (토큰 권한·만료 확인)';
    if (status === 404) return '저장소나 파일을 찾을 수 없어요';
    return '연결 오류 (' + status + ')';
  }
  function decodeRemote(j) { return normalize(JSON.parse(fromB64(j.content))); }

  function pull() {
    if (!sync.cfg || sync.busy) return Promise.resolve();
    sync.busy = true; setState('busy', '불러오는 중');
    return api('/contents/' + FILE).then(function (res) {
      if (res.status === 404) {
        return api('').then(function (r2) {
          if (r2.status === 200) { sync.sha = ''; lsDel(LS.sha); sync.busy = false; return pushNow(); }
          sync.busy = false; setState('err', httpMsg(r2.status === 404 ? 404 : r2.status));
        });
      }
      if (res.status !== 200) { sync.busy = false; setState('err', httpMsg(res.status)); return; }
      return res.json().then(function (j) {
        var remote = decodeRemote(j);
        if (sync.dirty) {
          if (j.sha === sync.sha) { sync.busy = false; return pushNow(); }
          sync.busy = false; setState('err', '다른 기기에서 먼저 바뀌었어요'); openConflict(); return;
        }
        sync.sha = j.sha; lsSet(LS.sha, j.sha);
        if (JSON.stringify(remote) !== JSON.stringify(data)) { data = remote; cacheData(); render(); }
        sync.busy = false; setState('ok');
      });
    }).catch(function () { sync.busy = false; setState('err', navigator.onLine === false ? '오프라인 — 연결되면 다시 저장해요' : '네트워크 오류'); });
  }
  function push() { if (!sync.cfg) return; if (sync.busy) { sync.again = true; return; } sync.busy = true; pushNow(); }
  function pushNow() {
    sync.busy = true; setState('busy', '저장 중');
    var body = { message: 'update ' + new Date().toISOString(), content: toB64(JSON.stringify(data, null, 1)) };
    if (sync.sha) body.sha = sync.sha;
    var sentRev = data.rev;
    return api('/contents/' + FILE, { method: 'PUT', body: body }).then(function (res) {
      if (res.status === 200 || res.status === 201) {
        return res.json().then(function (j) {
          sync.sha = j.content.sha; lsSet(LS.sha, sync.sha);
          if (data.rev === sentRev) clearDirty();
          sync.busy = false; setState('ok');
          if (sync.again || sync.dirty) { sync.again = false; if (sync.dirty) push(); }
        });
      }
      sync.busy = false;
      if (res.status === 409 || res.status === 422) { setState('err', '다른 기기에서 먼저 바뀌었어요'); openConflict(); return; }
      setState('err', httpMsg(res.status));
    }).catch(function () { sync.busy = false; setState('err', navigator.onLine === false ? '오프라인 — 연결되면 다시 저장해요' : '네트워크 오류'); });
  }
  function takeServer() {
    sync.busy = true; setState('busy', '불러오는 중');
    return api('/contents/' + FILE).then(function (res) {
      if (res.status !== 200) { sync.busy = false; setState('err', httpMsg(res.status)); return; }
      return res.json().then(function (j) {
        data = decodeRemote(j); sync.sha = j.sha; lsSet(LS.sha, j.sha); cacheData(); clearDirty();
        sync.busy = false; setState('ok'); render(); closeDlg();
      });
    }).catch(function () { sync.busy = false; setState('err', '네트워크 오류'); });
  }
  function overwriteMine() {
    sync.busy = true; setState('busy', '저장 중');
    return api('/contents/' + FILE).then(function (res) {
      if (res.status === 200) return res.json().then(function (j) { sync.sha = j.sha; });
      sync.sha = '';
    }).then(function () { closeDlg(); return pushNow(); }).catch(function () { sync.busy = false; setState('err', '네트워크 오류'); });
  }
  function startSync() { if (sync.cfg) { setState('busy', '연결 중'); pull(); } else setState('off'); }

  function renderSyncBtn() {
    var b = $('#syncbtn'); if (!b) return;
    var cls = 'sync', t;
    if (!sync.cfg) { t = '이 기기에만 저장 중'; }
    else if (sync.state === 'err') { cls += ' sync-err'; t = sync.msg; }
    else if (sync.state === 'busy') { cls += ' sync-busy'; t = sync.msg || '동기화 중'; }
    else { cls += ' sync-ok'; t = '동기화됨' + (sync.at ? ' ' + sync.at : ''); }
    b.className = cls; b.querySelector('.t').textContent = t;
  }

  /* ---------- 다이얼로그 ---------- */
  var dlg = $('#dlg'), dbody = $('#dlg-body');
  function openDlg(fn) { ui.dlgFn = fn; dbody.innerHTML = fn(); if (!dlg.open) dlg.showModal(); }
  function rerenderDlg() { if (ui.dlgFn && dlg.open) { var st = dbody.scrollTop; dbody.innerHTML = ui.dlgFn(); dbody.scrollTop = st; } }
  function closeDlg() { ui.dlgFn = null; if (dlg.open) dlg.close(); }
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDlg(); });
  dlg.addEventListener('close', function () { ui.dlgFn = null; });

  var toastT = null;
  function toast(msg, undoFn) {
    var t = $('#toast'); t.hidden = false; t.innerHTML = '<span>' + esc(msg) + '</span>' + (undoFn ? '<button type="button" data-act="undo">되돌리기</button>' : '');
    ui.undo = undoFn || null; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; ui.undo = null; }, 6000);
  }

  /* ---------- 화면 ---------- */
  function dchip(date, done) {
    if (done) return '<span class="dchip done">완료</span>';
    var dd = C.diffDays(today(), date);
    if (dd < 0) return '<span class="dchip late">' + (-dd) + '일 지남</span>';
    if (dd === 0) return '<span class="dchip near">오늘</span>';
    return '<span class="dchip ' + (dd <= 7 ? 'near' : 'far') + '">D-' + dd + '</span>';
  }
  function headerDate() { var t = today(); return Number(t.slice(5, 7)) + '월 ' + Number(t.slice(8, 10)) + '일 (' + C.weekday(t) + ')'; }

  function needTotal() { var n = 0, T = today(); data.items.forEach(function (i) { n += C.summarize(i, T).need; }); return n; }

  function render() {
    var y = window.scrollY, T = today();
    var upto = C.addDays(T, 60), mEnd = C.lastDayOfYm(ui.month);
    if (mEnd > upto) upto = mEnd;
    var occs = C.allOcc(data, upto);
    var h = '';
    h += '<header class="top"><div class="top-l"><h1>지출 관리</h1><span class="date">' + esc(headerDate()) + '</span></div>' +
      '<div class="top-r"><button type="button" class="sync" id="syncbtn" data-act="sync"><i class="dot"></i><span class="t"></span></button>' +
      '<button type="button" class="btn pale" data-act="settings">' + svgx('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14 3h-4l-.6 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2L10 21h4l.6-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>') + '설정</button>' +
      '<button type="button" class="btn pri add" data-act="add">' + svgx('<path d="M12 5v14M5 12h14"/>') + '추가</button></div></header>';

    var need = needTotal();
    if (need) h += '<button type="button" class="alert" data-act="ledger">가계부 기입이 필요한 결제 ' + need + '건 <span>· 눌러서 확인</span></button>';

    if (!data.cards.length && !data.items.length) {
      h += '<div class="empty"><p><b>아직 등록된 내용이 없어요.</b></p><p class="note" style="margin-top:6px">먼저 카드와 연결 통장을 등록하고, 예정 지출·고정 지출을 추가해 보세요.</p>' +
        '<button type="button" class="btn pri" data-act="settings">카드·통장 등록</button> <button type="button" class="btn pale" data-act="sample">샘플로 둘러보기</button></div>';
    } else {
      h += hero(occs, T) + timelinePanel(occs, T) + cardSection(occs, T) + plannedSection(T) + fixedSection(T);
    }
    h += '<button type="button" class="fab" data-act="add" aria-label="추가">' + svgx('<path d="M12 5v14M5 12h14"/>') + '</button>';
    $('#app').innerHTML = h;
    renderSyncBtn();
    window.scrollTo(0, y);
  }

  function hero(occs, T) {
    var st = C.monthStats(occs, ui.month), pct = st.total ? Math.round(st.paid / st.total * 100) : 0;
    var p = ui.month.split('-');
    var s = '<section class="hero"><div class="sum"><div class="sum-top"><div>' +
      '<div class="mnav"><button type="button" data-act="mprev" aria-label="이전 달">' + svgx('<path d="M15 6l-6 6 6 6"/>') + '</button><span class="cur">' + p[0] + '년 ' + Number(p[1]) + '월</span><button type="button" data-act="mnext" aria-label="다음 달">' + svgx('<path d="M9 6l6 6-6 6"/>') + '</button></div>' +
      '<div class="note" style="margin-top:6px">이번 달 총 지출 예정액</div><div class="big">' + won(st.total) + '</div></div>' +
      '<div class="split"><div><div class="l">예정 지출</div><div class="v">' + won(st.planned) + '</div></div><div><div class="l">고정 지출</div><div class="v">' + won(st.fixed) + '</div></div></div></div>' +
      '<div><div class="bar" role="img" aria-label="결제 진행률 ' + pct + '%"><i style="width:' + pct + '%"></i></div>' +
      '<div class="legend"><span>결제 완료 ' + won(st.paid) + '</span><span>남은 금액 ' + won(st.unpaid) + (st.unpaidN ? ' (' + st.unpaidN + '건)' : '') + '</span></div></div></div>';
    var groups = C.groupUpcoming(occs, data.cards);
    s += nextCard(groups, T) + '</section>';
    return s;
  }

  function groupTitle(g) {
    var card = cardById(g.cardId);
    if (g.occs.length > 1 || !g.occs[0]) return (card ? card.name : '카드 없음') + ' 결제일';
    return g.occs[0].item.name;
  }
  function groupNames(g) { return g.occs.map(function (o) { return esc(o.item.name); }).join(' · '); }
  function acctChip(g, soft) {
    var card = cardById(g.cardId);
    return card && card.account ? '<span class="acct' + (soft ? ' soft' : '') + '">' + esc(card.account) + ' 잔액 확인</span>' : '';
  }

  function nextCard(groups, T) {
    if (!groups.length) return '<div class="next"><div class="lbl">다음 결제</div><div class="ttl">예정된 결제가 없어요</div><div class="note">모든 결제를 마쳤어요.</div></div>';
    var g = groups[0], dd = C.diffDays(T, g.date);
    var dtxt = dd < 0 ? (-dd) + '일 지남' : (dd === 0 ? '오늘' : 'D-' + dd);
    var s = '<div class="next"><div class="lbl">다음 결제</div><div class="dd"><b>' + dtxt + '</b><span>' + C.mdw(g.date) + '</span></div>' +
      '<div class="ttl">' + esc(groupTitle(g)) + '</div><div class="amt">' + won(g.total) + '</div>' +
      (g.occs.length > 1 ? '<div class="names">' + groupNames(g) + '</div>' : '') + acctChip(g) +
      '<div><button type="button" class="btn pri sm" data-act="paygroup" data-card="' + esc(g.cardId) + '" data-date="' + g.date + '">결제 완료</button></div>';
    var rest = groups.slice(1, 4);
    if (rest.length) {
      s += '<div class="later">' + rest.map(function (x) {
        var c = cardById(x.cardId);
        return '<div><span>' + C.md(x.date) + ' ' + esc(c ? c.name : '카드 없음') + '</span><b>' + won(x.total) + '</b></div>';
      }).join('') + '</div>';
    }
    return s + '</div>';
  }

  function timelinePanel(occs, T) {
    var past = data.settings.pastDays, fut = data.settings.futureDays;
    var tl = C.timeline(occs, T, past, fut);
    var last = [-99, -99];
    var marks = tl.marks.map(function (m) {
      var lv = 0;
      if (m.left - last[0] >= 13) lv = 0; else if (m.left - last[1] >= 13) lv = 1; else lv = last[0] <= last[1] ? 0 : 1;
      last[lv] = m.left;
      var sb = m.state === 'done' ? '결제 완료' : (m.state === 'late' ? (-m.dd) + '일 지남' : (m.dd === 0 ? '오늘' : 'D-' + m.dd));
      return '<div class="mk ' + m.state + (lv ? ' lv1' : '') + '" style="left:' + m.left.toFixed(2) + '%"><span class="ln u"></span><span class="ln d"></span>' +
        '<div class="amt">' + won(m.total) + '</div><i class="pt"></i><div class="dt">' + C.md(m.date) + ' (' + C.weekday(m.date) + ')</div><div class="sb">' + sb + (m.count > 1 ? ' · ' + m.count + '건' : '') + '</div></div>';
    }).join('');
    return '<section class="panel tlp"><div class="ph"><h2>결제 타임라인 <span class="note">지난 ' + past + '일 ~ 앞으로 ' + fut + '일</span></h2>' +
      '<div class="lg"><span><i style="background:var(--mint-dot)"></i>결제 완료</span><span><i style="background:var(--bar)"></i>예정</span><span><i style="background:var(--late-dot)"></i>지남</span></div></div>' +
      '<div class="tl-scroll"><div class="tl"><div class="track"></div><div class="past" style="width:' + tl.todayLeft.toFixed(2) + '%"></div>' +
      '<div class="today" style="left:' + tl.todayLeft.toFixed(2) + '%"><span>오늘</span><i></i></div>' + marks + '</div></div></section>';
  }

  function cardSection(occs, T) {
    var groups = C.groupUpcoming(occs, data.cards), seen = {}, list = [];
    groups.forEach(function (g) { if (!seen[g.cardId]) { seen[g.cardId] = 1; list.push(g); } });
    if (!list.length) return '';
    var tiles = list.map(function (g) {
      var card = cardById(g.cardId), dd = C.diffDays(T, g.date);
      return '<article class="tile"><div class="r1">' + (card ? cardTag(card) : '<span class="tag neutral">카드 없음</span>') + dchip(g.date) + '</div>' +
        '<div><div class="small">' + esc(groupTitle(g)) + ' · ' + C.mdw(g.date) + '</div><div class="amt">' + won(g.total) + '</div></div>' +
        '<div class="names">' + groupNames(g) + '</div>' + acctChip(g, true) +
        '<div class="mt"><span>' + g.occs.length + '건 합산</span><button type="button" class="btn pale sm" data-act="paygroup" data-card="' + esc(g.cardId) + '" data-date="' + g.date + '">결제 완료</button></div></article>';
    }).join('');
    return '<section class="sec"><div class="sh"><h2>카드별 다음 결제</h2></div><div class="grid">' + tiles + '</div></section>';
  }

  function itemCard(it, T) {
    var s = C.summarize(it, T), card = cardById(it.cardId), tags = '', amtb, prog = '', next = s.next, ended;
    var need = s.need ? '<span class="badge">기입 필요 ' + s.need + '</span>' : '';
    var chip, foot;
    if (it.kind === 'planned') {
      tags = '<span class="pill ' + (it.payType === 'once' ? 'once' : '') + '">' + (it.payType === 'once' ? '일시불' : '할부 ' + s.n + '개월' + (it.interestFree ? ' · 무이자' : '')) + '</span>' + cardTag(card) + need;
      amtb = '<div class="lbl">남은 금액</div><div class="num">' + won(s.remainAmt) + '</div><div class="sub">' + (it.payType === 'once' ? (next ? '결제 전' : '결제 완료') : '남은 ' + s.remainN + '회 / 총 ' + s.n + '회') + '</div>';
      if (it.payType !== 'once') prog = '<div class="prog"><div class="bar2"><i style="width:' + Math.round(s.paidN / s.n * 100) + '%"></i></div><div class="t">' + s.paidN + '회 결제 · ' + won(s.paidAmt) + '</div></div>';
      chip = next ? dchip(next.planned) : dchip('', true);
    } else {
      tags = '<span class="pill">고정 · 매월 ' + it.payDay + '일</span>' + cardTag(card) + need;
      ended = s.ended;
      amtb = '<div class="lbl">매월</div><div class="num">' + won(it.amount) + '</div><div class="sub">' + (ended ? '종료됨' : s.months + '개월째') + '</div>';
      prog = '<div class="prog"><div class="t">' + (ended ? '종료일 ' + esc(it.endDate) : (s.thisMonthPaid ? '이번 달 결제 완료' : '이번 달 결제 전')) + '</div></div>';
      chip = next ? dchip(next.planned) : '<span class="dchip done">종료</span>';
    }
    if (next) foot = '<div class="fd"><span class="lbl">다음 결제</span><span class="dt">' + C.mdw(next.planned) + '</span></div><button type="button" class="btn pri sm" data-act="pay" data-id="' + it.id + '" data-key="' + esc(next.key) + '">결제 완료</button>';
    else foot = '<span class="paid-note">' + (it.kind === 'planned' ? '모두 결제 완료' : '종료됨') + '</span>';
    return '<article class="item" data-act="open" data-id="' + it.id + '"><span class="ic">' + ico(it.icon) + '</span><span class="dch">' + chip + '</span>' +
      '<h3 class="ttl"><button type="button" data-act="open" data-id="' + it.id + '">' + esc(it.name) + '</button></h3><div class="tags">' + tags + '</div>' +
      '<div class="amtb">' + amtb + '</div>' + prog + '<div class="foot">' + foot + '</div></article>';
  }
  function sortByNext(a, b, T) {
    var sa = C.summarize(a, T), sb = C.summarize(b, T);
    var da = sa.next ? sa.next.planned : '9999', db = sb.next ? sb.next.planned : '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  }
  function plannedSection(T) {
    var all = data.items.filter(function (i) { return i.kind === 'planned'; });
    var active = all.filter(function (i) { return C.summarize(i, T).status !== 'done'; }).sort(function (a, b) { return sortByNext(a, b, T); });
    var done = all.filter(function (i) { return C.summarize(i, T).status === 'done'; });
    var list = ui.pf === 'active' ? active : done;
    return '<section class="sec"><div class="sh"><h2>예정 지출 <span class="cnt">' + list.length + '</span></h2><div class="sh-r">' + seg('pf', ui.pf, [['active', '진행 중 ' + active.length], ['done', '완료 ' + done.length]]) +
      '<button type="button" class="btn pale sm" data-act="add" data-kind="planned">+ 예정 지출</button></div></div><div class="grid">' +
      (list.length ? list.map(function (i) { return itemCard(i, T); }).join('') : '<div class="empty">' + (ui.pf === 'active' ? '진행 중인 예정 지출이 없어요.' : '완료된 예정 지출이 없어요.') + '</div>') + '</div></section>';
  }
  function fixedSection(T) {
    var all = data.items.filter(function (i) { return i.kind === 'fixed'; });
    var active = all.filter(function (i) { return !C.summarize(i, T).ended; }).sort(function (a, b) { return sortByNext(a, b, T); });
    var ended = all.filter(function (i) { return C.summarize(i, T).ended; });
    var list = ui.ff === 'active' ? active : ended;
    return '<section class="sec"><div class="sh"><h2>고정 지출 <span class="cnt">' + list.length + '</span></h2><div class="sh-r">' + seg('ff', ui.ff, [['active', '이용 중 ' + active.length], ['ended', '종료 ' + ended.length]]) +
      '<button type="button" class="btn pale sm" data-act="add" data-kind="fixed">+ 고정 지출</button></div></div><div class="grid">' +
      (list.length ? list.map(function (i) { return itemCard(i, T); }).join('') : '<div class="empty">' + (ui.ff === 'active' ? '이용 중인 고정 지출이 없어요.' : '종료된 고정 지출이 없어요.') + '</div>') + '</div></section>';
  }
  function seg(name, cur, opts) {
    return '<div class="seg" role="group">' + opts.map(function (o) { return '<button type="button" data-act="seg" data-seg="' + name + '" data-v="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }

  /* ---------- 결제 완료 / 기입 ---------- */
  function payOne(id, key) {
    var it = itemById(id); if (!it) return;
    var snap = snapshot(); C.setPaid(it, key, today()); commit(); rerenderDlg();
    toast('결제일 ' + C.md(today()) + ' 기록 · ' + it.name, function () { restore(snap); rerenderDlg(); });
  }
  function payGroup(cardId, date) {
    var occs = C.allOcc(data, C.addDays(today(), 60)).filter(function (o) { return !o.paid && o.cardId === cardId && o.planned === date; });
    if (!occs.length) return;
    var snap = snapshot();
    occs.forEach(function (o) { C.setPaid(o.item, o.key, today()); });
    commit(); toast(occs.length + '건 결제일 ' + C.md(today()) + ' 기록', function () { restore(snap); });
  }

  /* ---------- 상세 ---------- */
  function dlgDetail(id) {
    return function () {
      var it = itemById(id); if (!it) return '<p>항목을 찾을 수 없어요.</p>';
      var T = today(), s = C.summarize(it, T), card = cardById(it.cardId);
      var occs = C.occOf(it, C.addDays(T, 45));
      if (it.kind === 'fixed') occs = occs.slice().reverse().slice(0, 24);
      var tags = it.kind === 'planned' ? '<span class="pill ' + (it.payType === 'once' ? 'once' : '') + '">' + (it.payType === 'once' ? '일시불' : '할부 ' + s.n + '개월') + '</span>' : '<span class="pill">고정 · 매월 ' + it.payDay + '일</span>';
      tags += cardTag(card) + (card && card.account ? '<span class="tag neutral">' + esc(card.account) + '</span>' : '') + (it.category ? '<span class="tag neutral">' + esc(it.category) + '</span>' : '');
      var facts = it.kind === 'planned'
        ? '<div><div class="l">전체 금액</div><div class="v">' + won(s.total) + '</div></div><div><div class="l">남은 금액</div><div class="v deep">' + won(s.remainAmt) + '</div></div><div><div class="l">결제 진행</div><div class="v">' + s.paidN + ' / ' + s.n + '회</div></div>'
        : '<div><div class="l">매월</div><div class="v">' + won(it.amount) + '</div></div><div><div class="l">이용 기간</div><div class="v">' + s.months + '개월째</div></div><div><div class="l">최근 결제</div><div class="v">' + (s.lastPaid ? C.md(s.lastPaid.paid) : '-') + '</div></div>';
      var rows = occs.map(function (o) {
        var label = it.kind === 'planned' ? o.key + '회차' : o.key.slice(2).replace('-', '') ? Number(o.key.slice(5)) + '월' : o.key;
        if (it.kind === 'fixed') label = o.key.slice(2, 4) + '년 ' + Number(o.key.slice(5)) + '월';
        var chip, link = '';
        if (!o.paid) { chip = '<span class="chip">예정</span>'; link = '<button type="button" class="lnk" data-act="pay" data-id="' + it.id + '" data-key="' + esc(o.key) + '">오늘 결제함</button>'; }
        else if (o.ledger) chip = '<button type="button" class="chip ok" data-act="ledger1" data-id="' + it.id + '" data-key="' + esc(o.key) + '" aria-label="기입 완료, 누르면 기입 필요로 바꿔요">기입 완료</button>';
        else chip = '<button type="button" class="chip need" data-act="ledger1" data-id="' + it.id + '" data-key="' + esc(o.key) + '" aria-label="기입 필요, 누르면 기입 완료로 바꿔요">기입 필요</button>';
        var fid = it.id + '-' + o.key;
        return '<div class="prow"><div class="pl">' + esc(label) + '</div>' +
          field('예정일', 'date', o.planned, 'planned', it.id, o.key, fid) + field('결제일', 'date', o.paid, 'paid', it.id, o.key, fid) + field('금액', 'number', o.amount, 'amount', it.id, o.key, fid) +
          '<div class="pc">' + chip + link + '</div></div>';
      }).join('');
      return '<div class="dh"><div><h2>' + esc(it.name) + '</h2><div class="dtags">' + tags + '</div></div><button type="button" class="x" data-act="close" aria-label="닫기">' + svgx('<path d="M6 6l12 12M18 6L6 18"/>') + '</button></div>' +
        '<div class="facts">' + facts + '</div>' + rows + (it.memo ? '<p class="memo">' + esc(it.memo) + '</p>' : '') +
        '<p class="note" style="margin-top:10px">예정일과 다른 날 결제했다면 결제일을 직접 바꿔 주세요. 남은 금액·회차는 자동으로 계산돼요.</p>' +
        '<div class="dact"><button type="button" class="btn pale" data-act="edit" data-id="' + it.id + '">수정</button><button type="button" class="btn danger" data-act="del" data-id="' + it.id + '">삭제</button><span class="sp"></span><button type="button" class="btn pri" data-act="close">닫기</button></div>';
    };
  }
  function field(lab, type, val, f, id, key, fid) {
    var inp = type === 'number'
      ? '<input class="in sm" type="number" inputmode="numeric" min="0" step="1" value="' + esc(val) + '" id="' + esc(fid + f) + '" data-f="' + f + '" data-id="' + id + '" data-key="' + esc(key) + '">'
      : '<input class="in sm" type="date" value="' + esc(val) + '" id="' + esc(fid + f) + '" data-f="' + f + '" data-id="' + id + '" data-key="' + esc(key) + '">';
    return '<div class="pf"><label for="' + esc(fid + f) + '"><span>' + lab + '</span></label>' + inp + '</div>';
  }

  /* ---------- 추가/수정 폼 ---------- */
  function iconRadios(cur) {
    return '<fieldset class="icons"><legend>아이콘</legend>' + Object.keys(ICONS).map(function (k) {
      return '<label><input type="radio" name="icon" value="' + k + '"' + (k === cur ? ' checked' : '') + '><span title="' + ICON_NAMES[k] + '">' + ico(k, 20) + '</span><span class="sr">' + ICON_NAMES[k] + '</span></label>';
    }).join('') + '</fieldset>';
  }
  function cardSelect(cur) {
    return '<div class="fld"><label for="f-card">결제 카드</label><select class="in" id="f-card" name="cardId"><option value="">카드 없음</option>' +
      data.cards.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(c.name) + ' (매월 ' + c.billingDay + '일)</option>'; }).join('') + '</select>' +
      (data.cards.length ? '' : '<span class="note">설정에서 카드·연결 통장을 먼저 등록하면 편해요.</span>') + '</div>';
  }
  function dlgForm(kind, id) {
    return function () {
      var it = id ? itemById(id) : null, T = today();
      if (id && !it) return '<p>항목을 찾을 수 없어요.</p>';
      kind = it ? it.kind : kind;
      var isNew = !it, v = it || {}, h = '';
      h += '<div class="dh"><h2>' + (isNew ? (kind === 'planned' ? '예정 지출 추가' : '고정 지출 추가') : '항목 수정') + '</h2><button type="button" class="x" data-act="close" aria-label="닫기">' + svgx('<path d="M6 6l12 12M18 6L6 18"/>') + '</button></div>';
      h += '<form class="form" id="itemform" data-kind="' + kind + '" data-id="' + (id || '') + '" novalidate>';
      if (isNew) h += '<div class="seg" role="group" style="align-self:flex-start"><button type="button" data-act="kind" data-kind="planned" aria-pressed="' + (kind === 'planned') + '">예정 지출</button><button type="button" data-act="kind" data-kind="fixed" aria-pressed="' + (kind === 'fixed') + '">고정 지출</button></div>';
      h += '<div class="fld"><label for="f-name">이름</label><input class="in" id="f-name" name="name" required maxlength="60" value="' + esc(v.name || '') + '" autocomplete="off"></div>';
      h += iconRadios(v.icon || 'card') + cardSelect(v.cardId || '');
      if (kind === 'planned') {
        var s = it ? C.summarize(it, T) : null;
        h += '<div class="row2"><div class="fld"><label for="f-type">결제 방식</label><select class="in" id="f-type" name="payType"' + (it ? ' disabled' : '') + '><option value="installment"' + (v.payType !== 'once' ? ' selected' : '') + '>할부</option><option value="once"' + (v.payType === 'once' ? ' selected' : '') + '>일시불</option></select></div>';
        if (isNew) {
          h += '<div class="fld"><label for="f-months">할부 개월</label><input class="in" id="f-months" name="months" type="number" inputmode="numeric" min="2" max="60" value="3"></div></div>' +
            '<div class="row2"><div class="fld"><label for="f-total">총 금액 (원)</label><input class="in" id="f-total" name="total" type="number" inputmode="numeric" min="1" step="1" data-live></div>' +
            '<div class="fld"><label for="f-buy">구매일</label><input class="in" id="f-buy" name="buyDate" type="date" value="' + T + '"></div></div>' +
            '<div class="row2"><div class="fld"><label for="f-first">첫 결제 예정일</label><input class="in" id="f-first" name="firstDate" type="date"></div>' +
            '<div class="fld"><label for="f-paid">이미 결제한 회차</label><input class="in" id="f-paid" name="paidCount" type="number" inputmode="numeric" min="0" value="0"></div></div>' +
            '<div class="pv" id="pv" aria-live="polite"></div>';
        } else {
          h += '<div class="fld"><label for="f-buy">구매일</label><input class="in" id="f-buy" name="buyDate" type="date" value="' + esc(v.buyDate || '') + '"></div></div>' +
            '<p class="note">금액과 날짜는 상세 화면의 회차 목록에서 바꿀 수 있어요.</p>';
        }
        h += '<label class="chk"><input type="checkbox" name="interestFree"' + (v.interestFree ? ' checked' : '') + '> 무이자 할부</label>';
      } else {
        h += '<div class="row2"><div class="fld"><label for="f-amt">매월 금액 (원)</label><input class="in" id="f-amt" name="amount" type="number" inputmode="numeric" min="1" step="1" value="' + esc(v.amount || '') + '"></div>' +
          '<div class="fld"><label for="f-day">결제일 (매월 며칠)</label><input class="in" id="f-day" name="payDay" type="number" inputmode="numeric" min="1" max="31" value="' + esc(v.payDay || '') + '"></div></div>' +
          '<div class="row2"><div class="fld"><label for="f-start">이용 시작일</label><input class="in" id="f-start" name="startDate" type="date" value="' + esc(v.startDate || T) + '"></div>' +
          '<div class="fld"><label for="f-end">종료일 (선택)</label><input class="in" id="f-end" name="endDate" type="date" value="' + esc(v.endDate || '') + '"></div></div>';
        if (isNew) h += '<label class="chk"><input type="checkbox" name="paidThisMonth"> 이번 달 이미 결제했어요</label><p class="note">이 앱을 쓰기 전의 결제 기록은 만들지 않고, 이번 달부터 관리해요.</p>';
      }
      h += '<div class="fld"><label for="f-cat">분류 (선택)</label><input class="in" id="f-cat" name="category" maxlength="30" value="' + esc(v.category || '') + '"></div>' +
        '<div class="fld"><label for="f-memo">메모 (선택)</label><textarea class="in" id="f-memo" name="memo" maxlength="300">' + esc(v.memo || '') + '</textarea></div>' +
        '<div class="err" id="ferr" role="alert" hidden></div>' +
        '<div class="dact" style="margin-top:4px"><span class="sp"></span><button type="button" class="btn ghost" data-act="close">취소</button><button type="submit" class="btn pri">저장</button></div></form>';
      return h;
    };
  }
  var formTouched = false;
  function afterForm() {
    var f = $('#itemform'); if (!f) return;
    formTouched = false; updateForm(true);
  }
  function fv(f, n) { var e = f.elements[n]; return e ? e.value : ''; }
  function updateForm(initial) {
    var f = $('#itemform'); if (!f) return;
    var kind = f.dataset.kind, card = cardById(fv(f, 'cardId'));
    if (f.dataset.id) return;
    if (kind === 'planned') {
      var buy = fv(f, 'buyDate') || today();
      if (!formTouched || !fv(f, 'firstDate')) f.elements.firstDate.value = card ? C.firstPayDefault(card.billingDay, buy) : C.addMonths(buy, 1);
      var once = fv(f, 'payType') === 'once';
      f.elements.months.disabled = once; f.elements.paidCount.disabled = once;
      var total = Number(fv(f, 'total')), n = once ? 1 : Math.max(2, parseInt(fv(f, 'months'), 10) || 2), first = fv(f, 'firstDate'), pv = $('#pv');
      if (!pv) return;
      if (!total || !first) { pv.textContent = '금액을 입력하면 회차별 금액이 계산돼요.'; return; }
      var ps = C.makePayments(total, n, first);
      pv.innerHTML = once ? '<b>' + won(total) + '</b> 일시불 · ' + C.mdw(first) + ' 결제 예정'
        : (ps[0].amount === ps[1].amount ? '월 <b>' + won(ps[0].amount) + '</b> × ' + n + '회' : '1회차 <b>' + won(ps[0].amount) + '</b>, 이후 <b>' + won(ps[1].amount) + '</b> × ' + (n - 1) + '회') + ' · 첫 결제 ' + C.mdw(first) + ' · 마지막 ' + C.mdw(ps[n - 1].planned);
    } else if (!formTouched || !fv(f, 'payDay')) {
      if (card && !formTouched) f.elements.payDay.value = card.billingDay;
    }
  }
  function submitForm(f) {
    var kind = f.dataset.kind, id = f.dataset.id, err = $('#ferr'), T = today();
    function fail(m) { err.textContent = m; err.hidden = false; }
    var name = fv(f, 'name').trim(); if (!name) return fail('이름을 입력해 주세요.');
    var icon = (f.querySelector('input[name="icon"]:checked') || {}).value || 'card';
    var common = { name: name, icon: icon, cardId: fv(f, 'cardId'), category: fv(f, 'category').trim(), memo: fv(f, 'memo').trim() };
    var snap = snapshot();
    if (kind === 'planned') {
      var ifree = f.elements.interestFree.checked;
      if (id) {
        var it = itemById(id); Object.assign(it, common, { interestFree: ifree, buyDate: fv(f, 'buyDate') });
      } else {
        var once = fv(f, 'payType') === 'once', total = parseInt(fv(f, 'total'), 10), months = parseInt(fv(f, 'months'), 10), first = fv(f, 'firstDate');
        if (!(total > 0)) return fail('총 금액을 입력해 주세요.');
        if (!once && !(months >= 2 && months <= 60)) return fail('할부 개월은 2~60 사이로 입력해 주세요.');
        if (!first) return fail('첫 결제 예정일을 입력해 주세요.');
        var item = C.createPlanned(Object.assign({}, common, { payType: once ? 'once' : 'installment', total: total, months: months, firstDate: first, buyDate: fv(f, 'buyDate'), interestFree: ifree, paidCount: once ? 0 : parseInt(fv(f, 'paidCount'), 10) || 0 }));
        data.items.push(item);
      }
    } else {
      var amount = parseInt(fv(f, 'amount'), 10), day = parseInt(fv(f, 'payDay'), 10), st = fv(f, 'startDate'), en = fv(f, 'endDate');
      if (!(amount > 0)) return fail('매월 금액을 입력해 주세요.');
      if (!(day >= 1 && day <= 31)) return fail('결제일은 1~31 사이로 입력해 주세요.');
      if (!st) return fail('이용 시작일을 입력해 주세요.');
      if (en && en < st) return fail('종료일이 시작일보다 빨라요.');
      if (id) {
        var fx = itemById(id); Object.assign(fx, common, { amount: amount, payDay: day, startDate: st, endDate: en });
        var sy = C.ymOf(st); if (sy > fx.trackFrom) fx.trackFrom = sy;
      } else {
        data.items.push(C.createFixed(Object.assign({}, common, { amount: amount, payDay: day, startDate: st, endDate: en, paidThisMonth: f.elements.paidThisMonth.checked }), T));
      }
    }
    commit(); var reopen = id ? dlgDetail(id) : null;
    if (reopen) openDlg(reopen); else closeDlg();
    toast(id ? '수정했어요' : '추가했어요', function () { restore(snap); closeDlg(); });
  }

  /* ---------- 설정 / 카드 ---------- */
  function dlgSettings() {
    var d = data.settings;
    var rows = data.cards.map(function (c) {
      return '<div class="crow"><div class="fld"><label for="cn-' + c.id + '">카드 이름</label><input class="in sm" id="cn-' + c.id + '" data-cf="name" data-cid="' + c.id + '" value="' + esc(c.name) + '" maxlength="30"></div>' +
        '<div class="fld"><label for="ca-' + c.id + '">연결 통장</label><input class="in sm" id="ca-' + c.id + '" data-cf="account" data-cid="' + c.id + '" value="' + esc(c.account || '') + '" maxlength="30" placeholder="예: 신한 입출금통장"></div>' +
        '<div class="fld"><label for="cb-' + c.id + '">결제일</label><input class="in sm" type="number" min="1" max="31" id="cb-' + c.id + '" data-cf="billingDay" data-cid="' + c.id + '" value="' + esc(c.billingDay) + '"></div>' +
        '<div class="fld"><label for="ct-' + c.id + '">색</label><select class="in sm" id="ct-' + c.id + '" data-cf="tone" data-cid="' + c.id + '">' + ['남보라', '하늘', '초록', '살구', '연보라'].map(function (n, i) { return '<option value="' + i + '"' + ((c.tone || 0) === i ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
        '<button type="button" class="btn danger sm" data-act="delcard" data-cid="' + c.id + '" aria-label="' + esc(c.name) + ' 삭제">삭제</button></div>';
    }).join('');
    return '<div class="dh"><h2>설정</h2><button type="button" class="x" data-act="close" aria-label="닫기">' + svgx('<path d="M6 6l12 12M18 6L6 18"/>') + '</button></div>' +
      '<h3 style="margin:8px 0">카드 · 연결 통장</h3><p class="note" style="margin-bottom:8px">결제일은 카드의 매월 결제일이에요. 다음 결제 카드에 “○○통장 잔액 확인” 문구가 표시돼요.</p>' +
      (rows || '<p class="note">등록된 카드가 없어요.</p>') + '<button type="button" class="btn pale sm" data-act="addcard" style="margin-top:8px">+ 카드 추가</button>' +
      '<h3 style="margin:24px 0 8px">타임라인 범위</h3><div class="row2"><div class="fld"><label for="s-past">지난 일수</label><input class="in" id="s-past" type="number" min="0" max="60" data-sf="pastDays" value="' + d.pastDays + '"></div>' +
      '<div class="fld"><label for="s-fut">앞으로 일수</label><input class="in" id="s-fut" type="number" min="1" max="90" data-sf="futureDays" value="' + d.futureDays + '"></div></div>' +
      '<h3 style="margin:24px 0 8px">데이터</h3><div class="dact" style="border:0;margin:0;padding:0"><button type="button" class="btn pale" data-act="backup">백업 파일 받기</button><button type="button" class="btn pale" data-act="sample">샘플 데이터 넣기</button><button type="button" class="btn pale" data-act="sync">저장소 연결</button></div>' +
      '<div class="dact"><span class="sp"></span><button type="button" class="btn pri" data-act="close">닫기</button></div>';
  }
  function sampleData() {
    var T = today(), nb10 = C.nextBilling(10, T), nb12 = C.nextBilling(12, T);
    var sh = { id: C.uid(), name: '신한 욜로', account: '신한 입출금통장', billingDay: 10, tone: 0 };
    var kb = { id: C.uid(), name: '국민 노리', account: '국민 입출금통장', billingDay: 12, tone: 1 };
    var cur = C.ymOf(T), d = Number(T.slice(8, 10));
    var bn = C.createPlanned({ name: '보넥도 낙원2 부산 중콘', icon: 'ticket', cardId: sh.id, payType: 'installment', total: 55600, months: 4, firstDate: C.addMonths(nb10, -3), paidCount: 3, category: '콘서트' });
    bn.payments[2].ledger = false;
    var items = [
      C.createPlanned({ name: '해리포터 금지된 숲', icon: 'bag', cardId: sh.id, payType: 'installment', total: 78000, months: 3, firstDate: nb10, interestFree: true, category: '굿즈' }),
      bn,
      C.createPlanned({ name: '겨울 패딩', icon: 'bag', cardId: kb.id, payType: 'once', total: 189000, firstDate: nb12, category: '의류' }),
      C.createFixed({ name: 'T 우주패스 (유튜브 프리미엄)', icon: 'play', cardId: kb.id, amount: 13900, payDay: 12, startDate: '2024-01-12', paidThisMonth: d >= 12 }, T),
      C.createFixed({ name: '넷플릭스 프리미엄', icon: 'play', cardId: kb.id, amount: 10000, payDay: 12, startDate: '2024-03-12', paidThisMonth: d >= 12 }, T),
      C.createFixed({ name: 'KT 통신비', icon: 'phone', cardId: kb.id, amount: 42000, payDay: 12, startDate: '2025-06-12', paidThisMonth: d >= 12 }, T),
      C.createFixed({ name: '위버스 DM', icon: 'heart', cardId: sh.id, amount: 27000, payDay: 3, startDate: '2026-01-03', paidThisMonth: d >= 3 }, T)
    ];
    data.cards = [sh, kb]; data.items = items; ui.month = cur;
  }

  /* ---------- 기타 다이얼로그 ---------- */
  function dlgLedger() {
    var T = today(), rows = [];
    data.items.forEach(function (it) { C.occOf(it, C.addDays(T, 45)).forEach(function (o) { if (o.paid && !o.ledger) rows.push([it, o]); }); });
    rows.sort(function (a, b) { return a[1].paid < b[1].paid ? 1 : -1; });
    return '<div class="dh"><h2>가계부 기입이 필요한 결제</h2><button type="button" class="x" data-act="close" aria-label="닫기">' + svgx('<path d="M6 6l12 12M18 6L6 18"/>') + '</button></div>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="lrow"><div class="nm"><b>' + esc(r[0].name) + '</b><span>' + C.mdw(r[1].paid) + ' 결제 · ' + won(r[1].amount) + '</span></div><button type="button" class="btn pale sm" data-act="ledger1" data-id="' + r[0].id + '" data-key="' + esc(r[1].key) + '">기입 완료</button></div>';
      }).join('') + '<div class="dact"><button type="button" class="btn pale" data-act="ledgerall">모두 기입 완료</button><span class="sp"></span><button type="button" class="btn pri" data-act="close">닫기</button></div>'
        : '<p class="note" style="padding:16px 0">모두 기입했어요 🎉</p><div class="dact"><span class="sp"></span><button type="button" class="btn pri" data-act="close">닫기</button></div>');
  }
  function dlgConfirm(title, msg, okLabel, fn) {
    ui.confirmFn = fn;
    return function () {
      return '<div class="dh"><h2>' + esc(title) + '</h2></div><p style="line-height:1.6">' + esc(msg) + '</p><div class="dact"><span class="sp"></span><button type="button" class="btn ghost" data-act="close">취소</button><button type="button" class="btn pri" data-act="confirm">' + esc(okLabel) + '</button></div>';
    };
  }
  function openConflict() {
    openDlg(function () {
      return '<div class="dh"><h2>다른 기기에서 먼저 수정했어요</h2></div><p style="line-height:1.6">저장소의 내용과 이 기기의 내용이 달라요. 어느 쪽을 쓸까요?</p>' +
        '<div class="dact" style="flex-direction:column;align-items:stretch"><button type="button" class="btn pri" data-act="takeserver">저장소 내용 불러오기 (이 기기의 최근 수정은 사라져요)</button><button type="button" class="btn danger" data-act="overwrite">내 내용으로 덮어쓰기</button></div>';
    });
  }
  function dlgSync() {
    var c = sync.cfg;
    return '<div class="dh"><h2>저장소 연결</h2><button type="button" class="x" data-act="close" aria-label="닫기">' + svgx('<path d="M6 6l12 12M18 6L6 18"/>') + '</button></div>' +
      '<p class="note" style="margin-bottom:12px">데이터는 <b>비공개(Private) 저장소</b>의 ' + FILE + ' 파일에 저장돼요. 토큰은 이 기기 브라우저에만 보관돼요.</p>' +
      '<form class="form" id="syncform" novalidate><div class="row2"><div class="fld"><label for="y-o">GitHub 사용자 이름</label><input class="in" id="y-o" name="o" value="' + esc(c ? c.o : '') + '" autocomplete="off" autocapitalize="none"></div>' +
      '<div class="fld"><label for="y-r">데이터 저장소 이름</label><input class="in" id="y-r" name="r" value="' + esc(c ? c.r : '') + '" autocomplete="off" autocapitalize="none" placeholder="spend-data"></div></div>' +
      '<div class="fld"><label for="y-t">접근 토큰 (fine-grained)</label><input class="in" id="y-t" name="t" type="password" value="' + esc(c ? c.t : '') + '" autocomplete="off"></div>' +
      '<div class="err" id="yerr" role="alert" hidden></div>' +
      '<div class="dact" style="margin-top:4px">' + (c ? '<button type="button" class="btn danger" data-act="unlink">연결 해제</button>' : '') + '<span class="sp"></span><button type="button" class="btn ghost" data-act="close">닫기</button><button type="submit" class="btn pri">연결하고 저장</button></div></form>' +
      (c ? '<div style="margin-top:20px"><button type="button" class="btn pale" data-act="qr">다른 기기 연결용 QR 보기</button><div id="qrbox"></div></div>' : '');
  }
  function connect(cfg, done) {
    var old = sync.cfg; sync.cfg = cfg;
    api('/contents/' + FILE).then(function (res) {
      if (res.status === 200 || res.status === 404) {
        if (res.status === 404) return api('').then(function (r2) { if (r2.status !== 200) throw new Error(httpMsg(r2.status)); return 'new'; });
        return 'exists';
      }
      throw new Error(httpMsg(res.status));
    }).then(function (kind) {
      lsSet(LS.cfg, JSON.stringify(cfg)); sync.sha = ''; lsDel(LS.sha);
      if (kind === 'new') { markDirty(); } else {
        // 저장소에 이미 데이터가 있으면 그것을 우선 (이 기기에 값이 있으면 충돌 창에서 선택)
        if (data.items.length || data.cards.length) { sync.dirty = true; lsSet(LS.dirty, '1'); }
        pull();
      }
      done(null);
    }).catch(function (e) { sync.cfg = old; done(e.message || '연결에 실패했어요'); });
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.dataset.act, id = el.dataset.id, key = el.dataset.key;
    if (el.tagName === 'ARTICLE' && e.target.closest('button')) return;
    switch (a) {
      case 'open': openDlg(dlgDetail(id)); break;
      case 'close': closeDlg(); break;
      case 'pay': payOne(id, key); break;
      case 'paygroup': payGroup(el.dataset.card, el.dataset.date); break;
      case 'ledger1': var it = itemById(id); if (it) { var o = C.occOf(it, C.addDays(today(), 45)).filter(function (x) { return x.key === key; })[0]; if (o) { C.setLedger(it, key, !o.ledger); commit(); rerenderDlg(); } } break;
      case 'ledger': openDlg(dlgLedger); break;
      case 'ledgerall':
        data.items.forEach(function (i) { C.occOf(i, C.addDays(today(), 45)).forEach(function (o) { if (o.paid && !o.ledger) C.setLedger(i, o.key, true); }); });
        commit(); rerenderDlg(); break;
      case 'add': openDlg(dlgForm(el.dataset.kind || 'planned', '')); afterForm(); break;
      case 'kind': openDlg(dlgForm(el.dataset.kind, '')); afterForm(); break;
      case 'edit': openDlg(dlgForm('', id)); afterForm(); break;
      case 'del':
        openDlg(dlgConfirm('삭제할까요?', '“' + (itemById(id) || {}).name + '” 항목과 결제 기록이 삭제돼요.', '삭제', function () {
          var snap = snapshot(); data.items = data.items.filter(function (i) { return i.id !== id; }); commit(); closeDlg();
          toast('삭제했어요', function () { restore(snap); });
        })); break;
      case 'confirm': var fn = ui.confirmFn; ui.confirmFn = null; if (fn) fn(); break;
      case 'seg': ui[el.dataset.seg] = el.dataset.v; render(); break;
      case 'mprev': ui.month = C.ymAdd(ui.month, -1); render(); break;
      case 'mnext': ui.month = C.ymAdd(ui.month, 1); render(); break;
      case 'settings': openDlg(dlgSettings); break;
      case 'addcard':
        data.cards.push({ id: C.uid(), name: '새 카드', account: '', billingDay: 10, tone: data.cards.length % TONES.length }); commit();
        rerenderDlg(); var ins = dbody.querySelectorAll('[data-cf="name"]'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } break;
      case 'delcard':
        var c = cardById(el.dataset.cid); if (!c) break;
        openDlg(dlgConfirm('카드를 삭제할까요?', '“' + c.name + '” 카드를 삭제해요. 이 카드로 등록한 항목은 “카드 없음”이 돼요.', '삭제', function () {
          var snap = snapshot(); data.cards = data.cards.filter(function (x) { return x.id !== c.id; }); data.items.forEach(function (i) { if (i.cardId === c.id) i.cardId = ''; });
          commit(); openDlg(dlgSettings); toast('카드를 삭제했어요', function () { restore(snap); });
        })); break;
      case 'backup':
        var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), url = URL.createObjectURL(blob), l = document.createElement('a');
        l.href = url; l.download = 'spend-backup-' + today() + '.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000); break;
      case 'sample':
        var run = function () { var snap = snapshot(); sampleData(); commit(); closeDlg(); toast('샘플 데이터를 넣었어요', function () { restore(snap); }); };
        if (data.items.length || data.cards.length) openDlg(dlgConfirm('샘플 데이터를 넣을까요?', '지금 등록된 카드와 항목이 샘플로 바뀌어요. (되돌리기 가능)', '넣기', run)); else run(); break;
      case 'sync': openDlg(dlgSync); break;
      case 'unlink': sync.cfg = null; lsDel(LS.cfg); lsDel(LS.sha); sync.sha = ''; setState('off'); closeDlg(); toast('연결을 해제했어요. 이 기기의 데이터는 그대로 남아 있어요.'); break;
      case 'qr': showQr(); break;
      case 'takeserver': takeServer(); break;
      case 'overwrite': overwriteMine(); break;
      case 'undo': if (ui.undo) { var u = ui.undo; ui.undo = null; $('#toast').hidden = true; u(); } break;
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.f) {
      var it = itemById(t.dataset.id); if (!it) return;
      var f = t.dataset.f, val = t.value, patch = {};
      if (f === 'amount') { var n = Number(val); if (val === '' || isNaN(n) || n < 0) { rerenderDlg(); return; } patch.amount = Math.round(n); }
      else if (f === 'planned') { if (!val) { rerenderDlg(); return; } patch.planned = val; }
      else patch.paid = val;
      C.editOcc(it, t.dataset.key, patch); commit();
      setTimeout(rerenderDlg, 0); return;
    }
    if (t.dataset && t.dataset.cf) {
      var c = cardById(t.dataset.cid); if (!c) return;
      var k = t.dataset.cf;
      if (k === 'billingDay') c.billingDay = clampInt(t.value, 1, 31, c.billingDay);
      else if (k === 'tone') c.tone = Number(t.value) || 0;
      else c[k] = t.value.trim();
      if (k === 'name' && !c.name) c.name = '카드';
      commit(); return;
    }
    if (t.dataset && t.dataset.sf) {
      var s = data.settings, k2 = t.dataset.sf;
      s[k2] = k2 === 'pastDays' ? clampInt(t.value, 0, 60, 10) : clampInt(t.value, 1, 90, 20);
      t.value = s[k2]; commit(); return;
    }
    if (t.closest && t.closest('#itemform')) {
      if (t.name === 'firstDate' || t.name === 'payDay') formTouched = true;
      updateForm();
    }
  });
  document.addEventListener('input', function (e) {
    var f = e.target.closest && e.target.closest('#itemform'); if (f) updateForm();
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'itemform') submitForm(f);
    else if (f.id === 'syncform') {
      var o = f.elements.o.value.trim(), r = f.elements.r.value.trim(), t = f.elements.t.value.trim(), err = $('#yerr');
      if (!o || !r || !t) { err.textContent = '세 칸을 모두 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true;
      connect({ o: o, r: r, t: t }, function (m) { if (m) { err.textContent = m; err.hidden = false; } else { closeDlg(); toast('저장소에 연결했어요'); } });
    }
  });
  function showQr() {
    var box = $('#qrbox'); if (!box || !sync.cfg || typeof qrcode !== 'function') return;
    var link = location.origin + location.pathname + '#connect=' + b64url(JSON.stringify(sync.cfg));
    var qr = qrcode(0, 'M'); qr.addData(link); qr.make();
    box.innerHTML = '<div class="qr" style="margin-top:12px">' + qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) +
      '<div class="warn">이 QR에는 <b>토큰이 들어 있어요.</b> 내 다른 기기에서만 스캔하고, 화면 캡처·공유는 하지 마세요.</div></div>';
  }
  window.addEventListener('online', function () { if (sync.cfg && sync.dirty) push(); else pull(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (sync.cfg && !sync.dirty) pull(); render(); } });

  /* ---------- 시작 ---------- */
  function handleHash() {
    var m = /^#connect=([A-Za-z0-9_-]+)/.exec(location.hash || ''); if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    var cfg; try { cfg = JSON.parse(unb64url(m[1])); } catch (e) { return; }
    if (!cfg || !cfg.o || !cfg.r || !cfg.t) return;
    openDlg(dlgConfirm('이 저장소에 연결할까요?', cfg.o + ' / ' + cfg.r + ' 저장소의 데이터를 이 기기에서 불러오고 저장해요. 내가 만든 QR·링크가 아니라면 취소하세요.', '연결', function () {
      connect(cfg, function (msg) { if (msg) toast(msg); else { closeDlg(); toast('저장소에 연결했어요'); } });
    }));
  }
  render();
  handleHash();
  startSync();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
  window.__app = { get data() { return data; }, ui: ui, sync: sync, render: render };
})();
