(async () => {
  const ID = 'cvat-relabel-panel';
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

  const allLabels = Array.isArray(job.labels) ? job.labels : [];
  if (!allLabels.length) { console.error('This job has no labels.'); return; }

  const states = () => anno().annotations.states || [];

  // Tracks keep one label for every frame they span, so only shapes and tags are touched.
  const replaceable = () => states().filter(s =>
    (s.objectType === 'shape' || s.objectType === 'tag') && !s.lock && !s.isGroundTruth);

  const countByLabel = list => {
    const counts = new Map();
    for (const s of list) {
      const name = s.label && s.label.name;
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  };

  if (!countByLabel(replaceable()).size) {
    console.error(states().length
      ? `Nothing on frame ${frame} can be relabeled — locked and ground-truth objects are skipped.`
      : `No shapes or tags on frame ${frame}.`);
    return;
  }

  const zRange = list => {
    const layer = list.filter(s => s.objectType !== 'tag');
    let min = 0, max = 0;
    for (const s of layer) {
      const z = typeof s.zOrder === 'number' ? s.zOrder : 0;
      if (z < min) min = z;
      if (z > max) max = z;
    }
    return [min, max];
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
    'position:fixed;top:72px;right:16px;z-index:2147483647;width:280px;padding:12px 14px;' +
    'background:#ffffff;color:#000000;border:1px solid #24221e;border-radius:8px;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.3);font:13px/1.45 Arial,Helvetica,sans-serif;text-align:left;';
  document.body.appendChild(panel);

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:14px;';
  title.textContent = `Replace label · frame ${frame}`;
  head.appendChild(title);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Close';
  close.style.cssText = 'border:1px solid #cfc8bb;background:#fff;color:#000;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:15px;line-height:1;';
  close.addEventListener('click', () => panel.remove());
  head.append(close);
  panel.appendChild(head);

  const selectStyle = 'width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid #cfc8bb;border-radius:4px;background:#fff;color:#000;font:inherit;font-size:12px;';

  const sourceRow = document.createElement('div');
  sourceRow.style.cssText = 'margin-bottom:6px;';
  const sourceLabel = document.createElement('label');
  sourceLabel.textContent = 'Replace:';
  sourceLabel.style.cssText = 'font-weight:700;display:block;margin-bottom:2px;';
  sourceRow.appendChild(sourceLabel);
  const source = document.createElement('select');
  source.style.cssText = selectStyle;
  sourceRow.appendChild(source);
  panel.appendChild(sourceRow);

  const targetRow = document.createElement('div');
  targetRow.style.cssText = 'display:flex;align-items:flex-end;gap:6px;margin-bottom:6px;';
  const targetWrap = document.createElement('div');
  targetWrap.style.cssText = 'flex:1;';
  const targetLabel = document.createElement('label');
  targetLabel.textContent = 'With:';
  targetLabel.style.cssText = 'font-weight:700;display:block;margin-bottom:2px;';
  targetWrap.appendChild(targetLabel);
  const target = document.createElement('select');
  target.style.cssText = selectStyle;
  targetWrap.appendChild(target);
  targetRow.appendChild(targetWrap);
  const swapBtn = mkBtn('⇄', () => swapDirection());
  swapBtn.title = 'Swap direction';
  swapBtn.style.cssText += 'height:26px;padding:0 8px;';
  targetRow.appendChild(swapBtn);
  panel.appendChild(targetRow);

  const hint = document.createElement('div');
  hint.textContent = 'Only objects on this frame change. The edit is undoable with CVAT’s Undo button, and nothing reaches the server until you press Save.';
  hint.style.cssText = 'color:#555;font-size:12px;margin-bottom:8px;';
  panel.appendChild(hint);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:12px;min-height:16px;margin-top:8px;color:#000;';
  const setStatus = (msg, bad) => {
    status.textContent = msg;
    status.style.color = bad ? '#b54532' : '#166534';
  };

  const fillSource = (keep) => {
    const counts = countByLabel(replaceable());
    const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    source.replaceChildren();
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${counts.get(name)})`;
      source.appendChild(opt);
    }
    if (keep && names.includes(keep)) source.value = keep;
  };

  const fillTarget = (preferred) => {
    const from = source.value;
    const options = allLabels
      .filter(l => l.name && l.name !== from)
      .sort((a, b) => a.name.localeCompare(b.name));
    target.replaceChildren();
    for (const label of options) {
      const opt = document.createElement('option');
      opt.value = label.name;
      opt.textContent = label.name;
      target.appendChild(opt);
    }
    if (preferred && options.some(o => o.value === preferred)) target.value = preferred;
  };

  function swapDirection() {
    const from = source.value;
    const to = target.value;
    if ([...source.options].some(o => o.value === to)) source.value = to;
    fillTarget(from);
  }

  source.addEventListener('change', () => fillTarget());

  let busy = false;
  const apply = async () => {
    if (busy) return;
    const fromName = source.value;
    const toLabel = allLabels.find(l => l.name === target.value);
    if (!fromName) return setStatus('Pick the label you want to replace.', true);
    if (!toLabel) return setStatus('Pick the label you want to use instead.', true);
    if (fromName === toLabel.name) return setStatus('Pick two different labels.', true);

    const affected = replaceable().filter(s => s.label && s.label.name === fromName);
    if (!affected.length) return setStatus(`No replaceable objects use “${fromName}” on frame ${frame}.`, true);

    const all = states();
    const locked = all.filter(s => s.lock && s.label && s.label.name === fromName).length;
    const tracks = all.filter(s => s.objectType === 'track' && s.label && s.label.name === fromName).length;

    busy = true;
    const saved = [];
    let failed = 0;
    try {
      for (const s of affected) {
        const previous = s.label;
        s.label = toLabel; // marks the state as changed, exactly like CVAT’s own label dropdown
        try {
          saved.push(await s.save());
        } catch (e) {
          s.label = previous; // nothing was written, so put the old label back
          failed++;
          console.error('RELABEL could not save an object:', e);
        }
      }

      try {
        const history = await job.actions.get();
        const [minZ, maxZ] = zRange(states());
        store.dispatch({
          type: 'UPDATE_ANNOTATIONS_SUCCESS',
          payload: { states: saved, history, minZ, maxZ },
        });
      } catch (e) {
        console.warn('RELABEL UI refresh failed:', e);
      }
    } finally {
      busy = false;
    }

    fillSource(fromName);
    fillTarget(toLabel.name);

    const extra = [
      locked ? `${locked} locked skipped` : '',
      tracks ? `${tracks} track${tracks === 1 ? '' : 's'} skipped` : '',
      failed ? `${failed} failed` : '',
    ].filter(Boolean);

    setStatus(
      `Replaced ${saved.length} object${saved.length === 1 ? '' : 's'} “${fromName}” → “${toLabel.name}” on frame ${frame}.` +
      (extra.length ? ` ${extra.join(', ')}.` : '') +
      ' Press CVAT’s Save button to write them to the server.',
      failed > 0,
    );
    console.log(`RELABEL frame ${frame}: ${saved.length} objects ${fromName} -> ${toLabel.name}` +
      (failed ? `, ${failed} failed` : '') + '.');
  };

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
  const applyBtn = mkBtn('Replace label', () => apply());
  applyBtn.style.cssText += 'font-weight:700;background:#b54532;border-color:#b54532;color:#fff;padding:5px 10px;';
  actions.append(applyBtn);
  panel.appendChild(actions);
  panel.appendChild(status);

  fillSource();
  fillTarget();

  const counts = countByLabel(replaceable());
  const skipped = states().filter(s => s.objectType === 'track').length;
  setStatus(
    `${counts.size} label${counts.size === 1 ? '' : 's'} on frame ${frame}` +
    (skipped ? `, ${skipped} track${skipped === 1 ? '' : 's'} left alone` : '') + '.',
    false,
  );
  console.log(`RELABEL panel open on frame ${frame} — click × or run RELABEL again to close.`);
})();
