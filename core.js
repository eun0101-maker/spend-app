/* core.js — 날짜·금액 계산 로직 (화면 코드와 분리해서 테스트하기 쉽게 만든 파일) */
(function (root) {
  'use strict';

  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var utc = function (s) { var p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  var todayStr = function () { return ymd(new Date()); };
  var diffDays = function (a, b) { return Math.round((utc(b) - utc(a)) / 86400000); };
  var addDays = function (s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  var dim = function (y, m) { return new Date(y, m, 0).getDate(); }; // m: 1~12
  var addMonths = function (s, n) {
    var d = parse(s);
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    return ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), dim(t.getFullYear(), t.getMonth() + 1))));
  };
  var ymOf = function (s) { return s.slice(0, 7); };
  var ymAdd = function (ym, n) {
    var p = ym.split('-').map(Number);
    var t = new Date(p[0], p[1] - 1 + n, 1);
    return t.getFullYear() + '-' + pad(t.getMonth() + 1);
  };
  var dateInYm = function (ym, day) {
    var p = ym.split('-').map(Number);
    return ym + '-' + pad(Math.min(Math.max(1, day), dim(p[0], p[1])));
  };
  var lastDayOfYm = function (ym) { return dateInYm(ym, 31); };
  var weekday = function (s) { return WD[parse(s).getDay()]; };
  var md = function (s) { return Number(s.slice(5, 7)) + '/' + Number(s.slice(8, 10)); };
  var mdw = function (s) { return md(s) + ' (' + weekday(s) + ')'; };
  var won = function (n) { return Number(n).toLocaleString('ko-KR') + '원'; };
  var uid = function () { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); };

  // from 날짜 이후(포함) 가장 가까운 카드 결제일
  var nextBilling = function (day, from) {
    var ym = ymOf(from);
    var d = dateInYm(ym, day);
    if (d < from) d = dateInYm(ymAdd(ym, 1), day);
    return d;
  };
  // 구매한 달의 다음 달 결제일 (첫 결제 예정일 기본값)
  var firstPayDefault = function (day, buyDate) { return dateInYm(ymAdd(ymOf(buyDate), 1), day); };
  var monthsElapsed = function (start, today) {
    var a = parse(start), b = parse(today);
    var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return Math.max(0, m);
  };

  // 할부 회차 만들기: 나눠떨어지지 않는 나머지 금액은 1회차에 붙인다
  var makePayments = function (total, months, firstDate) {
    var n = Math.max(1, months | 0);
    var base = Math.floor(total / n);
    var rem = total - base * n;
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({ seq: i + 1, planned: addMonths(firstDate, i), paid: '', amount: base + (i === 0 ? rem : 0), ledger: false });
    }
    return out;
  };

  var createPlanned = function (f) {
    var n = f.payType === 'once' ? 1 : Math.max(2, f.months | 0);
    var pays = makePayments(f.total, n, f.firstDate);
    var k = Math.min(n, Math.max(0, f.paidCount | 0));
    for (var i = 0; i < k; i++) { pays[i].paid = pays[i].planned; pays[i].ledger = true; }
    return {
      id: uid(), kind: 'planned', name: f.name, icon: f.icon || 'card', cardId: f.cardId || '',
      payType: f.payType === 'once' ? 'once' : 'installment', interestFree: !!f.interestFree,
      category: f.category || '', memo: f.memo || '', buyDate: f.buyDate || '', payments: pays
    };
  };

  var createFixed = function (f, today) {
    var curYm = ymOf(today);
    var track = f.trackFrom || curYm;
    if (ymOf(f.startDate) > track) track = ymOf(f.startDate);
    var item = {
      id: uid(), kind: 'fixed', name: f.name, icon: f.icon || 'card', cardId: f.cardId || '',
      category: f.category || '', memo: f.memo || '', amount: f.amount, payDay: f.payDay,
      startDate: f.startDate, endDate: f.endDate || '', trackFrom: track, payments: []
    };
    if (f.paidThisMonth && curYm >= track) {
      var pl = dateInYm(curYm, f.payDay);
      item.payments.push({ ym: curYm, planned: pl, paid: pl, amount: f.amount, ledger: true });
    }
    return item;
  };

  // 고정 지출: 추적 시작 달부터 upto 날짜가 속한 달까지 월별 결제 건을 만든다 (저장된 기록이 있으면 그것을 우선)
  var fixedOcc = function (item, upto) {
    var out = [];
    var startYm = ymOf(item.startDate) > item.trackFrom ? ymOf(item.startDate) : item.trackFrom;
    var endYm = ymOf(upto);
    var byYm = {};
    (item.payments || []).forEach(function (p) { byYm[p.ym] = p; });
    for (var ym = startYm; ym <= endYm; ym = ymAdd(ym, 1)) {
      var rec = byYm[ym];
      var planned = rec ? rec.planned : dateInYm(ym, item.payDay);
      if (item.endDate && planned > item.endDate && !(rec && rec.paid)) break;
      out.push({ itemId: item.id, key: ym, planned: planned, paid: rec ? (rec.paid || '') : '', amount: rec ? rec.amount : item.amount, ledger: rec ? !!rec.ledger : false, virtual: !rec });
    }
    return out;
  };
  var plannedOcc = function (item) {
    return item.payments.map(function (p) {
      return { itemId: item.id, key: String(p.seq), planned: p.planned, paid: p.paid || '', amount: p.amount, ledger: !!p.ledger, virtual: false };
    });
  };
  var occOf = function (item, upto) { return item.kind === 'fixed' ? fixedOcc(item, upto) : plannedOcc(item); };
  var allOcc = function (data, upto) {
    var out = [];
    data.items.forEach(function (it) {
      occOf(it, upto).forEach(function (o) { o.item = it; o.cardId = it.cardId || ''; out.push(o); });
    });
    return out;
  };
  var eff = function (o) { return o.paid || o.planned; };

  var summarize = function (item, today) {
    var occ, next, n, paidN, paidAmt, total, need, lastPaid, status;
    if (item.kind === 'planned') {
      occ = plannedOcc(item);
      n = occ.length;
      var paid = occ.filter(function (o) { return o.paid; });
      paidN = paid.length;
      paidAmt = paid.reduce(function (s, o) { return s + o.amount; }, 0);
      total = occ.reduce(function (s, o) { return s + o.amount; }, 0);
      next = occ.filter(function (o) { return !o.paid; })[0] || null;
      status = paidN === 0 ? 'before' : (paidN < n ? 'going' : 'done');
      need = paid.filter(function (o) { return !o.ledger; }).length;
      lastPaid = paid.slice().sort(function (a, b) { return a.paid < b.paid ? 1 : -1; })[0] || null;
      return { n: n, paidN: paidN, paidAmt: paidAmt, total: total, remainAmt: total - paidAmt, remainN: n - paidN, next: next, status: status, need: need, lastPaid: lastPaid, thisMonthPaid: paid.some(function (o) { return ymOf(o.paid) === ymOf(today); }) };
    }
    occ = fixedOcc(item, addDays(today, 45));
    var paidF = occ.filter(function (o) { return o.paid; });
    next = occ.filter(function (o) { return !o.paid; })[0] || null;
    lastPaid = paidF.slice().sort(function (a, b) { return a.paid < b.paid ? 1 : -1; })[0] || null;
    var ended = !next;
    return {
      next: next, ended: ended, lastPaid: lastPaid,
      months: monthsElapsed(item.startDate, ended && item.endDate && item.endDate < today ? item.endDate : today),
      need: paidF.filter(function (o) { return !o.ledger; }).length,
      thisMonthPaid: paidF.some(function (o) { return ymOf(o.paid) === ymOf(today); })
    };
  };

  // 같은 카드·같은 날짜에 나가는 미결제 건을 한 묶음으로 합산
  var groupUpcoming = function (occs, cards) {
    var m = {};
    occs.filter(function (o) { return !o.paid; }).forEach(function (o) {
      var k = (o.cardId || '') + '|' + o.planned;
      if (!m[k]) m[k] = { cardId: o.cardId || '', date: o.planned, total: 0, occs: [] };
      m[k].total += o.amount;
      m[k].occs.push(o);
    });
    var order = function (id) { var i = cards.findIndex(function (c) { return c.id === id; }); return i < 0 ? 999 : i; };
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return order(a.cardId) - order(b.cardId);
    });
  };

  // 오늘 기준 지난 past일 ~ 다가오는 future일 타임라인
  var timeline = function (occs, today, past, future) {
    var start = addDays(today, -past), end = addDays(today, future), span = past + future;
    var m = {};
    occs.forEach(function (o) {
      var d = eff(o);
      if (d < start || d > end) return;
      if (!m[d]) m[d] = { date: d, total: 0, count: 0, paid: 0 };
      m[d].total += o.amount; m[d].count++; if (o.paid) m[d].paid++;
    });
    var marks = Object.keys(m).sort().map(function (k) {
      var x = m[k];
      var dd = diffDays(today, x.date);
      var state = x.paid === x.count ? 'done' : (dd < 0 ? 'late' : (dd <= 7 ? 'near' : 'far'));
      x.left = span ? diffDays(start, x.date) / span * 100 : 0;
      x.dd = dd; x.state = state;
      return x;
    });
    return { start: start, end: end, span: span, todayLeft: span ? past / span * 100 : 0, marks: marks };
  };

  var monthStats = function (occs, ym) {
    var r = { total: 0, paid: 0, unpaid: 0, unpaidN: 0, planned: 0, fixed: 0, byCard: {} };
    occs.forEach(function (o) {
      if (ymOf(eff(o)) !== ym) return;
      r.total += o.amount;
      if (o.paid) r.paid += o.amount; else { r.unpaid += o.amount; r.unpaidN++; }
      r[o.item.kind === 'fixed' ? 'fixed' : 'planned'] += o.amount;
      var k = o.cardId || '';
      r.byCard[k] = (r.byCard[k] || 0) + o.amount;
    });
    return r;
  };

  // ---- 데이터 바꾸기 (화면에서 호출) ----
  var ensureRec = function (item, ym) {
    var rec = item.payments.filter(function (p) { return p.ym === ym; })[0];
    if (!rec) {
      rec = { ym: ym, planned: dateInYm(ym, item.payDay), paid: '', amount: item.amount, ledger: false };
      item.payments.push(rec);
    }
    return rec;
  };
  var recOf = function (item, key) {
    if (item.kind === 'fixed') return ensureRec(item, key);
    return item.payments.filter(function (p) { return String(p.seq) === String(key); })[0] || null;
  };
  // 결제일 기록 (date가 빈 문자열이면 결제 취소 → 기입 상태도 초기화)
  var setPaid = function (item, key, date) {
    var r = recOf(item, key); if (!r) return;
    r.paid = date || '';
    if (!date) r.ledger = false;
  };
  var setLedger = function (item, key, on) { var r = recOf(item, key); if (r && r.paid) r.ledger = !!on; };
  var editOcc = function (item, key, patch) {
    var r = recOf(item, key); if (!r) return;
    if (patch.planned) r.planned = patch.planned;
    if (typeof patch.amount === 'number' && patch.amount >= 0) r.amount = patch.amount;
    if (Object.prototype.hasOwnProperty.call(patch, 'paid')) setPaid(item, key, patch.paid);
  };

  root.Core = {
    WD: WD, ymd: ymd, parse: parse, todayStr: todayStr, diffDays: diffDays, addDays: addDays, addMonths: addMonths,
    ymOf: ymOf, ymAdd: ymAdd, dateInYm: dateInYm, lastDayOfYm: lastDayOfYm, weekday: weekday, md: md, mdw: mdw, won: won, uid: uid,
    nextBilling: nextBilling, firstPayDefault: firstPayDefault, monthsElapsed: monthsElapsed,
    makePayments: makePayments, createPlanned: createPlanned, createFixed: createFixed,
    fixedOcc: fixedOcc, plannedOcc: plannedOcc, occOf: occOf, allOcc: allOcc, eff: eff,
    summarize: summarize, groupUpcoming: groupUpcoming, timeline: timeline, monthStats: monthStats,
    setPaid: setPaid, setLedger: setLedger, editOcc: editOcc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
