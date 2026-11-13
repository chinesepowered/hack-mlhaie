/* CapyWorks dashboard: renders the factory's event stream (SSE, or mock.js with ?mock=1). No dependencies. */
(() => {
  'use strict';

  const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000; // Jev bills input tokens only
  const FLOOR_SLOTS = ['intake', 'triage', 'build', 'tests', 'gate', 'onsen'];
  const STAGE_LABEL = {
    intake: 'Intake', triage: 'Triage', build: 'Build', tests: 'Tests', gate: 'Capy Gate',
    onsen: 'Onsen', bounced: 'Bounced', escalated: 'Escalated',
  };
  const PHASE_LABEL = { idle: 'Idle', live: 'Live shift', replay: 'Replaying recorded shift', done: 'Shift complete', offline: 'Factory offline' };
  const MAX_FEED_GROUPS = 80;

  const params = new URLSearchParams(location.search);
  const MOCK = params.has('mock');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ icons (inline, so the page works offline)

  const stroke = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    intake: stroke('<path d="M4 13.5L6.6 6h10.8L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><path d="M4 13.5h4.5l1.5 2.2h4l1.5-2.2H20"/>'),
    triage: stroke('<path d="M12 3v18"/><path d="M12 5.5h6.2l2 2.25-2 2.25H12"/><path d="M12 12H5.8l-2 2.25 2 2.25H12"/>'),
    tests: stroke('<path d="M9 3.5h6"/><path d="M10 3.5v5.8L5.2 17.6a2 2 0 0 0 1.7 2.9h10.2a2 2 0 0 0 1.7-2.9L14 9.3V3.5"/><path d="M7.4 14.5h9.2"/>'),
    gate: stroke('<path d="M12 3l7 2.8v5.6c0 4.4-3 7.7-7 9.1-4-1.4-7-4.7-7-9.1V5.8z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>'),
    onsen: stroke('<path d="M4.5 14.5c0 3 3.4 5.5 7.5 5.5s7.5-2.5 7.5-5.5"/><path d="M3.5 14.5h17"/><path d="M8 11c-1.2-1.4 1.2-2.6 0-4s1.2-2.6 0-4"/><path d="M12 11c-1.2-1.4 1.2-2.6 0-4s1.2-2.6 0-4"/><path d="M16 11c-1.2-1.4 1.2-2.6 0-4s1.2-2.6 0-4"/>'),
    // a little agent-bird riding on a capybara's back
    build: '<svg viewBox="0 0 48 32" aria-hidden="true"><rect x="3" y="14" width="31" height="13" rx="6.5" fill="currentColor"/><rect x="25" y="8.5" width="18" height="14" rx="6" fill="currentColor"/><ellipse cx="29" cy="9" rx="2.6" ry="2.1" fill="currentColor"/><circle cx="35.5" cy="13.5" r="1.5" fill="#FFF8EE"/><rect x="7" y="24" width="4.5" height="6.5" rx="2.2" fill="currentColor"/><rect x="26" y="24" width="4.5" height="6.5" rx="2.2" fill="currentColor"/><ellipse cx="15" cy="10.5" rx="5.2" ry="4.6" fill="#F7B32B"/><path d="M19.6 9.6l3.3 1.1-3.3 1.2z" fill="#E07B39"/><circle cx="16.8" cy="9.3" r="1.05" fill="#3A2A1D"/><path d="M11.5 11.5q2.6 1.8 5 .2" stroke="#FFF3D6" stroke-width="1.1" fill="none"/></svg>',
    bird: '<svg viewBox="0 0 18 14" aria-hidden="true"><ellipse cx="8" cy="8" rx="6.5" ry="5.5" fill="currentColor"/><path d="M13.6 6.4l3.6 1.3-3.6 1.3z" fill="#F7B32B"/><circle cx="10.4" cy="6.4" r="1.15" fill="#fff"/><path d="M3.8 8.6q3 2.4 6 0" stroke="#fff" stroke-width="1.2" fill="none" opacity=".75"/></svg>',
    mud: '<svg viewBox="0 0 18 14" aria-hidden="true"><path d="M2.6 9.2c-1.8-2.8.9-5.6 3.8-4.7.9-2.9 5.7-3 6.8-.2 2.9-.1 4 3.8 2 5.7.1 2-1.9 3-3.9 2-1 1.9-4 1.9-5 .1-2 .9-4.1-.2-3.7-2.9z" fill="currentColor"/><circle cx="7" cy="8" r="1" fill="#fff"/><circle cx="11" cy="8" r="1" fill="#fff"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 3L3 7l4 4M3.5 7H10a3 3 0 0 1 0 6H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    yuzu: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9.2" r="5.8" fill="#F7B32B"/><circle cx="6.2" cy="7.6" r="1.5" fill="#FFD77A" opacity=".85"/><path d="M8.4 3.6c1.9-2.6 5-2.5 6-1.3-2 2-4.4 2.4-6 1.3z" fill="#6FA866"/></svg>',
  };

  // Used until /assets/capy.svg exists (and whenever it can't be fetched, e.g. file://).
  const PLACEHOLDER_CAPY = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170" role="img" aria-label="Capy the capybara">
  <ellipse cx="120" cy="161" rx="94" ry="7" fill="#3A2A1D" opacity=".12"/>
  <rect x="46" y="124" width="21" height="34" rx="10" fill="#7C5636"/>
  <rect x="78" y="128" width="21" height="30" rx="10" fill="#8A6240"/>
  <rect x="146" y="128" width="21" height="30" rx="10" fill="#7C5636"/>
  <rect x="171" y="124" width="21" height="34" rx="10" fill="#8A6240"/>
  <rect x="24" y="62" width="172" height="84" rx="42" fill="#A0764E"/>
  <path d="M40 92c18-14 52-20 92-16" stroke="#B8895D" stroke-width="5" fill="none" stroke-linecap="round" opacity=".55"/>
  <rect x="138" y="36" width="90" height="76" rx="31" fill="#AA7F56"/>
  <rect x="190" y="60" width="46" height="48" rx="21" fill="#8F6745"/>
  <ellipse cx="157" cy="40" rx="11.5" ry="9.5" fill="#7A5534"/>
  <ellipse cx="157" cy="41.5" rx="6" ry="4.6" fill="#5C3D24"/>
  <g class="capyph-pupil">
    <ellipse cx="183" cy="66" rx="6.6" ry="6.8" fill="#2B1D12"/>
    <circle cx="185.4" cy="63.4" r="2" fill="#FFF8EE"/>
  </g>
  <rect class="capyph-lid" x="174.5" y="57" width="17" height="9.5" rx="3" fill="#AA7F56"/>
  <ellipse cx="226" cy="73" rx="4.2" ry="3.2" fill="#3A2718"/>
  <ellipse cx="197" cy="88" rx="8" ry="4.6" fill="#F2A497" opacity=".75"/>
  <path d="M213 96q6.5 4.5 13 0" stroke="#3A2718" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <g class="capyph-yuzu">
    <circle cx="176" cy="25" r="15" fill="#F7B32B"/>
    <circle cx="171" cy="20" r="4" fill="#FFD77A" opacity=".85"/>
    <path d="M178 11c6-8 16-8 20-4-6 6-14 7-20 4z" fill="#6FA866"/>
  </g>
</svg>`;

  // ------------------------------------------------------------------ tiny DOM helpers

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function svg(markup) {
    const tpl = document.createElement('template');
    tpl.innerHTML = markup.trim();
    return tpl.content.firstElementChild;
  }

  const restart = (node, cls) => { node.classList.remove(cls); void node.getBoundingClientRect(); node.classList.add(cls); };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

  function fmtUsd(x) {
    if (!x) return '$0';
    if (x >= 0.01) return `$${x.toFixed(2)}`;
    if (x < 0.000001) return '<$0.000001';
    const digits = Math.max(2, -Math.floor(Math.log10(x)) + 1);
    return `$${Number(x.toPrecision(2)).toFixed(digits)}`;
  }

  // ------------------------------------------------------------------ state + element cache

  const emptyStats = () => ({ decisions: 0, calls: 0, ms: 0, tokens: 0, merged: 0, bounced: 0, escalated: 0, slop: 0 });

  const state = {
    runId: null,
    phase: 'idle',
    hasKeys: false,
    serverRunning: false,
    tickets: new Map(),
    stats: emptyStats(),
    totals: null,
    lastT: 0,
    selected: null,
    follow: true,
    instant: false,
    capyHasYuzu: false,
  };

  const ui = {
    slots: Object.fromEntries($$('[data-slot]').map((n) => [n.dataset.slot, n])),
    stations: Object.fromEntries($$('.station').map((n) => [n.dataset.stage, n])),
    feed: $('#feed'),
    detail: $('#detail'),
    ticker: $('#ticker'),
    bubble: $('#capy-bubble'),
    gateStage: $('#gate-stage'),
    gateCapy: $('#gate-capy'),
    yuzuDrop: $('#yuzu-drop'),
    status: $('#status'),
    statusText: $('#status-text'),
    statusClock: $('#status-clock'),
    models: $('#models'),
    btnLive: $('#btn-live'),
    btnReplay: $('#btn-replay'),
    sloppy: $('#sloppy-toggle'),
    stat: {
      decisions: $('#stat-decisions'),
      latency: $('#stat-latency'),
      cost: $('#stat-cost'),
      merged: $('#stat-merged'),
      bounced: $('#stat-bounced'),
      slop: $('#stat-slop'),
    },
  };

  // ------------------------------------------------------------------ event handling

  const handlers = {
    'run.start': onRunStart,
    'ticket.stage': onStage,
    'jev.call': onJevCall,
    'agent.output': onAgentOutput,
    'tests.result': onTestsResult,
    'ticket.outcome': onOutcome,
    'run.end': onRunEnd,
    log: onLog,
  };

  let lastEventDone = -Infinity;
  function handle(evt) {
    if (!evt || typeof evt.type !== 'string') return;
    // Events that arrive back-to-back (SSE backlog on connect, mock "at=" jumps) skip the travel animation.
    state.instant = performance.now() - lastEventDone < 10;
    try {
      dispatch(evt);
    } finally {
      lastEventDone = performance.now();
    }
  }

  function dispatch(evt) {
    if (typeof evt.t === 'number') {
      state.lastT = evt.t;
      ui.statusClock.textContent = `T+${(evt.t / 1000).toFixed(1)}s`;
    }
    const fn = handlers[evt.type];
    if (!fn) return;
    try {
      fn(evt);
    } catch (err) {
      console.error('CapyWorks: failed to render', evt, err);
    }
  }

  function onRunStart(e) {
    resetRun();
    state.runId = e.runId || null;
    setPhase(e.mode === 'replay' ? 'replay' : 'live');
    renderModels(e.models);
    for (const tk of e.tickets || []) ensureTicket(tk.id, tk);
    say(e.mode === 'replay' ? 'Replaying a recorded shift.' : 'New shift. Keep it clean, friends.');
    renderStats();
  }

  function onStage(e) {
    const t = ensureTicket(e.ticketId);
    t.queued = false;
    if (e.attempt) t.attempt = e.attempt;
    t.stage = e.stage;
    if (e.stage === 'build') { t.tests = null; t.gate = null; t.agent = null; } // a fresh attempt starts clean
    renderCard(t);
    const slot = e.stage === 'bounced' || e.stage === 'escalated' ? 'upstream' : e.stage;
    if (slot === 'upstream' || FLOOR_SLOTS.includes(slot)) moveCard(t, slot);
    markBusy();
    follow(t.id, false);
  }

  function onJevCall(e) {
    const decisions = Array.isArray(e.decisions) ? e.decisions : [];
    const s = state.stats;
    s.calls += 1;
    s.ms += num(e.latencyMs);
    s.tokens += num(e.inputTokens);
    s.decisions += decisions.length;

    const failed = decisions.filter((d) => d.passed === false).length;
    const gated = decisions.filter((d) => d.passed === true || d.passed === false).length;
    const t = e.ticketId ? ensureTicket(e.ticketId) : null;

    if (t && e.stage === 'gate') {
      t.gate = { failed, total: gated };
      if (failed) {
        s.slop += 1;
        capyReact('reject');
        say(`Nope. ${plural(failed, 'slop signal')} on ${t.id}.`, 'fail');
        restart(t.el, 'flash-fail');
      } else {
        say(`${t.id} looks clean. Yuzu incoming.`, 'pass');
        restart(t.el, 'flash-pass');
      }
    } else if (t && e.stage === 'intake' && failed) {
      say(`${t.id} is too vague. Back upstream.`, 'fail');
    }

    if (t) renderCard(t);
    addFeedGroup(e, decisions, failed, gated);
    renderStats();
    if (t) { refreshDetail(t); follow(t.id, e.stage === 'gate'); }
  }

  function onAgentOutput(e) {
    const t = ensureTicket(e.ticketId);
    t.agent = e.agent || t.agent;
    t.agentOut = e;
    if (e.attempt) t.attempt = e.attempt;
    renderCard(t);
    refreshDetail(t);
    follow(t.id, true);
  }

  function onTestsResult(e) {
    const t = ensureTicket(e.ticketId);
    t.tests = e;
    renderCard(t);
    restart(t.el, e.passed ? 'flash-pass' : 'flash-fail');
    if (!e.passed) say(`Tests failed on ${t.id}. That's a hard no.`, 'fail');
    refreshDetail(t);
    follow(t.id, true);
  }

  function onOutcome(e) {
    const t = ensureTicket(e.ticketId);
    t.outcome = e.outcome;
    t.reason = e.reason || '';
    t.queued = false;
    if (e.attempts) t.attempt = e.attempts;
    renderCard(t);
    const s = state.stats;
    if (e.outcome === 'merged') {
      s.merged += 1;
      moveCard(t, 'onsen');
      capyReact('merge');
      say(`${t.id} merged. Yuzu earned.`, 'yuzu');
    } else if (e.outcome === 'escalated') {
      s.escalated += 1;
      moveCard(t, 'upstream');
      say(`${t.id} needs a human.`, 'fail');
    } else {
      s.bounced += 1;
      moveCard(t, 'upstream');
    }
    renderCard(t);
    renderStats();
    markBusy();
    refreshDetail(t);
    follow(t.id, true);
  }

  function onRunEnd(e) {
    state.totals = e.totals || null;
    setPhase('done');
    renderStats();
    markBusy();
    const merged = state.totals?.merged ?? state.stats.merged;
    say(`Shift done. ${merged} soaking in the onsen.`, 'yuzu');
    refreshServerState();
  }

  function onLog(e) {
    if (!e.message) return;
    ui.ticker.textContent = e.message;
    ui.ticker.dataset.level = e.level || 'info';
  }

  // ------------------------------------------------------------------ tickets

  function ensureTicket(id, info = {}) {
    let t = state.tickets.get(id);
    if (!t) {
      t = {
        id, title: info.title || id, body: info.body || '',
        stage: null, attempt: 1, agent: null, outcome: null, reason: '',
        agentOut: null, tests: null, gate: null, queued: true, ghost: null, el: null,
      };
      t.el = h('article', {
        class: 'ticket is-queued',
        'data-id': id,
        tabindex: 0,
        onclick: () => select(id, true),
        onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(id, true); } },
      });
      state.tickets.set(id, t);
      ui.slots.intake.append(t.el);
      renderCard(t);
    } else {
      if (info.title) t.title = info.title;
      if (info.body) t.body = info.body;
    }
    return t;
  }

  const tag = (kind, text, icon) => h('span', { class: `tag tag--${kind}` }, icon ? svg(icon) : null, text);
  const agentChip = (agent, extra = '') =>
    h('span', { class: `agent agent--${agent === 'sloppy' ? 'sloppy' : 'qwen'} ${extra}`.trim() }, svg(agent === 'sloppy' ? ICONS.mud : ICONS.bird), agent);

  function renderCard(t) {
    const top = h('div', { class: 'ticket__top' },
      h('span', { class: 'ticket__id', text: t.id }),
      t.attempt > 1 ? h('span', { class: 'ticket__attempt', text: `try ${t.attempt}` }) : null,
      t.outcome === 'merged' ? h('span', { class: 'ticket__yuzu', title: 'Capy-approved' }, svg(ICONS.yuzu)) : null,
      t.outcome === 'bounced' ? tag('fail', 'bounced', ICONS.back) : null,
      t.outcome === 'escalated' ? tag('info', 'needs a human') : null,
      t.agent ? agentChip(t.agent, 'ticket__agent') : null);

    const meta = h('div', { class: 'ticket__meta' });
    const working = workingLabel(t);
    if (working) meta.append(h('span', { class: 'tag tag--info tag--working', text: working }));
    if (t.tests) meta.append(t.tests.passed ? tag('pass', 'tests pass', ICONS.check) : tag('fail', 'tests fail', ICONS.x));
    if (t.gate && t.gate.total) {
      meta.append(t.gate.failed
        ? tag('fail', plural(t.gate.failed, 'slop signal'), ICONS.x)
        : tag('pass', `${t.gate.total}/${t.gate.total} checks`, ICONS.check));
    }
    if (t.outcome === 'merged') meta.append(tag('yuzu', 'Capy-approved', ICONS.yuzu));

    const parts = [top, h('p', { class: 'ticket__title', text: t.title })];
    if (meta.childElementCount) parts.push(meta);
    if (t.outcome && t.outcome !== 'merged' && t.reason) parts.push(h('p', { class: 'ticket__reason', text: t.reason }));
    t.el.replaceChildren(...parts);
    t.el.title = t.body ? `${t.title}\n\n${t.body}` : t.title;

    const cl = t.el.classList;
    cl.toggle('is-queued', t.queued);
    cl.toggle('is-active', !t.outcome && !t.queued);
    cl.toggle('is-merged', t.outcome === 'merged');
    cl.toggle('is-bounced', t.outcome === 'bounced');
    cl.toggle('is-escalated', t.outcome === 'escalated');
    cl.toggle('is-selected', state.selected === t.id);
  }

  // What a ticket is waiting on right now, shown as a gently pulsing tag.
  function workingLabel(t) {
    if (t.outcome || t.queued) return null;
    if (t.stage === 'build' && !(t.agentOut && (t.agentOut.attempt || 1) === t.attempt)) return 'agent writing…';
    if (t.stage === 'tests' && !t.tests) return 'running tests…';
    if (t.stage === 'gate' && !t.gate) return 'Capy is judging…';
    return null;
  }

  // Move a card to another slot. A fixed-position ghost travels across the floor so you can follow it.
  function moveCard(t, slotName) {
    const slot = ui.slots[slotName];
    if (!slot || t.el.parentElement === slot) return;
    const first = t.el.getBoundingClientRect();

    if (slotName === 'upstream') {
      $('.empty', slot)?.remove();
      slot.prepend(t.el);
      slot.scrollLeft = 0;
    } else {
      slot.append(t.el);
      slot.scrollTop = slot.scrollHeight;
    }

    if (t.ghost) { t.ghost.remove(); t.ghost = null; t.el.style.visibility = ''; }
    if (state.instant || reducedMotion || document.hidden || !first.width) return;

    const last = t.el.getBoundingClientRect();
    if (Math.abs(first.left - last.left) < 2 && Math.abs(first.top - last.top) < 2) return;

    const ghost = t.el.cloneNode(true);
    ghost.classList.add('ghost');
    ghost.removeAttribute('tabindex');
    Object.assign(ghost.style, { left: `${first.left}px`, top: `${first.top}px`, width: `${first.width}px` });
    document.body.append(ghost);
    t.ghost = ghost;
    t.el.style.visibility = 'hidden';
    const anim = ghost.animate(
      [
        { left: `${first.left}px`, top: `${first.top}px`, width: `${first.width}px` },
        { left: `${last.left}px`, top: `${last.top}px`, width: `${last.width}px` },
      ],
      { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      if (t.ghost === ghost) { t.ghost = null; t.el.style.visibility = ''; }
      ghost.remove();
    };
  }

  function markBusy() {
    const busy = new Set();
    for (const t of state.tickets.values()) if (t.stage && !t.outcome && !t.queued) busy.add(t.stage);
    for (const [stage, node] of Object.entries(ui.stations)) node.classList.toggle('is-busy', busy.has(stage));
  }

  // ------------------------------------------------------------------ Capy

  let capyTimer = 0;
  function capyReact(kind) {
    const capy = $('svg', ui.gateCapy);
    const cls = kind === 'merge' ? 'capy--merge' : 'capy--reject';
    if (capy) {
      capy.classList.remove('capy--merge', 'capy--reject');
      restart(capy, cls);
    }
    ui.gateStage.classList.remove('is-merge', 'is-reject');
    restart(ui.gateStage, kind === 'merge' ? 'is-merge' : 'is-reject');
    if (kind === 'merge' && !state.capyHasYuzu) restart(ui.yuzuDrop, 'is-dropping');
    clearTimeout(capyTimer);
    capyTimer = setTimeout(() => {
      capy?.classList.remove(cls);
      ui.gateStage.classList.remove('is-merge', 'is-reject');
    }, kind === 'merge' ? 2800 : 2000);
  }

  function say(text, tone) {
    ui.bubble.textContent = text;
    if (tone) ui.bubble.dataset.tone = tone; else delete ui.bubble.dataset.tone;
    restart(ui.bubble, 'pop');
  }

  async function loadGateCapy(attempt = 0) {
    let markup = null;
    try {
      const res = await fetch('/assets/capy.svg', { cache: 'no-cache' });
      if (res.ok) {
        const text = await res.text();
        if (/<svg[\s>]/i.test(text)) markup = text;
      }
    } catch { /* file:// or offline: use the placeholder */ }

    ui.gateCapy.innerHTML = markup || PLACEHOLDER_CAPY;
    const capy = $('svg', ui.gateCapy);
    if (capy) {
      capy.classList.add('capy');
      capy.removeAttribute('width');
      capy.removeAttribute('height');
      capy.setAttribute('preserveAspectRatio', 'xMidYMax meet');
      capy.setAttribute('aria-hidden', 'true');
    }
    state.capyHasYuzu = Boolean(capy?.querySelector('[id*="yuzu" i], [class*="yuzu" i]'));
    // The mascot may land while the page is open: retry a few times before settling for the placeholder.
    if (!markup && attempt < 4) setTimeout(() => loadGateCapy(attempt + 1), [4000, 10000, 20000, 40000][attempt]);
  }

  function initBrandCapy() {
    const img = $('#brand-capy-img');
    if (!img) return;
    const fallback = () => {
      const node = svg(PLACEHOLDER_CAPY);
      node.classList.add('capy--static-yuzu');
      img.replaceWith(node);
    };
    if (img.complete && img.naturalWidth === 0) fallback();
    else img.addEventListener('error', fallback, { once: true });
  }

  // ------------------------------------------------------------------ decision feed

  function addFeedGroup(e, decisions, failed, gated) {
    $('.empty', ui.feed)?.remove();
    const verdict = gated === 0 ? tag('info', 'info') : failed ? tag('fail', `${failed} fail`, ICONS.x) : tag('pass', 'pass', ICONS.check);
    const head = h('div', { class: 'call__head' },
      e.ticketId ? h('span', { class: 'ticket__id', text: e.ticketId }) : null,
      h('span', { class: 'call__stage', text: STAGE_LABEL[e.stage] || e.stage || 'Decision' }),
      e.attempt > 1 ? h('span', { class: 'ticket__attempt', text: `try ${e.attempt}` }) : null,
      h('span', { class: 'call__metrics', text: `${fmtInt(num(e.latencyMs))} ms · ${fmtInt(num(e.inputTokens))} tok`, title: e.model ? `model ${e.model}` : null }),
      verdict);
    const group = h('div', { class: `call is-new${gated ? (failed ? ' call--fail' : ' call--pass') : ''}` },
      head, h('ul', { class: 'decs' }, decisions.map(decisionRow)));
    ui.feed.prepend(group);
    requestAnimationFrame(() => { for (const f of $$('.dec__fill', group)) f.style.width = f.dataset.w; });
    while (ui.feed.children.length > MAX_FEED_GROUPS) ui.feed.lastElementChild.remove();
    ui.feed.scrollTop = 0;
  }

  function decisionRow(d) {
    const label = d.label || d.id || 'decision';
    const tone = d.passed === true ? 'pass' : d.passed === false ? 'fail' : 'info';
    const chip = h('span', { class: 'dec__chip', text: tone });
    const v = typeof d.value === 'number' && Number.isFinite(d.value) ? d.value : null;
    const asBar = d.type !== 'choice' && v != null && v >= 0 && v <= 1;

    if (!asBar) {
      const text = d.display ?? (v != null ? v.toFixed(2) : String(d.value ?? ''));
      return h('li', { class: `dec dec--text dec--${tone}`, title: `${label}: ${text}` },
        h('span', { class: 'dec__label', text: label }),
        h('span', { class: 'dec__val', text }),
        chip);
    }

    const bar = h('span', { class: 'dec__bar' },
      h('span', { class: 'dec__fill', 'data-w': `${(v * 100).toFixed(1)}%` }),
      typeof d.threshold === 'number'
        ? h('span', { class: 'dec__tick', style: { left: `${clamp01(d.threshold) * 100}%` }, title: `threshold ${d.threshold}` })
        : null);
    const tip = [label, d.display, typeof d.threshold === 'number' ? `threshold ${d.threshold}` : null].filter(Boolean).join(' · ');
    return h('li', { class: `dec dec--${tone}`, title: tip },
      h('span', { class: 'dec__label', text: label }),
      bar,
      h('span', { class: 'dec__val', text: v.toFixed(2) }),
      chip);
  }

  // ------------------------------------------------------------------ detail panel

  function follow(id, strong) {
    if (state.follow && (strong || !state.selected)) select(id, false);
  }

  function select(id, byUser) {
    if (byUser) state.follow = false;
    if (state.selected !== id) {
      state.tickets.get(state.selected)?.el.classList.remove('is-selected');
      state.selected = id;
      state.tickets.get(id)?.el.classList.add('is-selected');
    }
    renderDetail();
  }

  function refreshDetail(t) {
    if (state.selected === t.id) renderDetail();
  }

  function renderDetail() {
    const t = state.tickets.get(state.selected);
    if (!t) {
      ui.detail.replaceChildren(h('p', { class: 'empty', text: "Pick a ticket on the floor to see its diff, tests and Capy's verdict." }));
      return;
    }

    const status = t.outcome === 'merged' ? tag('yuzu', 'merged · Capy-approved', ICONS.yuzu)
      : t.outcome === 'bounced' ? tag('fail', 'bounced', ICONS.back)
      : t.outcome === 'escalated' ? tag('info', 'escalated to a human')
      : tag('info', t.stage ? STAGE_LABEL[t.stage] : 'queued');
    const followCtl = state.follow
      ? h('span', { class: 'chip follow', text: 'following live' })
      : h('button', { class: 'btn follow', type: 'button', text: 'Follow live', onclick: () => { state.follow = true; renderDetail(); } });
    const head = h('header', { class: 'detail__head' },
      h('span', { class: 'ticket__id', text: t.id }),
      h('h3', { text: t.title }),
      t.attempt > 1 ? h('span', { class: 'ticket__attempt', text: `try ${t.attempt}` }) : null,
      status,
      followCtl);

    const a = t.agentOut;
    const diffMeta = a
      ? [`try ${a.attempt || t.attempt}`, a.agent, a.files?.length ? plural(a.files.length, 'file') : null, a.latencyMs ? `${(a.latencyMs / 1000).toFixed(1)}s` : null].filter(Boolean).join(' · ')
      : null;
    const diffCol = h('div', { class: 'detail__col' },
      h('div', { class: 'detail__label' }, 'Latest diff', diffMeta ? h('small', { text: diffMeta }) : null),
      a?.diff
        ? renderDiff(a.diff)
        : h('div', { class: 'box' }, h('p', { class: 'empty', text: t.outcome === 'bounced' ? 'Bounced before any code was written.' : 'No code yet.' })));

    const tests = t.tests;
    const verdictText = t.reason
      || (t.gate ? (t.gate.failed ? `${t.gate.failed} of ${t.gate.total} checks failed.` : `All ${t.gate.total} checks passed.`) : 'Waiting for the gate.');
    const side = h('div', { class: 'detail__col detail__col--side' },
      h('div', { class: 'detail__label', text: 'Agent says' }),
      h('div', { class: 'box' }, a?.summary ? h('p', { text: a.summary }) : h('p', { class: 'empty', text: 'Nothing yet.' })),
      h('div', { class: 'detail__label', text: 'Tests' }),
      tests
        ? h('div', { class: `box ${tests.passed ? 'box--pass' : 'box--fail'}` },
          h('p', { text: `${tests.passed ? 'Passed' : 'Failed'}${tests.summary ? ` · ${tests.summary}` : ''}` }),
          tests.output ? h('pre', { class: 'tests-out', text: tests.output }) : null)
        : h('div', { class: 'box' }, h('p', { class: 'empty', text: 'Not run yet.' })),
      h('div', { class: 'detail__label', text: "Capy's verdict" }),
      h('div', { class: `box${t.outcome === 'merged' ? ' box--yuzu' : t.outcome ? ' box--fail' : ''}` }, h('p', { text: verdictText })));

    const parts = [head];
    if (t.body) parts.push(h('p', { class: 'detail__body', text: t.body, title: t.body }));
    parts.push(h('div', { class: 'detail__grid' }, diffCol, side));
    ui.detail.replaceChildren(...parts);
  }

  function renderDiff(diff) {
    const pre = h('pre', { class: 'diff' });
    for (const line of String(diff).replace(/\r/g, '').split('\n')) {
      let cls = null;
      if (/^(\+\+\+|---|diff |index )/.test(line)) cls = 'd-meta';
      else if (line.startsWith('@@')) cls = 'd-hunk';
      else if (line.startsWith('+')) cls = 'd-add';
      else if (line.startsWith('-')) cls = 'd-del';
      pre.append(h('span', { class: cls, text: line || ' ' }));
    }
    return pre;
  }

  // ------------------------------------------------------------------ header: stats, status, models

  function renderStats() {
    const s = state.stats;
    const T = state.totals;
    const decisions = T?.decisions ?? s.decisions;
    const avg = T?.jevMsAvg ?? (s.calls ? s.ms / s.calls : null);
    const cost = T?.jevCostUsd ?? s.tokens * JEV_USD_PER_INPUT_TOKEN;
    const merged = T?.merged ?? s.merged;
    const bounced = T ? num(T.bounced) + num(T.escalated) : s.bounced + s.escalated;
    const slop = T?.slopCaught ?? s.slop;
    setStat(ui.stat.decisions, fmtInt(decisions));
    setStat(ui.stat.latency, avg == null ? '–' : fmtInt(avg));
    setStat(ui.stat.cost, fmtUsd(cost));
    setStat(ui.stat.merged, fmtInt(merged));
    setStat(ui.stat.bounced, fmtInt(bounced));
    setStat(ui.stat.slop, fmtInt(slop));
    const tokens = T?.jevInputTokens ?? s.tokens;
    ui.stat.cost.title = `${fmtInt(tokens)} Jev input tokens × $0.042 per 1M (Jev bills input only)`;
  }

  function setStat(node, text) {
    if (node.textContent === text) return;
    node.textContent = text;
    if (!state.instant) restart(node.closest('dd'), 'bump');
  }

  function renderModels(models) {
    ui.models.replaceChildren();
    if (!models) return;
    const short = (m) => String(m).split('/').pop();
    if (models.system1) ui.models.append(h('span', { class: 'chip', title: models.system1 }, 'System 1 ', h('b', { text: short(models.system1) })));
    if (models.system2) ui.models.append(h('span', { class: 'chip', title: models.system2 }, 'System 2 ', h('b', { text: short(models.system2) })));
  }

  function setPhase(phase) {
    state.phase = phase;
    ui.status.dataset.state = phase;
    ui.statusText.textContent = PHASE_LABEL[phase] || phase;
    document.body.classList.toggle('is-running', phase === 'live' || phase === 'replay');
    updateControls();
  }

  function resetRun() {
    for (const t of state.tickets.values()) { t.ghost?.remove(); t.el.remove(); }
    state.tickets.clear();
    state.stats = emptyStats();
    state.totals = null;
    state.selected = null;
    state.follow = true;
    state.lastT = 0;
    ui.statusClock.textContent = '';
    ui.slots.upstream.replaceChildren(h('p', { class: 'empty', text: 'Nothing bounced yet.' }));
    ui.feed.replaceChildren(h('p', { class: 'empty', text: 'Waiting for Capy’s first call…' }));
    ui.ticker.textContent = '';
    renderDetail();
    markBusy();
  }

  // ------------------------------------------------------------------ controls + transport

  function updateControls() {
    const running = state.phase === 'live' || state.phase === 'replay' || state.serverRunning;
    ui.btnLive.disabled = running || !state.hasKeys;
    ui.btnReplay.disabled = running;
    ui.btnLive.title = state.hasKeys
      ? 'Run a real shift: the agent writes the code, Jev makes every call'
      : 'No API keys on this machine. Replay the recorded shift instead.';
  }

  async function refreshServerState() {
    if (MOCK) { state.hasKeys = true; state.serverRunning = false; updateControls(); return; }
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) {
        const s = await res.json();
        state.hasKeys = Boolean(s.hasKeys);
        state.serverRunning = Boolean(s.running);
      }
    } catch { /* keep the last known state */ }
    updateControls();
  }

  async function start(kind) {
    if (MOCK) {
      const mock = window.CapyMock;
      if (kind === 'live') mock?.start({ sloppy: ui.sloppy.checked }); else mock?.replay();
      return;
    }
    ui.btnLive.disabled = true;
    ui.btnReplay.disabled = true;
    try {
      const res = await fetch(kind === 'live' ? '/api/run' : '/api/replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(kind === 'live' ? { sloppy: ui.sloppy.checked } : { runId: 'demo' }),
      });
      if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`);
    } catch (err) {
      onLog({ level: 'error', message: `Could not start the shift: ${err.message}` });
    } finally {
      await refreshServerState();
    }
  }

  function connect() {
    const es = new EventSource('/api/events');
    es.onopen = () => { if (state.phase === 'offline') setPhase(state.runId ? 'done' : 'idle'); };
    es.onmessage = (msg) => {
      let evt;
      try { evt = JSON.parse(msg.data); } catch { return; }
      handle(evt);
    };
    es.onerror = () => setPhase('offline');
  }

  // ------------------------------------------------------------------ boot

  for (const node of $$('[data-icon]')) node.append(svg(ICONS[node.dataset.icon]));
  $('.upstream__arrow')?.append(svg(ICONS.back));
  ui.yuzuDrop.append(svg(ICONS.yuzu));
  ui.btnLive.addEventListener('click', () => start('live'));
  ui.btnReplay.addEventListener('click', () => start('replay'));

  window.CapyDash = { handle, state };

  initBrandCapy();
  loadGateCapy();
  setPhase('idle');
  renderStats();

  if (MOCK) {
    const script = document.createElement('script');
    script.src = 'mock.js';
    script.onload = () => window.CapyMock?.autostart();
    document.body.append(script);
  } else {
    connect();
  }
  refreshServerState();
})();
