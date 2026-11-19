import './index.css';
import {
  ACTION_JUMP,
  ACTION_LABELS,
  ACTION_RUN,
  QLearningAgent,
  STATES,
} from './qlearning.js';
import { DinoEnvironment } from './game.js';
import { drawLearningChart } from './charts.js';

const agent = new QLearningAgent();

// DOM references
const gameCanvas = document.getElementById('game-canvas');
const gameCtx = gameCanvas.getContext('2d');
const chartCanvas = document.getElementById('chart-canvas');

const metricEpisode = document.getElementById('metric-episode');
const metricScore = document.getElementById('metric-score');
const metricBest = document.getElementById('metric-best');
const metricEpsilon = document.getElementById('metric-epsilon');

const hudStateLabel = document.getElementById('hud-state-label');
const hudDistance = document.getElementById('hud-distance');
const hudAction = document.getElementById('hud-action');
const hudPolicyType = document.getElementById('hud-policy-type');

const btnTogglePlay = document.getElementById('btn-toggle-play');
const btnStep = document.getElementById('btn-step');
const btnResetMemory = document.getElementById('btn-reset-memory');
const btnHeaderBurst = document.getElementById('btn-header-burst');
const btnResetParams = document.getElementById('btn-reset-params');

const speedButtons = document.querySelectorAll('.speed-btn');
const modeAiBtn = document.getElementById('mode-ai');
const modeManualBtn = document.getElementById('mode-manual');
const toggleSensors = document.getElementById('toggle-sensors');

const sliderAlpha = document.getElementById('slider-alpha');
const sliderGamma = document.getElementById('slider-gamma');
const sliderEpsilon = document.getElementById('slider-epsilon');
const toggleDecay = document.getElementById('toggle-decay');

const valAlpha = document.getElementById('val-alpha');
const valGamma = document.getElementById('val-gamma');
const valEpsilon = document.getElementById('val-epsilon');

const belSa = document.getElementById('bel-sa');
const belR = document.getElementById('bel-r');
const belSubstitution = document.getElementById('bel-substitution');
const belResult = document.getElementById('bel-result');

const qTableBody = document.getElementById('qtable-body');
const filterButtons = document.querySelectorAll('.filter-btn');

let isRunning = false;
let speedMultiplier = 1;
let stateFilter = 'all'; // 'all' | 'narrow' | 'wide'
let animationFrameId = null;

// Build Q-Table DOM rows once for smooth, flicker-free real-time updates
const qRowRefs = [];

function buildQTableRows() {
  qTableBody.innerHTML = '';
  qRowRefs.length = 0;

  for (let i = 0; i < STATES.length; i += 1) {
    const s = STATES[i];
    const tr = document.createElement('tr');
    tr.className = 'transition-colors duration-150 hover:bg-slate-50/80';
    tr.dataset.obsType = s.obsTypeId;

    tr.innerHTML = `
      <td class="py-2.5 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">${s.code}</td>
      <td class="py-2.5 px-4 text-slate-700">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-slate-900">${s.zoneName}</span>
          <span class="font-mono text-xs text-slate-500">(${s.rangeLabel})</span>
          <span class="text-slate-400">·</span>
          <span class="text-slate-600">${s.obsLabel}</span>
        </div>
      </td>
      <td class="py-2.5 px-4 font-mono tabular-nums" data-cell="run">
        <div class="flex items-center justify-between gap-2">
          <div class="w-24 h-2 bg-slate-100 rounded-xs overflow-hidden relative shrink-0">
            <div class="bar-run h-full bg-sky-600 transition-all duration-150" style="width: 0%"></div>
          </div>
          <span class="val-run font-semibold text-slate-700 text-right w-16">0.00</span>
        </div>
      </td>
      <td class="py-2.5 px-4 font-mono tabular-nums" data-cell="jump">
        <div class="flex items-center justify-between gap-2">
          <div class="w-24 h-2 bg-slate-100 rounded-xs overflow-hidden relative shrink-0">
            <div class="bar-jump h-full bg-emerald-600 transition-all duration-150" style="width: 0%"></div>
          </div>
          <span class="val-jump font-semibold text-slate-700 text-right w-16">0.00</span>
        </div>
      </td>
      <td class="py-2.5 px-4 font-medium whitespace-nowrap policy-cell text-slate-500">— Indefinido</td>
      <td class="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 visits-cell">0</td>
    `;

    qTableBody.appendChild(tr);

    qRowRefs.push({
      tr,
      runCell: tr.querySelector('[data-cell="run"]'),
      jumpCell: tr.querySelector('[data-cell="jump"]'),
      barRun: tr.querySelector('.bar-run'),
      barJump: tr.querySelector('.bar-jump'),
      valRun: tr.querySelector('.val-run'),
      valJump: tr.querySelector('.val-jump'),
      policyCell: tr.querySelector('.policy-cell'),
      visitsCell: tr.querySelector('.visits-cell'),
    });
  }
}

function formatQ(value) {
  const sign = value > 0.005 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function updateQTableVisuals(flashRecord = null) {
  // Compute dynamic scale so bars respond meaningfully across negative & positive Q-values
  let maxAbs = 15;
  for (let i = 0; i < agent.qTable.length; i += 1) {
    maxAbs = Math.max(maxAbs, Math.abs(agent.qTable[i][0]), Math.abs(agent.qTable[i][1]));
  }

  for (let i = 0; i < STATES.length; i += 1) {
    const s = STATES[i];
    const ref = qRowRefs[i];
    const [qRun, qJump] = agent.qTable[i];
    const totalVisits = agent.visits[i][0] + agent.visits[i][1];

    // Filter visibility
    const visible = stateFilter === 'all' || s.obsTypeId === stateFilter;
    ref.tr.style.display = visible ? '' : 'none';

    // Active state highlight
    if (i === env.currentState) {
      ref.tr.classList.add('q-row-active');
    } else {
      ref.tr.classList.remove('q-row-active');
    }

    // Update RUN bar & value
    const runPct = Math.min(100, (Math.abs(qRun) / maxAbs) * 100);
    ref.barRun.style.width = `${runPct}%`;
    ref.barRun.className = `bar-run h-full transition-all duration-150 ${
      qRun < -0.01 ? 'bg-red-600' : 'bg-sky-600'
    }`;
    ref.valRun.textContent = formatQ(qRun);
    ref.valRun.className = `val-run font-semibold text-right w-16 ${
      qRun < -0.01 ? 'text-red-700' : qRun > 0.01 ? 'text-sky-700' : 'text-slate-600'
    }`;

    // Update JUMP bar & value
    const jumpPct = Math.min(100, (Math.abs(qJump) / maxAbs) * 100);
    ref.barJump.style.width = `${jumpPct}%`;
    ref.barJump.className = `bar-jump h-full transition-all duration-150 ${
      qJump < -0.01 ? 'bg-red-600' : 'bg-emerald-600'
    }`;
    ref.valJump.textContent = formatQ(qJump);
    ref.valJump.className = `val-jump font-semibold text-right w-16 ${
      qJump < -0.01 ? 'text-red-700' : qJump > 0.01 ? 'text-emerald-700' : 'text-slate-600'
    }`;

    // Policy decision column
    if (Math.abs(qRun - qJump) < 0.01) {
      ref.policyCell.textContent = '— Indefinido';
      ref.policyCell.className = 'py-2.5 px-4 font-medium whitespace-nowrap policy-cell text-slate-500';
    } else if (qJump > qRun) {
      ref.policyCell.textContent = '↑ Saltar';
      ref.policyCell.className = 'py-2.5 px-4 font-semibold whitespace-nowrap policy-cell text-emerald-700';
    } else {
      ref.policyCell.textContent = '→ Correr';
      ref.policyCell.className = 'py-2.5 px-4 font-semibold whitespace-nowrap policy-cell text-sky-700';
    }

    ref.visitsCell.textContent = String(totalVisits);
  }

  // Trigger flash animation on the mutated cell
  if (flashRecord) {
    const ref = qRowRefs[flashRecord.state];
    const targetCell = flashRecord.action === ACTION_JUMP ? ref.jumpCell : ref.runCell;
    const cls = flashRecord.delta >= 0 ? 'q-flash-pos' : 'q-flash-neg';
    targetCell.classList.remove('q-flash-pos', 'q-flash-neg');
    // Force reflow to restart CSS keyframe cleanly
    void targetCell.offsetWidth;
    targetCell.classList.add(cls);
  }
}

function updateBellmanInspector(record) {
  if (!record) {
    belSa.textContent = 'Aguardando passo...';
    belR.textContent = '--';
    belSubstitution.textContent =
      'Inicie a simulação ou clique em "Passo a Passo" para ver o cálculo.';
    belResult.textContent = '--';
    return;
  }

  const stateObj = STATES[record.state];
  const actionStr = ACTION_LABELS[record.action];
  belSa.textContent = `${stateObj.code} · ${actionStr}`;

  const rSign = record.reward > 0 ? '+' : '';
  belR.textContent = `${rSign}${record.reward.toFixed(1)}`;
  belR.className = `font-semibold ${
    record.reward > 1
      ? 'text-emerald-700'
      : record.reward < -5
      ? 'text-red-700'
      : record.reward < 0
      ? 'text-amber-700'
      : 'text-sky-700'
  }`;

  const maxNextDisplay = record.isTerminal ? '0.00 (Colisão)' : record.maxNextQ.toFixed(2);
  belSubstitution.textContent = `Q = ${record.oldQ.toFixed(2)} + ${record.alpha.toFixed(
    2
  )} × [ ${record.reward.toFixed(1)} + ${record.gamma.toFixed(2)} × ${maxNextDisplay} − ${record.oldQ.toFixed(
    2
  )} ]`;

  const deltaSign = record.delta >= 0 ? '+' : '';
  belResult.textContent = `${record.newQ.toFixed(2)} (Δ ${deltaSign}${record.delta.toFixed(2)})`;
  belResult.className =
    record.delta >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700';
}

function syncHUD() {
  metricEpisode.textContent = String(agent.episode);
  metricScore.textContent = String(env.score);
  metricBest.textContent = String(agent.bestScore);

  const epsPct = `${(agent.epsilon * 100).toFixed(1)}%`;
  metricEpsilon.textContent = epsPct;
  sliderEpsilon.value = agent.epsilon.toFixed(2);
  valEpsilon.textContent = `${Math.round(agent.epsilon * 100)}%`;

  const stateObj = STATES[env.currentState];
  hudStateLabel.textContent = stateObj.fullLabel;
  hudDistance.textContent =
    env.currentDistance >= 390 ? '> 390 px' : `${Math.round(env.currentDistance)} px`;

  hudAction.textContent = ACTION_LABELS[env.lastAction];
  hudAction.className = `font-semibold ml-1 ${
    env.lastAction === ACTION_JUMP ? 'text-emerald-700' : 'text-sky-700'
  }`;

  if (env.mode === 'manual') {
    hudPolicyType.textContent = '(Controle Manual)';
  } else {
    hudPolicyType.textContent = env.lastWasExploration ? '(Exploração ε)' : '(Política Q)';
  }
}

const env = new DinoEnvironment(agent, {
  onQUpdate: (record) => {
    updateBellmanInspector(record);
    if (speedMultiplier <= 10) {
      updateQTableVisuals(record);
    }
  },
  onEpisodeEnd: () => {
    drawLearningChart(chartCanvas, agent.scoreHistory);
    updateQTableVisuals(agent.lastUpdate);
  },
});

function renderFrame() {
  env.render(gameCtx);
  syncHUD();
}

function loop() {
  if (!isRunning) return;

  for (let i = 0; i < speedMultiplier; i += 1) {
    env.tick(false);
  }

  if (speedMultiplier > 10) {
    updateQTableVisuals(null);
  }

  renderFrame();
  animationFrameId = requestAnimationFrame(loop);
}

function setRunning(running) {
  isRunning = running;
  if (isRunning) {
    btnTogglePlay.textContent = 'Pausar';
    btnTogglePlay.className =
      'px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0';
    animationFrameId = requestAnimationFrame(loop);
  } else {
    btnTogglePlay.textContent = 'Iniciar Treinamento';
    btnTogglePlay.className =
      'px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors cursor-pointer whitespace-nowrap shrink-0';
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  }
}

// Event Listeners
btnTogglePlay.addEventListener('click', () => {
  setRunning(!isRunning);
});

btnStep.addEventListener('click', () => {
  if (isRunning) {
    setRunning(false);
  }
  // Advance until a Q-value updates or an episode finishes (max 80 ticks)
  for (let i = 0; i < 80; i += 1) {
    const res = env.tick(false);
    if (res.qUpdated || res.episodeEnded) {
      break;
    }
  }
  updateQTableVisuals(agent.lastUpdate);
  renderFrame();
});

btnResetMemory.addEventListener('click', () => {
  agent.resetMemory();
  env.resetEpisode();
  updateBellmanInspector(null);
  updateQTableVisuals(null);
  drawLearningChart(chartCanvas, agent.scoreHistory);
  renderFrame();
});

btnHeaderBurst.addEventListener('click', () => {
  const prevMode = env.mode;
  env.mode = 'ai';
  env.runHeadlessEpisodes(25);
  env.mode = prevMode;
  updateBellmanInspector(agent.lastUpdate);
  updateQTableVisuals(null);
  drawLearningChart(chartCanvas, agent.scoreHistory);
  renderFrame();
});

speedButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    speedMultiplier = Number(btn.dataset.speed);
    speedButtons.forEach((b) => {
      if (b === btn) {
        b.className =
          'speed-btn px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-white text-slate-900 shadow-xs cursor-pointer whitespace-nowrap shrink-0';
      } else {
        b.className =
          'speed-btn px-2.5 py-1 text-xs font-mono font-medium rounded-md text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0';
      }
    });
  });
});

function setControlMode(mode) {
  env.mode = mode;
  if (mode === 'ai') {
    modeAiBtn.className =
      'mode-btn px-2.5 py-1 text-xs font-medium rounded-md bg-white text-slate-900 shadow-xs cursor-pointer whitespace-nowrap shrink-0';
    modeManualBtn.className =
      'mode-btn px-2.5 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0';
  } else {
    modeManualBtn.className =
      'mode-btn px-2.5 py-1 text-xs font-medium rounded-md bg-white text-slate-900 shadow-xs cursor-pointer whitespace-nowrap shrink-0';
    modeAiBtn.className =
      'mode-btn px-2.5 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0';
    if (!isRunning) setRunning(true);
  }
  renderFrame();
}

modeAiBtn.addEventListener('click', () => setControlMode('ai'));
modeManualBtn.addEventListener('click', () => setControlMode('manual'));

toggleSensors.addEventListener('change', (e) => {
  env.showSensors = e.target.checked;
  renderFrame();
});

sliderAlpha.addEventListener('input', (e) => {
  agent.alpha = Number(e.target.value);
  valAlpha.textContent = agent.alpha.toFixed(2);
});

sliderGamma.addEventListener('input', (e) => {
  agent.gamma = Number(e.target.value);
  valGamma.textContent = agent.gamma.toFixed(2);
});

sliderEpsilon.addEventListener('input', (e) => {
  agent.epsilon = Number(e.target.value);
  valEpsilon.textContent = `${Math.round(agent.epsilon * 100)}%`;
  metricEpsilon.textContent = `${(agent.epsilon * 100).toFixed(1)}%`;
});

toggleDecay.addEventListener('change', (e) => {
  agent.autoDecay = e.target.checked;
});

btnResetParams.addEventListener('click', () => {
  agent.resetHyperparameters();
  sliderAlpha.value = String(agent.alpha);
  sliderGamma.value = String(agent.gamma);
  sliderEpsilon.value = String(agent.epsilon);
  toggleDecay.checked = agent.autoDecay;
  valAlpha.textContent = agent.alpha.toFixed(2);
  valGamma.textContent = agent.gamma.toFixed(2);
  valEpsilon.textContent = `${Math.round(agent.epsilon * 100)}%`;
  metricEpsilon.textContent = `${(agent.epsilon * 100).toFixed(1)}%`;
});

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    stateFilter = btn.dataset.filter;
    filterButtons.forEach((b) => {
      if (b === btn) {
        b.className =
          'filter-btn px-3 py-1.5 text-xs font-medium rounded-md bg-white text-slate-900 shadow-xs cursor-pointer whitespace-nowrap shrink-0';
      } else {
        b.className =
          'filter-btn px-3 py-1.5 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0';
      }
    });
    updateQTableVisuals(null);
  });
});

// Keyboard support for manual jump or play/pause
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      return;
    }
    e.preventDefault();
    if (env.mode === 'manual') {
      env.triggerManualJump();
    } else if (e.code === 'Space') {
      setRunning(!isRunning);
    }
  }
});

// Allow clicking/tapping canvas in manual mode to jump
gameCanvas.addEventListener('pointerdown', () => {
  if (env.mode === 'manual') {
    env.triggerManualJump();
  }
});

window.addEventListener('resize', () => {
  drawLearningChart(chartCanvas, agent.scoreHistory);
});

// Initial render
buildQTableRows();
updateQTableVisuals(null);
updateBellmanInspector(null);
drawLearningChart(chartCanvas, agent.scoreHistory);
renderFrame();
