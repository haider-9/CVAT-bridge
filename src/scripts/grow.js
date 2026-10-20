(async () => {
  const ID = 'cvat-grow-panel';
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
  const states = anno().annotations.states
    .filter(s => (s.objectType === 'shape' || s.objectType === 'track') && s.shapeType !== 'mask');
  if (!states.length) { console.error(`No rectangles on frame ${frame}.`); return; }

  const checked = new Set(states.map(s => s.label.name));
  const original = new Map(states.map(s => [s, [...s.points]]));
  const previewed = new Set();

  const redraw = () => {
    const a = anno().annotations;
    store.dispatch({
      type: 'UPDATE_ANNOTATIONS_SUCCESS',
      payload: { states: [...states], history: a.history, minZ: a.zLayer.min, maxZ: a.zLayer.max },
    });
  };

  const resizeShape = (s, d) => {
    const pts = s.points;
    if (!Array.isArray(pts) || pts.length !== 4) return false; // rectangles (and ellipse bboxes) only
    const x1 = Math.min(pts[0], pts[2]), x2 = Math.max(pts[0], pts[2]);
    const y1 = Math.min(pts[1], pts[3]), y2 = Math.max(pts[1], pts[3]);
    const nw = (x2 - x1) + 2 * d, nh = (y2 - y1) + 2 * d;
    if (!(nw > 0) || !(nh > 0)) return false;
    const ax = x1 - d, ay = y1 - d;
    s.points = [ax, ay, ax + nw, ay + nh];
    return true;
  };

  const groupByLabel = list => {
    const groups = new Map();
    for (const s of list) {
      const name = s.label.name;
      const arr = groups.get(name);
      if (arr) arr.push(s); else groups.set(name, [s]);
    }
    return groups;
  };

  const panel = document.createElement('div');
  panel.id = ID;
  panel.style.cssText =
    'position:fixed;top:72px;right:16px;z-index:2147483647;width:272px;padding:12px 14px;' +
    'background:#ffffff;color:#000000;border:1px solid #24221e;border-radius:8px;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.3);font:13px/1.45 Arial,Helvetica,sans-serif;text-align:left;';
  document.body.appendChild(panel);

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:14px;';
  title.textContent = `Grow / shrink · frame ${frame}`;
  head.appendChild(title);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Close (reverts an unapplied preview)';
  close.style.cssText = 'border:1px solid #cfc8bb;background:#fff;color:#000;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:15px;line-height:1;';
  close.addEventListener('click', () => {
    if (previewed.size) for (const s of previewed) s.points = [...original.get(s)];
    if (previewed.size) redraw();
    panel.remove();
  });
  head.appendChild(close);
  panel.appendChild(head);

  const sizeRow = document.createElement('div');
  sizeRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:4px;';
  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = 'px per side:';
  sizeLabel.style.cssText = 'font-weight:700;';
  sizeRow.appendChild(sizeLabel);
  const px = document.createElement('input');
  px.type = 'number';
  px.value = '5';
  px.min = '0';
  px.max = '200';
  px.step = '1';
  px.style.cssText = 'width:56px;padding:3px 6px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;font:inherit;';
  sizeRow.appendChild(px);
  panel.appendChild(sizeRow);

  const hint = document.createElement('div');
  hint.textContent = 'Width and height each grow by 2 × this value. Preview only — nothing is sent to CVAT until you press Apply, and nothing reaches the server until CVAT Save.';
  hint.style.cssText = 'color:#555;font-size:12px;margin-bottom:6px;';
  panel.appendChild(hint);

  const allRow = document.createElement('div');
  allRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  const mkBtn = (text, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText = 'padding:3px 8px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;cursor:pointer;font:inherit;font-size:12px;';
    b.addEventListener('click', fn);
    return b;
  };
  allRow.appendChild(mkBtn('Select all', () => {
    for (const name of groupByLabel(states).keys()) checked.add(name);
    renderList();
  }));
  allRow.appendChild(mkBtn('Select none', () => { checked.clear(); renderList(); }));
  panel.appendChild(allRow);

  const list = document.createElement('div');
  list.style.cssText = 'max-height:190px;overflow:auto;border:1px solid #d8d3c9;border-radius:4px;padding:4px 6px;margin-bottom:8px;background:#fff;';
  panel.appendChild(list);

  const renderList = () => {
    list.replaceChildren();
    const groups = [...groupByLabel(states).entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No rectangles on this frame.';
      empty.style.cssText = 'color:#555;';
      list.appendChild(empty);
      return;
    }
    for (const [name, arr] of groups) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked.has(name);
      cb.addEventListener('change', () => {
        if (cb.checked) checked.add(name); else checked.delete(name);
      });
      const nm = document.createElement('span');
      nm.textContent = name;
      nm.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      const cnt = document.createElement('span');
      cnt.textContent = String(arr.length);
      cnt.style.cssText = 'color:#666;font-size:12px;';
      row.append(cb, nm, cnt);
      list.appendChild(row);
    }
  };

  const status = document.createElement('div');
  status.style.cssText = 'font-size:12px;min-height:16px;margin-top:8px;color:#000;';
  const setStatus = (msg, bad) => {
    status.textContent = msg;
    status.style.color = bad ? '#b54532' : '#166534';
  };

  const preview = dir => {
    const amount = Number(px.value);
    if (!Number.isFinite(amount) || amount <= 0) return setStatus('Enter a px value above 0.', true);
    const delta = dir * amount;
    let changed = 0, skipped = 0;
    for (const s of states) {
      if (!checked.has(s.label.name)) continue;
      if (resizeShape(s, delta)) { previewed.add(s); changed++; } else skipped++;
    }
    if (!changed) return setStatus('Nothing resized — pick a label with rectangles.', true);
    redraw();
    applyBtn.disabled = false;
    applyBtn.style.opacity = '1';
    const verb = dir > 0 ? 'grown' : 'shrunk';
    setStatus(`Preview: ${changed} box${changed === 1 ? '' : 'es'} ${verb} by ${amount} px per side` +
      (skipped ? `, ${skipped} skipped` : '') + '. Check the canvas — nothing is saved yet.');
    console.log(`GROW preview frame ${frame}: ${changed} boxes ${verb} ${amount}px per side, no API calls.`);
  };

  const commit = async () => {
    const list = [...previewed];
    if (!list.length) return;
    try {
      await Promise.all(list.map(s => s.save())); // in-memory only; the server is hit by CVAT's Save button
    } catch (e) {
      console.error(e);
      return setStatus(`CVAT rejected the change: ${e.message || e}`, true);
    }
    for (const s of list) { original.set(s, [...s.points]); previewed.delete(s); }
    redraw();
    applyBtn.disabled = true;
    setStatus(`Applied ${list.length} box${list.length === 1 ? '' : 'es'} locally. Now press CVAT's Save button to write them to the server.`);
    console.log(`GROW applied ${list.length} boxes on frame ${frame} (in-memory).`);
  };

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
  const growBtn = mkBtn('Grow (preview)', () => preview(1));
  const shrinkBtn = mkBtn('Shrink (preview)', () => preview(-1));
  const applyBtn = mkBtn('Apply', () => commit());
  growBtn.style.cssText += 'font-weight:700;background:#b54532;border-color:#b54532;color:#fff;padding:5px 10px;';
  shrinkBtn.style.cssText += 'font-weight:700;padding:5px 10px;';
  applyBtn.style.cssText += 'font-weight:700;padding:5px 10px;';
  applyBtn.disabled = true;
  applyBtn.style.opacity = '.5';
  const origStyle = applyBtn.style.cssText;
  const syncApply = () => { applyBtn.style.opacity = applyBtn.disabled ? '.5' : '1'; };
  applyBtn.addEventListener('click', () => setTimeout(syncApply, 0));
  growBtn.addEventListener('click', syncApply);
  shrinkBtn.addEventListener('click', syncApply);
  actions.append(growBtn, shrinkBtn, applyBtn);
  panel.appendChild(actions);
  panel.appendChild(status);

  renderList();
  const rects = states.filter(s => Array.isArray(s.points) && s.points.length === 4).length;
  setStatus(`${states.length} shapes in ${groupByLabel(states).size} labels (${rects} rectangles) on this frame.`, false);
  console.log(`GROW panel open on frame ${frame} — click × or run GROW again to close.`);
})();
