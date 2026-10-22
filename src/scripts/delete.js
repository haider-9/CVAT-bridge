(async () => {
  const ID = 'cvat-delete-panel';
  const existing = document.getElementById(ID);
  if (existing) { existing.remove(); return; }

  const findStore = () => {
    const root = document.getElementById('root');
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer$'));
    const stack = [root[key]];
    while (stack.length) {
      const f = stack.pop();
      if (!f) continue;
      if (f.memoizedProps?.store?.getState) return f.memoizedProps.store;
      stack.push(f.sibling, f.child);
    }
    return null;
  };
  const store = window.__cvatStore || findStore();
  if (!store) throw new Error('Redux store not found');
  window.__cvatStore = store;

  // Everything below reads and writes CVAT's Redux state only.
  // No job API call happens until you press CVAT's own Save button.
  const anno = () => store.getState().annotation;
  const frame = anno().player.frame.number;
  const job = anno().job && anno().job.instance;
  if (!job) { console.error('Job instance not found. Open a job in CVAT first.'); return; }

  const jobLabels = Array.isArray(job.labels) ? job.labels : [];
  const labelName = id => {
    const found = jobLabels.find(l => l.id === id);
    return found ? found.name : `label ${id}`;
  };

  // The Redux list only holds the objects CVAT's own label filters and
  // visibility toggles allow, so it can look empty while the frame is full of
  // annotations. The annotation collection is the source of truth.
  const collectionStates = async f => {
    try {
      const states = await job.annotations.get(f, true, []);
      return Array.isArray(states) ? states : [];
    } catch (e) {
      console.warn('DELETE could not read the annotation collection.', e);
      return [];
    }
  };

  const reduxStates = () => anno().annotations.states || [];

  const frameEntries = async () => {
    const states = await collectionStates(frame);
    const use = states.length ? states : reduxStates();
    return use.map(s => ({
      clientID: s.clientID,
      frame: typeof s.frame === 'number' ? s.frame : frame,
      name: s.label && s.label.name ? s.label.name : '(no label)',
      kind: s.objectType,
      lock: !!s.lock,
      hidden: !!s.hidden,
      groundTruth: !!s.isGroundTruth,
      state: s,
    }));
  };

  const jobEntries = async () => {
    let dump = null;
    try {
      dump = await job.annotations.export();
    } catch (e) {
      console.error('DELETE could not read the whole job:', e);
      return null;
    }
    const out = [];
    const push = (o, kind) => {
      if (!o || typeof o.clientID !== 'number') return;
      out.push({
        clientID: o.clientID,
        frame: typeof o.frame === 'number' ? o.frame : 0,
        name: labelName(o.label_id),
        kind,
        lock: false,
        hidden: false,
        groundTruth: false,
        state: null,
      });
    };
    for (const t of (dump && Array.isArray(dump.tracks) ? dump.tracks : [])) push(t, 'track');
    for (const s of (dump && Array.isArray(dump.shapes) ? dump.shapes : [])) push(s, 'shape');
    for (const t of (dump && Array.isArray(dump.tags) ? dump.tags : [])) push(t, 'tag');
    return out;
  };

  let scope = 'frame';
  let entries = [];
  const selected = new Set();
  const expanded = new Set();

  const groupByName = list => {
    const groups = new Map();
    for (const e of list) {
      const arr = groups.get(e.name);
      if (arr) arr.push(e); else groups.set(e.name, [e]);
    }
    return groups;
  };

  const mkBtn = (text, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText = 'padding:3px 8px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;cursor:pointer;font:inherit;font-size:12px;';
    b.addEventListener('click', fn);
    return b;
  };

  const panel = document.createElement('div');
  panel.id = ID;
  panel.style.cssText =
    'position:fixed;top:72px;right:16px;z-index:2147483647;width:288px;padding:12px 14px;' +
    'background:#ffffff;color:#000000;border:1px solid #24221e;border-radius:8px;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.3);font:13px/1.45 Arial,Helvetica,sans-serif;text-align:left;';
  document.body.appendChild(panel);

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:14px;';
  title.textContent = `Delete objects · frame ${frame}`;
  head.appendChild(title);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Close';
  close.style.cssText = 'border:1px solid #cfc8bb;background:#fff;color:#000;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:15px;line-height:1;';
  close.addEventListener('click', () => panel.remove());
  head.appendChild(close);
  panel.appendChild(head);

  const scopeRow = document.createElement('div');
  scopeRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const scopeLabel = document.createElement('label');
  scopeLabel.textContent = 'Scope:';
  scopeLabel.style.cssText = 'font-weight:700;';
  scopeRow.appendChild(scopeLabel);
  const scopeSelect = document.createElement('select');
  scopeSelect.style.cssText = 'flex:1;box-sizing:border-box;padding:4px 6px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;font:inherit;font-size:12px;';
  const scopeFrameOpt = document.createElement('option');
  scopeFrameOpt.value = 'frame';
  scopeFrameOpt.textContent = `This frame (${frame})`;
  const scopeJobOpt = document.createElement('option');
  scopeJobOpt.value = 'job';
  scopeJobOpt.textContent = 'Whole job';
  scopeSelect.append(scopeFrameOpt, scopeJobOpt);
  scopeRow.appendChild(scopeSelect);
  panel.appendChild(scopeRow);

  const searchRow = document.createElement('div');
  searchRow.style.cssText = 'margin-bottom:6px;';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search labels…';
  search.style.cssText = 'width:100%;box-sizing:border-box;padding:4px 8px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;font:inherit;font-size:12px;';
  search.addEventListener('input', () => renderList());
  searchRow.appendChild(search);
  panel.appendChild(searchRow);

  const allRow = document.createElement('div');
  allRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  const list = document.createElement('div');
  list.style.cssText = 'max-height:210px;overflow:auto;border:1px solid #d8d3c9;border-radius:4px;padding:4px 6px;margin-bottom:8px;background:#fff;';
  panel.appendChild(list);

  const forceRow = document.createElement('label');
  forceRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;cursor:pointer;';
  const forceBox = document.createElement('input');
  forceBox.type = 'checkbox';
  const forceText = document.createElement('span');
  forceText.textContent = 'Also delete locked objects';
  forceRow.append(forceBox, forceText);
  panel.appendChild(forceRow);

  const hint = document.createElement('div');
  hint.textContent = 'Only the ticked objects are removed. A track is removed on every frame it spans. Nothing reaches the server until you press CVAT’s Save button.';
  hint.style.cssText = 'color:#555;font-size:12px;margin-bottom:8px;';
  panel.appendChild(hint);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:12px;min-height:16px;margin-top:8px;color:#000;';
  const setStatus = (msg, bad) => {
    status.textContent = msg;
    status.style.color = bad ? '#b54532' : '#166534';
  };

  const visibleEntries = () => {
    const q = search.value.trim().toLowerCase();
    return entries.filter(e => !q || e.name.toLowerCase().includes(q));
  };

  const updateDeleteLabel = (armed) => {
    const n = entries.filter(e => selected.has(e.clientID)).length;
    deleteBtn.textContent = armed
      ? `Really delete ${n}?`
      : n
        ? `Delete ${n} object${n === 1 ? '' : 's'}`
        : 'Delete selected';
    deleteBtn.disabled = n === 0;
    deleteBtn.style.opacity = n ? '1' : '.5';
  };

  const renderList = () => {
    list.replaceChildren();
    const groups = [...groupByName(visibleEntries()).entries()]
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.textContent = entries.length ? 'No labels match the search.' : 'No objects here.';
      empty.style.cssText = 'color:#555;';
      list.appendChild(empty);
      updateDeleteLabel(false);
      return;
    }
    for (const [name, arr] of groups) {
      const details = document.createElement('details');
      details.open = expanded.has(name);
      details.addEventListener('toggle', () => {
        if (details.open) expanded.add(name); else expanded.delete(name);
      });
      const summary = document.createElement('summary');
      summary.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 0;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const picked = arr.filter(e => selected.has(e.clientID)).length;
      cb.checked = picked === arr.length;
      cb.indeterminate = picked > 0 && picked < arr.length;
      cb.addEventListener('click', ev => ev.stopPropagation());
      cb.addEventListener('change', () => {
        for (const e of arr) {
          if (cb.checked) selected.add(e.clientID); else selected.delete(e.clientID);
        }
        renderList();
      });
      const nm = document.createElement('span');
      nm.textContent = name;
      nm.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      const cnt = document.createElement('span');
      const frames = new Set(arr.map(e => e.frame)).size;
      cnt.textContent = scope === 'job' ? `${arr.length} / ${frames} fr.` : String(arr.length);
      cnt.style.cssText = 'color:#666;font-size:12px;';
      summary.append(cb, nm, cnt);
      details.appendChild(summary);

      const rows = document.createElement('div');
      rows.style.cssText = 'padding-left:16px;';
      const shown = arr.slice(0, 200);
      for (const e of shown) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:1px 0;cursor:pointer;';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = selected.has(e.clientID);
        box.addEventListener('change', () => {
          if (box.checked) selected.add(e.clientID); else selected.delete(e.clientID);
          renderList();
        });
        const txt = document.createElement('span');
        txt.style.cssText = 'color:#555;font-size:12px;';
        txt.textContent = scope === 'job' ? `frame ${e.frame} · ${e.kind}` : e.kind;
        if (e.lock) {
          const lock = document.createElement('span');
          lock.textContent = 'locked';
          lock.style.cssText = 'color:#b54532;font-size:11px;';
          txt.appendChild(document.createTextNode(' '));
          txt.appendChild(lock);
        }
        if (e.hidden) {
          const hid = document.createElement('span');
          hid.textContent = 'hidden';
          hid.style.cssText = 'color:#666;font-size:11px;';
          txt.appendChild(document.createTextNode(' '));
          txt.appendChild(hid);
        }
        if (e.groundTruth) {
          const gt = document.createElement('span');
          gt.textContent = 'ground truth';
          gt.style.cssText = 'color:#666;font-size:11px;';
          txt.appendChild(document.createTextNode(' '));
          txt.appendChild(gt);
        }
        row.append(box, txt);
        rows.appendChild(row);
      }
      if (arr.length > shown.length) {
        const more = document.createElement('div');
        more.textContent = `…and ${arr.length - shown.length} more`;
        more.style.cssText = 'color:#555;font-size:12px;';
        rows.appendChild(more);
      }
      details.appendChild(rows);
      list.appendChild(details);
    }
    updateDeleteLabel(false);
  };

  const reload = async keepSelection => {
    if (!keepSelection) selected.clear();
    if (scope === 'frame') {
      entries = await frameEntries();
      renderList();
      const labels = groupByName(entries).size;
      setStatus(
        `${entries.length} object${entries.length === 1 ? '' : 's'} in ${labels} label${labels === 1 ? '' : 's'} on frame ${frame}.`,
        false,
      );
      return;
    }
    setStatus('Reading every object in the job…');
    const jobList = await jobEntries();
    if (jobList === null) {
      entries = [];
      renderList();
      setStatus('This CVAT version does not expose the whole-job list — use “This frame”.', true);
      return;
    }
    entries = jobList;
    renderList();
    const frames = new Set(entries.map(e => e.frame)).size;
    setStatus(
      `${entries.length} object${entries.length === 1 ? '' : 's'} in ${frames} frame${frames === 1 ? '' : 's'} of this job.`,
      false,
    );
  };

  allRow.appendChild(mkBtn('Select all', () => {
    for (const e of visibleEntries()) selected.add(e.clientID);
    renderList();
  }));
  allRow.appendChild(mkBtn('Select none', () => {
    for (const e of visibleEntries()) selected.delete(e.clientID);
    renderList();
  }));
  allRow.appendChild(mkBtn('Refresh', () => reload(false)));
  panel.insertBefore(allRow, list);

  scopeSelect.addEventListener('change', async () => {
    scope = scopeSelect.value;
    expanded.clear();
    await reload(false);
  });

  forceBox.addEventListener('change', () => updateDeleteLabel(false));

  const collectTargets = async chosen => {
    if (scope === 'frame') {
      const live = reduxStates();
      const out = [];
      for (const e of chosen) {
        const s = e.state || live.find(x => x.clientID === e.clientID);
        if (s) out.push({ entry: e, state: s });
      }
      return out;
    }
    const byFrame = new Map();
    for (const e of chosen) {
      const arr = byFrame.get(e.frame) || [];
      arr.push(e);
      byFrame.set(e.frame, arr);
    }
    const out = [];
    for (const [f, listForFrame] of byFrame) {
      const states = await collectionStates(f);
      for (const e of listForFrame) {
        const s = states.find(x => x.clientID === e.clientID);
        if (s) out.push({ entry: e, state: s });
      }
    }
    return out;
  };

  let armed = false;
  let armTimer = null;

  const remove = async () => {
    const chosen = entries.filter(e => selected.has(e.clientID));
    if (!chosen.length) return setStatus('Tick the objects you want to delete first.', true);
    if (!armed) {
      armed = true;
      updateDeleteLabel(true);
      setStatus('Click the button again to confirm.', true);
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        armed = false;
        updateDeleteLabel(false);
      }, 4000);
      return;
    }
    armed = false;
    clearTimeout(armTimer);
    deleteBtn.disabled = true;
    setStatus('Deleting…');
    const force = forceBox.checked;
    const targets = await collectTargets(chosen);
    const removed = [];
    let failed = 0;
    let locked = 0;
    let skipped = 0;
    for (const { entry, state } of targets) {
      if (entry.groundTruth) { skipped++; continue; }
      try {
        const ok = await state.delete(entry.frame, force);
        if (ok) removed.push(state); else locked++;
      } catch (e) {
        failed++;
        console.error('DELETE could not remove an object:', e);
      }
    }
    const missing = chosen.length - targets.length;

    let history = anno().annotations.history;
    try {
      history = await job.actions.get();
    } catch (e) {
      console.warn('DELETE history refresh failed:', e);
    }
    for (const s of removed) {
      store.dispatch({
        type: 'REMOVE_OBJECT_SUCCESS',
        payload: { objectState: s, history },
      });
    }

    await reload(true);
    const extra = [
      locked ? `${locked} locked skipped` : '',
      skipped ? `${skipped} ground truth skipped` : '',
      missing ? `${missing} not found` : '',
      failed ? `${failed} failed` : '',
    ].filter(Boolean);
    setStatus(
      `Removed ${removed.length} object${removed.length === 1 ? '' : 's'}` +
      (extra.length ? ` — ${extra.join(', ')}` : '') +
      '. Press CVAT’s Save button to write the change to the server.',
      failed > 0 || locked > 0,
    );
    console.log(`DELETE frame ${frame}: ${removed.length} objects removed` +
      (extra.length ? `, ${extra.join(', ')}` : '') + '.');
  };

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
  const deleteBtn = mkBtn('Delete selected', () => remove());
  deleteBtn.style.cssText += 'font-weight:700;background:#b54532;border-color:#b54532;color:#fff;padding:5px 10px;';
  actions.appendChild(deleteBtn);
  panel.appendChild(actions);
  panel.appendChild(status);

  await reload(false);
  console.log(`DELETE panel open on frame ${frame} — click × or run DELETE again to close.`);
})();
