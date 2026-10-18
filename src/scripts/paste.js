(async () => {
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
  const parse = t => {
    try { const d = JSON.parse(t); return d && d.v === 1 && Array.isArray(d.clip) ? d : null; }
    catch { return null; }
  };

  // 1) clipboard (selection from the web page or COPY), 2) last COPY
  let data = null, from = '';
  try { data = parse(await navigator.clipboard.readText()); from = 'clipboard'; } catch (e) {}
  if (!data) { data = parse(localStorage.getItem('cvatClip')); from = 'last COPY'; }
  if (!data) return console.error('Nothing to paste. Run COPY first.');

  const store = window.__cvatStore || findStore();
  if (!store) return console.error('Redux store not found');
  window.__cvatStore = store;

  const st = store.getState().annotation;
  const job = st.job.instance;
  const frame = st.player.frame.number;

  if (frame === data.frame && !data.sel)
    return console.error('This is the source frame. Open another one.');
  if (data.jobId !== job.id)
    console.warn('Data is from a different job, matching labels by name.');

  let skipped = 0;
  const states = [];
  for (const c of data.clip) {
    const label =
      job.labels.find(l => l.name === c.labelName) ||
      job.labels.find(l => l.id === c.labelId);
    if (!label) { skipped++; continue; }
    states.push(new window.cvat.classes.ObjectState({
      frame, objectType: 'shape', shapeType: c.shapeType, label,
      points: c.points, occluded: c.occluded, zOrder: c.zOrder,
      rotation: c.rotation, attributes: c.attributes, source: c.source,
    }));
  }

  await job.annotations.put(states);

  try {
    const fresh = await job.annotations.get(frame);
    const history = await job.actions.get();
    store.dispatch({ type: 'CREATE_ANNOTATIONS_SUCCESS', payload: { states: fresh, history } });
  } catch (e) { console.warn('UI refresh failed:', e); }

  console.log(`PASTED ${states.length} shapes onto frame ${frame} (from ${from})` +
    (skipped ? `, ${skipped} skipped (label not in this job)` : '') + '. Press Save to keep them.');
})();
