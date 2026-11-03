(async () => {
  const ID = 'cvat-move-panel';
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

  const anno = () => store.getState().annotation;
  const frame = anno().player.frame.number;
  const job = anno().job && anno().job.instance;
  if (!job) { console.error('Job instance not found. Open a job in CVAT first.'); return; }
  const states = anno().annotations.states
    .filter(s => (s.objectType === 'shape' || s.objectType === 'track') &&
      Array.isArray(s.points) && s.points.length >= 2 && s.points.length % 2 === 0 && s.shapeType !== 'mask');
  if (!states.length) { console.error(`No movable shapes on frame ${frame}.`); return; }

  const checked = new Set(states.map(s => s.label && s.label.name).filter(Boolean));
  const groupByLabel = list => {
    const groups = new Map();
    for (const s of list) {
      const name = s.label && s.label.name;
      if (!name) continue;
      const arr = groups.get(name);
      if (arr) arr.push(s); else groups.set(name, [s]);
    }
    return groups;
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
  title.textContent = `Move labels · frame ${frame}`;
  head.appendChild(title);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Close';
  close.style.cssText = 'border:1px solid #cfc8bb;background:#fff;color:#000;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:15px;line-height:1;';
  close.addEventListener('click', () => panel.remove());
  head.appendChild(close);
  panel.appendChild(head);

  const inputStyle = 'width:100%;box-sizing:border-box;padding:4px 8px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;font:inherit;font-size:12px;';
  const offsetRow = document.createElement('div');
  offsetRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  const makeOffset = (label, value) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'flex:1;font-weight:700;';
    wrap.textContent = label;
    const input = document.createElement('input');
    input.type = 'number'; input.value = value; input.step = '1'; input.style.cssText = inputStyle;
    wrap.appendChild(input);
    return input;
  };
  const dx = makeOffset('X offset', '0');
  const dy = makeOffset('Y offset', '0');
  offsetRow.append(dx.parentElement, dy.parentElement);
  panel.appendChild(offsetRow);

  const hint = document.createElement('div');
  hint.textContent = 'Select one or more labels. Nothing reaches the server until you press CVAT’s Save button.';
  hint.style.cssText = 'color:#555;font-size:12px;margin-bottom:8px;';
  panel.appendChild(hint);

  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'Search labels…'; search.style.cssText = inputStyle;
  search.style.marginBottom = '6px';
  panel.appendChild(search);

  const allRow = document.createElement('div');
  allRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  const mkBtn = (text, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.style.cssText = 'padding:3px 8px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;cursor:pointer;font:inherit;font-size:12px;';
    b.addEventListener('click', fn);
    return b;
  };
  const list = document.createElement('div');
  list.style.cssText = 'max-height:190px;overflow:auto;border:1px solid #d8d3c9;border-radius:4px;padding:4px 6px;margin-bottom:8px;background:#fff;';
  panel.appendChild(list);

  const renderList = () => {
    list.replaceChildren();
    const q = search.value.trim().toLowerCase();
    const groups = [...groupByLabel(states).entries()]
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.textContent = q ? 'No labels match the search.' : 'No movable shapes on this frame.';
      empty.style.cssText = 'color:#555;'; list.appendChild(empty); return;
    }
    for (const [name, arr] of groups) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = checked.has(name);
      cb.addEventListener('change', () => { if (cb.checked) checked.add(name); else checked.delete(name); });
      const nm = document.createElement('span'); nm.textContent = name;
      nm.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      const cnt = document.createElement('span'); cnt.textContent = String(arr.length); cnt.style.cssText = 'color:#666;font-size:12px;';
      row.append(cb, nm, cnt); list.appendChild(row);
    }
  };
  search.addEventListener('input', renderList);
  allRow.append(mkBtn('Select all', () => { for (const name of groupByLabel(states).keys()) checked.add(name); renderList(); }),
    mkBtn('Select none', () => { checked.clear(); renderList(); }));
  panel.insertBefore(allRow, list);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:12px;min-height:16px;margin-top:8px;color:#000;';
  const setStatus = (msg, bad) => { status.textContent = msg; status.style.color = bad ? '#b54532' : '#166534'; };

  const move = async () => {
    const x = Number(dx.value), y = Number(dy.value);
    if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return setStatus('Enter a non-zero X or Y offset.', true);
    const chosen = states.filter(s => checked.has(s.label && s.label.name));
    if (!chosen.length) return setStatus('Select at least one label.', true);
    let moved = 0, failed = 0;
    for (const s of chosen) {
      s.points = s.points.map((value, index) => value + (index % 2 === 0 ? x : y));
      try { await s.save(); moved++; } catch (e) { failed++; console.error('MOVE could not save an object:', e); }
    }
    const a = anno().annotations;
    let history = a.history;
    try { history = await job.actions.get(); } catch (e) { console.warn('MOVE history refresh failed:', e); }
    store.dispatch({ type: 'UPDATE_ANNOTATIONS_SUCCESS', payload: { states: [...states], history, minZ: a.zLayer.min, maxZ: a.zLayer.max } });
    setStatus(`Moved ${moved} object${moved === 1 ? '' : 's'} by ${x}, ${y} px.` + (failed ? ` ${failed} failed.` : ' Press CVAT’s Save button to keep it.'), failed > 0);
  };

  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:6px;';
  const moveBtn = mkBtn('Move selected', move);
  moveBtn.style.cssText += 'font-weight:700;background:#b54532;border-color:#b54532;color:#fff;padding:5px 10px;';
  actions.appendChild(moveBtn); panel.append(actions, status);
  renderList();
  setStatus(`${groupByLabel(states).size} labels · ${states.length} movable objects.`, false);
  console.log(`MOVE panel open on frame ${frame} — click × or run MOVE again to close.`);
})();
