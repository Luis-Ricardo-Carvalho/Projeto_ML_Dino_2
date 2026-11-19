export function drawLearningChart(canvas, history) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  const cssW = rect.width;
  const cssH = rect.height;
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { top: 12, right: 16, bottom: 24, left: 36 };
  const plotW = cssW - pad.left - pad.right;
  const plotH = cssH - pad.top - pad.bottom;

  if (history.length === 0) {
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    ctx.fillStyle = '#64748B';
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Os resultados aparecerão ao concluir o primeiro episódio.',
      pad.left + plotW / 2,
      pad.top + plotH / 2 + 4
    );
    ctx.restore();
    return;
  }

  const maxVal = Math.max(5, ...history);
  const yMax = Math.ceil(maxVal / 5) * 5;

  // Horizontal grid lines
  ctx.font = '400 10px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#64748B';
  ctx.textAlign = 'right';
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const val = (yMax / ticks) * i;
    const y = pad.top + plotH - (val / yMax) * plotH;
    ctx.strokeStyle = i === 0 ? '#CBD5E1' : '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();

    ctx.fillText(String(Math.round(val)), pad.left - 6, y + 3);
  }

  // X axis labels
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Ep. 1', pad.left + 12, cssH - 6);
  if (history.length > 1) {
    ctx.fillText(`Ep. ${history.length}`, pad.left + plotW - 14, cssH - 6);
  }

  const getX = (idx) => {
    if (history.length === 1) return pad.left + plotW / 2;
    return pad.left + (idx / (history.length - 1)) * plotW;
  };
  const getY = (val) => pad.top + plotH - (val / yMax) * plotH;

  // Raw score line
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < history.length; i += 1) {
    const x = getX(i);
    const y = getY(history[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Moving average (window = 10)
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 2.25;
  ctx.beginPath();
  for (let i = 0; i < history.length; i += 1) {
    const start = Math.max(0, i - 9);
    let sum = 0;
    for (let j = start; j <= i; j += 1) sum += history[j];
    const avg = sum / (i - start + 1);
    const x = getX(i);
    const y = getY(avg);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.restore();
}
