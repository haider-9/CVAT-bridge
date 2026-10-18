(async () => {
  const EMBEDDED_DATA = null;

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
  let data = EMBEDDED_DATA, from = 'embedded paste code';
  if (!data) {
    try { data = parse(await navigator.clipboard.readText()); from = 'clipboard'; } catch (e) {}
  }
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
  const skippedLabels = new Set();
  const states = [];
  for (const c of data.clip) {
    const sourceName = typeof c.labelName === 'string' ? c.labelName.trim() : '';
    const sourceId = c.labelId === null || c.labelId === undefined ? '' : String(c.labelId);
    const label =
      job.labels.find(l => l.name === sourceName) ||
      job.labels.find(l => l.name.trim().toLowerCase() === sourceName.toLowerCase()) ||
      job.labels.find(l => String(l.id) === sourceId);
    if (!label) {
      skipped++;
      skippedLabels.add(sourceName || sourceId || '(unknown)');
      continue;
    }
    states.push(new window.cvat.classes.ObjectState({
      frame, objectType: 'shape', shapeType: c.shapeType, label,
      points: c.points, occluded: c.occluded, zOrder: c.zOrder,
      rotation: c.rotation, attributes: c.attributes, source: c.source,
    }));
  }

  if (!states.length) {
    return console.error(
      `No annotations could be matched to labels in this job. Skipped labels: ${[...skippedLabels].join(', ')}`,
    );
  }

  await job.annotations.put(states);

  try {
    const fresh = await job.annotations.get(frame);
    const history = await job.actions.get();
    store.dispatch({ type: 'CREATE_ANNOTATIONS_SUCCESS', payload: { states: fresh, history } });
  } catch (e) { console.warn('UI refresh failed:', e); }

  console.log(`PASTED ${states.length} shapes onto frame ${frame} (from ${from})` +
    (skipped ? `, ${skipped} skipped (${[...skippedLabels].join(', ')})` : '') + '. Press Save to keep them.');
})();
