export const ACTION_RUN = 0;
export const ACTION_JUMP = 1;

export const ACTION_LABELS = {
  [ACTION_RUN]: '→ Correr',
  [ACTION_JUMP]: '↑ Saltar',
};

export const DISTANCE_ZONES = [
  { id: 'Z0', name: 'Crítica', rangeLabel: '0–40 px', min: 0, max: 40 },
  { id: 'Z1', name: 'Curta', rangeLabel: '40–85 px', min: 40, max: 85 },
  { id: 'Z2', name: 'Ideal', rangeLabel: '85–130 px', min: 85, max: 130 },
  { id: 'Z3', name: 'Aproximação', rangeLabel: '130–185 px', min: 130, max: 185 },
  { id: 'Z4', name: 'Distante', rangeLabel: '185–270 px', min: 185, max: 270 },
  { id: 'Z5', name: 'Livre', rangeLabel: '> 270 px', min: 270, max: Infinity },
];

export const OBSTACLE_TYPES = [
  { id: 'narrow', label: 'Estreito' },
  { id: 'wide', label: 'Largo' },
];

export const STATES = [];
for (let z = 0; z < DISTANCE_ZONES.length; z += 1) {
  for (let o = 0; o < OBSTACLE_TYPES.length; o += 1) {
    const index = z * OBSTACLE_TYPES.length + o;
    const zone = DISTANCE_ZONES[z];
    const obs = OBSTACLE_TYPES[o];
    STATES.push({
      index,
      code: `E${String(index).padStart(2, '0')}`,
      zoneIndex: z,
      obsTypeIndex: o,
      obsTypeId: obs.id,
      zoneName: zone.name,
      rangeLabel: zone.rangeLabel,
      obsLabel: obs.label,
      fullLabel: `E${String(index).padStart(2, '0')} · ${zone.name} (${zone.rangeLabel}) · ${obs.label}`,
    });
  }
}

export function getDistanceZoneIndex(distancePx) {
  for (let i = 0; i < DISTANCE_ZONES.length; i += 1) {
    if (distancePx < DISTANCE_ZONES[i].max) {
      return i;
    }
  }
  return DISTANCE_ZONES.length - 1;
}

export function encodeStateIndex(distancePx, obsTypeIndex) {
  const safeDistance = Math.max(0, distancePx);
  const zoneIndex = getDistanceZoneIndex(safeDistance);
  return zoneIndex * OBSTACLE_TYPES.length + obsTypeIndex;
}

export class QLearningAgent {
  constructor() {
    this.alpha = 0.25;
    this.gamma = 0.90;
    this.epsilon = 0.35;
    this.minEpsilon = 0.03;
    this.epsilonDecay = 0.95;
    this.autoDecay = true;

    this.episode = 1;
    this.bestScore = 0;
    this.scoreHistory = [];
    this.lastUpdate = null;

    this.qTable = STATES.map(() => [0, 0]);
    this.visits = STATES.map(() => [0, 0]);
  }

  resetMemory() {
    this.qTable = STATES.map(() => [0, 0]);
    this.visits = STATES.map(() => [0, 0]);
    this.episode = 1;
    this.bestScore = 0;
    this.scoreHistory = [];
    this.lastUpdate = null;
    this.epsilon = 0.35;
  }

  resetHyperparameters() {
    this.alpha = 0.25;
    this.gamma = 0.90;
    this.epsilon = 0.35;
    this.autoDecay = true;
  }

  chooseAction(stateIndex, forceExploit = false) {
    if (!forceExploit && Math.random() < this.epsilon) {
      const action = Math.random() < 0.5 ? ACTION_RUN : ACTION_JUMP;
      return { action, isExploration: true };
    }

    const [qRun, qJump] = this.qTable[stateIndex];
    if (Math.abs(qRun - qJump) < 1e-6) {
      const action = Math.random() < 0.5 ? ACTION_RUN : ACTION_JUMP;
      return { action, isExploration: false };
    }

    return {
      action: qJump > qRun ? ACTION_JUMP : ACTION_RUN,
      isExploration: false,
    };
  }

  update(state, action, reward, nextState, isTerminal) {
    const oldQ = this.qTable[state][action];
    const maxNextQ = isTerminal
      ? 0
      : Math.max(this.qTable[nextState][ACTION_RUN], this.qTable[nextState][ACTION_JUMP]);

    const tdTarget = reward + this.gamma * maxNextQ;
    const tdError = tdTarget - oldQ;
    const newQ = oldQ + this.alpha * tdError;

    this.qTable[state][action] = newQ;
    this.visits[state][action] += 1;

    const record = {
      state,
      action,
      reward,
      nextState,
      isTerminal,
      oldQ,
      newQ,
      delta: newQ - oldQ,
      maxNextQ,
      tdTarget,
      tdError,
      alpha: this.alpha,
      gamma: this.gamma,
    };

    this.lastUpdate = record;
    return record;
  }

  finishEpisode(score) {
    this.scoreHistory.push(score);
    if (score > this.bestScore) {
      this.bestScore = score;
    }
    this.episode += 1;
    if (this.autoDecay) {
      this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);
    }
  }
}
