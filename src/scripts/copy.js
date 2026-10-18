(async () => {
  const LABELS = []; // [] = all, or e.g. ['gate']

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

  const st = store.getState().annotation;
  const job = st.job.instance;
  const frame = st.player.frame.number;
  const wanted = LABELS.map(s => s.toLowerCase());

  const states = await job.annotations.get(frame);
  const clip = states
    .filter(s => s.objectType === 'shape' &&
      (!wanted.length || wanted.includes(s.label.name.toLowerCase())))
    .map(s => ({
      labelId: s.label.id, labelName: s.label.name,
      shapeType: s.shapeType, points: [...s.points],
      occluded: s.occluded, zOrder: s.zOrder, rotation: s.rotation || 0,
      attributes: { ...s.attributes }, source: s.source || 'manual',
    }));

  const payload = JSON.stringify({ v: 1, jobId: job.id, frame, clip });
  localStorage.setItem('cvatClip', payload);

  let onClipboard = false;
  try { await navigator.clipboard.writeText(payload); onClipboard = true; } catch (e) {}
  console.log(`COPIED ${clip.length} shapes from frame ${frame}` +
    (onClipboard ? ' (also on clipboard)' : ' (clipboard blocked, saved locally only)'));
})();
