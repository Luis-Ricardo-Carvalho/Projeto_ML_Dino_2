import {
  ACTION_JUMP,
  ACTION_RUN,
  DISTANCE_ZONES,
  STATES,
  encodeStateIndex,
} from './qlearning.js';

export const REWARDS = {
  RUN_ALIVE: 0.5,
  CLEAR_CACTUS: 20.0,
  WASTED_JUMP: -20.0,
  COLLISION: -100.0,
};

export class DinoEnvironment {
  constructor(agent, callbacks = {}) {
    this.agent = agent;
    this.callbacks = callbacks;

    this.width = 840;
    this.height = 270;
    this.groundY = 224;

    this.dino = {
      x: 84,
      width: 34,
      height: 44,
      y: this.groundY - 44,
      vy: 0,
      isGrounded: true,
      legFrame: 0,
      dead: false,
    };

    this.gravity = 0.65;
    this.jumpVelocity = -12.6;
    this.speed = 6.2;

    this.obstacles = [];
    this.particles = [];
    this.floatingLabels = [];
    this.groundDots = [];

    for (let i = 0; i < 28; i += 1) {
      this.groundDots.push({
        x: Math.random() * this.width,
        y: this.groundY + 8 + Math.random() * 24,
        w: 2 + Math.floor(Math.random() * 6),
      });
    }

    this.mode = 'ai'; // 'ai' | 'manual'
    this.showSensors = true;

    this.score = 0;
    this.decisionCadence = 3; // physics ticks per ground decision
    this.groundTicks = 0;

    this.currentState = 10;
    this.lastAction = ACTION_RUN;
    this.lastWasExploration = false;

    this.pendingRun = null;
    this.pendingJump = null;
    this.manualJumpQueued = false;
    this.deathFreezeTicks = 0;

    this.resetEpisode();
  }

  resetEpisode() {
    this.dino.y = this.groundY - this.dino.height;
    this.dino.vy = 0;
    this.dino.isGrounded = true;
    this.dino.dead = false;
    this.dino.legFrame = 0;

    this.obstacles = [];
    this.particles = [];
    this.floatingLabels = [];
    this.score = 0;
    this.groundTicks = 0;
    this.pendingRun = null;
    this.pendingJump = null;
    this.deathFreezeTicks = 0;

    // Spawn first cactus at a fair starting distance
    this.spawnObstacle(540);
    this.updatePerception();
  }

  spawnObstacle(startX) {
    const isWide = Math.random() < 0.45;
    const width = isWide ? 46 : 22;
    const height = isWide ? 42 : 38;
    this.obstacles.push({
      x: startX,
      width,
      height,
      typeIndex: isWide ? 1 : 0,
      cleared: false,
    });
  }

  getNextObstacle() {
    const dinoRight = this.dino.x + this.dino.width;
    for (let i = 0; i < this.obstacles.length; i += 1) {
      const obs = this.obstacles[i];
      if (obs.x + obs.width >= this.dino.x + 4) {
        return {
          obs,
          distance: Math.max(0, obs.x - dinoRight),
        };
      }
    }
    return null;
  }

  updatePerception() {
    const next = this.getNextObstacle();
    if (!next) {
      this.currentDistance = 400;
      this.currentState = encodeStateIndex(400, 0);
    } else {
      this.currentDistance = next.distance;
      this.currentState = encodeStateIndex(next.distance, next.obs.typeIndex);
    }
  }

  triggerManualJump() {
    this.manualJumpQueued = true;
  }

  addFloatingLabel(text, x, y, color) {
    this.floatingLabels.push({
      text,
      x,
      y,
      color,
      life: 40,
      maxLife: 40,
    });
  }

  spawnDust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y - Math.random() * 4,
        vx: -1.5 - Math.random() * 2.2,
        vy: -0.6 - Math.random() * 1.6,
        size: 2 + Math.random() * 2.5,
        life: 16 + Math.floor(Math.random() * 10),
      });
    }
  }

  checkCollision() {
    const padX = 5;
    const padY = 4;
    const dx1 = this.dino.x + padX;
    const dy1 = this.dino.y + padY;
    const dx2 = this.dino.x + this.dino.width - padX;
    const dy2 = this.dino.y + this.dino.height - 2;

    for (let i = 0; i < this.obstacles.length; i += 1) {
      const obs = this.obstacles[i];
      const ox1 = obs.x + 3;
      const oy1 = this.groundY - obs.height + 3;
      const ox2 = obs.x + obs.width - 3;
      const oy2 = this.groundY;

      if (dx1 < ox2 && dx2 > ox1 && dy1 < oy2 && dy2 > oy1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Advances simulation by 1 physics frame.
   * Returns { qUpdated: boolean, episodeEnded: boolean }
   */
  tick(headless = false) {
    if (this.deathFreezeTicks > 0) {
      this.deathFreezeTicks -= 1;
      if (this.deathFreezeTicks === 0) {
        this.resetEpisode();
      }
      return { qUpdated: false, episodeEnded: false };
    }

    let qUpdated = false;
    let episodeEnded = false;

    // Move obstacles
    for (let i = 0; i < this.obstacles.length; i += 1) {
      this.obstacles[i].x -= this.speed;
    }

    // Remove off-screen obstacles and ensure upcoming obstacles exist
    if (this.obstacles.length > 0 && this.obstacles[0].x + this.obstacles[0].width < -40) {
      this.obstacles.shift();
    }

    const lastObs = this.obstacles[this.obstacles.length - 1];
    if (!lastObs || lastObs.x < this.width + 80) {
      const minGap = 310;
      const maxGap = 460;
      const gap = minGap + Math.random() * (maxGap - minGap);
      const base = lastObs ? lastObs.x + lastObs.width : this.width;
      this.spawnObstacle(Math.max(this.width + 20, base + gap));
    }

    // Ground decor & particles (only needed when not headless)
    if (!headless) {
      for (let i = 0; i < this.groundDots.length; i += 1) {
        const dot = this.groundDots[i];
        dot.x -= this.speed;
        if (dot.x + dot.w < 0) {
          dot.x = this.width + Math.random() * 40;
          dot.y = this.groundY + 8 + Math.random() * 24;
        }
      }

      for (let i = this.particles.length - 1; i >= 0; i -= 1) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        if (p.life <= 0) this.particles.splice(i, 1);
      }

      for (let i = this.floatingLabels.length - 1; i >= 0; i -= 1) {
        const lbl = this.floatingLabels[i];
        lbl.y -= 0.7;
        lbl.life -= 1;
        if (lbl.life <= 0) this.floatingLabels.splice(i, 1);
      }
    }

    // Apply Dino vertical physics
    let justLanded = false;
    if (!this.dino.isGrounded) {
      this.dino.y += this.dino.vy;
      this.dino.vy += this.gravity;
      if (this.dino.y >= this.groundY - this.dino.height) {
        this.dino.y = this.groundY - this.dino.height;
        this.dino.vy = 0;
        this.dino.isGrounded = true;
        justLanded = true;
        if (!headless) {
          this.spawnDust(this.dino.x + 12, this.groundY, 5);
        }
      }
    } else {
      this.dino.legFrame += 0.28;
    }

    // Check cleared obstacles
    for (let i = 0; i < this.obstacles.length; i += 1) {
      const obs = this.obstacles[i];
      if (!obs.cleared && obs.x + obs.width < this.dino.x) {
        obs.cleared = true;
        this.score += 1;
        if (this.pendingJump) {
          this.pendingJump.clearedObstacle = true;
        }
        if (!headless) {
          this.addFloatingLabel('+20.0', this.dino.x + 10, this.dino.y - 12, '#059669');
        }
      }
    }

    this.updatePerception();

    // Check collision first
    if (this.checkCollision()) {
      this.dino.dead = true;
      episodeEnded = true;

      if (this.mode === 'ai') {
        const activePending = this.pendingJump || this.pendingRun;
        if (activePending) {
          const updateRecord = this.agent.update(
            activePending.state,
            activePending.action,
            REWARDS.COLLISION,
            this.currentState,
            true
          );
          qUpdated = true;
          if (!headless && this.callbacks.onQUpdate) {
            this.callbacks.onQUpdate(updateRecord);
          }
        }
        this.agent.finishEpisode(this.score);
      } else {
        this.agent.episode += 1;
        if (this.score > this.agent.bestScore) {
          this.agent.bestScore = this.score;
        }
        this.agent.scoreHistory.push(this.score);
      }

      if (!headless) {
        this.addFloatingLabel('-100', this.dino.x + 12, this.dino.y - 14, '#DC2626');
        this.deathFreezeTicks = 18;
      } else {
        this.resetEpisode();
      }

      if (this.callbacks.onEpisodeEnd) {
        this.callbacks.onEpisodeEnd(this.score, headless);
      }
      return { qUpdated, episodeEnded };
    }

    // Resolve landing jump outcome
    if (justLanded && this.mode === 'ai' && this.pendingJump) {
      const reward = this.pendingJump.clearedObstacle
        ? REWARDS.CLEAR_CACTUS
        : REWARDS.WASTED_JUMP;

      if (!headless && !this.pendingJump.clearedObstacle) {
        this.addFloatingLabel('-20.0', this.dino.x + 10, this.dino.y - 12, '#D97706');
      }

      const updateRecord = this.agent.update(
        this.pendingJump.state,
        ACTION_JUMP,
        reward,
        this.currentState,
        false
      );
      this.pendingJump = null;
      qUpdated = true;
      if (!headless && this.callbacks.onQUpdate) {
        this.callbacks.onQUpdate(updateRecord);
      }
      // Make next ground decision immediately upon landing
      this.groundTicks = this.decisionCadence;
    }

    // Ground decision making
    if (this.dino.isGrounded) {
      if (this.mode === 'manual') {
        if (this.manualJumpQueued) {
          this.manualJumpQueued = false;
          this.dino.vy = this.jumpVelocity;
          this.dino.isGrounded = false;
          this.lastAction = ACTION_JUMP;
          this.lastWasExploration = false;
          if (!headless) this.spawnDust(this.dino.x + 10, this.groundY, 5);
        } else {
          this.lastAction = ACTION_RUN;
        }
      } else {
        this.groundTicks += 1;
        if (this.groundTicks >= this.decisionCadence) {
          this.groundTicks = 0;

          // Complete previous pending RUN action
          if (this.pendingRun) {
            const updateRecord = this.agent.update(
              this.pendingRun.state,
              ACTION_RUN,
              REWARDS.RUN_ALIVE,
              this.currentState,
              false
            );
            qUpdated = true;
            if (!headless && this.callbacks.onQUpdate) {
              this.callbacks.onQUpdate(updateRecord);
            }
          }

          // Choose next action in current state
          const choice = this.agent.chooseAction(this.currentState);
          this.lastAction = choice.action;
          this.lastWasExploration = choice.isExploration;

          if (choice.action === ACTION_JUMP) {
            this.pendingRun = null;
            this.pendingJump = {
              state: this.currentState,
              action: ACTION_JUMP,
              clearedObstacle: false,
            };
            this.dino.vy = this.jumpVelocity;
            this.dino.isGrounded = false;
            if (!headless) {
              this.spawnDust(this.dino.x + 10, this.groundY, 5);
            }
          } else {
            this.pendingRun = {
              state: this.currentState,
              action: ACTION_RUN,
            };
          }
        }
      }
    } else {
      this.manualJumpQueued = false;
    }

    return { qUpdated, episodeEnded };
  }

  runHeadlessEpisodes(count) {
    let completed = 0;
    let safety = 0;
    const maxTicks = count * 3500;
    while (completed < count && safety < maxTicks) {
      const res = this.tick(true);
      if (res.episodeEnded) {
        completed += 1;
      }
      safety += 1;
    }
  }

  render(ctx) {
    const w = this.width;
    const h = this.height;

    // Clear canvas with crisp off-white lab background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // Optional State Zones Overlay
    if (this.showSensors) {
      this.renderStateZones(ctx);
    }

    // Ground horizon line
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(w, this.groundY);
    ctx.stroke();

    // Ground texture pebbles
    ctx.fillStyle = '#CBD5E1';
    for (let i = 0; i < this.groundDots.length; i += 1) {
      const dot = this.groundDots[i];
      ctx.fillRect(dot.x, dot.y, dot.w, 2);
    }

    // Render obstacles (Cacti)
    for (let i = 0; i < this.obstacles.length; i += 1) {
      this.renderCactus(ctx, this.obstacles[i]);
    }

    // Render dust particles
    ctx.fillStyle = '#94A3B8';
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / 24);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Render Dino
    this.renderDino(ctx);

    // Sensor beam from Dino to next Cactus
    if (this.showSensors) {
      this.renderSensorBeam(ctx);
    }

    // Floating reward popups
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < this.floatingLabels.length; i += 1) {
      const lbl = this.floatingLabels[i];
      ctx.globalAlpha = Math.min(1, lbl.life / (lbl.maxLife * 0.5));
      ctx.fillStyle = lbl.color;
      ctx.fillText(lbl.text, lbl.x, lbl.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  renderStateZones(ctx) {
    const dinoRight = this.dino.x + this.dino.width;
    const activeStateObj = STATES[this.currentState];
    const zoneColors = [
      'rgba(220, 38, 38, 0.08)',  // Z0 Crítica
      'rgba(5, 150, 105, 0.08)',  // Z1 Curta
      'rgba(5, 150, 105, 0.06)',  // Z2 Ideal
      'rgba(2, 132, 199, 0.05)',  // Z3 Aproximação
      'rgba(100, 116, 139, 0.04)', // Z4 Distante
      'rgba(148, 163, 184, 0.02)', // Z5 Livre
    ];

    for (let i = 0; i < DISTANCE_ZONES.length; i += 1) {
      const z = DISTANCE_ZONES[i];
      const xStart = dinoRight + z.min;
      const xEnd = z.max === Infinity ? this.width : Math.min(this.width, dinoRight + z.max);
      if (xStart >= this.width) continue;

      const isActive = activeStateObj && activeStateObj.zoneIndex === i;
      ctx.fillStyle = isActive ? 'rgba(2, 132, 199, 0.12)' : zoneColors[i];
      ctx.fillRect(xStart, 22, xEnd - xStart, this.groundY - 22);

      // Vertical tick line
      ctx.strokeStyle = isActive ? 'rgba(2, 132, 199, 0.45)' : 'rgba(203, 213, 225, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xStart, 26);
      ctx.lineTo(xStart, this.groundY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Zone header label
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = isActive ? '#0369A1' : '#64748B';
      if (xEnd - xStart > 36) {
        ctx.fillText(z.id, xStart + 5, 36);
      }
    }
  }

  renderSensorBeam(ctx) {
    const next = this.getNextObstacle();
    const dinoRight = this.dino.x + this.dino.width;
    const beamY = this.dino.y + this.dino.height * 0.55;

    if (next && next.obs.x < this.width) {
      const targetX = Math.max(dinoRight, next.obs.x);
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(dinoRight, beamY);
      ctx.lineTo(targetX, beamY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Endpoint dot
      ctx.fillStyle = '#0284C7';
      ctx.beginPath();
      ctx.arc(targetX, beamY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Distance badge text cleanly above beam
      if (targetX - dinoRight > 34) {
        const midX = (dinoRight + targetX) / 2;
        ctx.font = '500 10.5px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0F172A';
        ctx.fillText(`${Math.round(next.distance)}px`, midX, beamY - 6);
        ctx.textAlign = 'left';
      }
    }

    // Active action callout above Dino
    const actionText = this.lastAction === ACTION_JUMP ? '↑ SALTAR' : '→ CORRER';
    const modeTag =
      this.mode === 'manual'
        ? 'Manual'
        : this.lastWasExploration
        ? 'Aleatório ε'
        : 'Política';

    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle =
      this.lastAction === ACTION_JUMP
        ? '#059669'
        : this.lastWasExploration
        ? '#D97706'
        : '#0284C7';
    ctx.fillText(`${actionText} (${modeTag})`, this.dino.x - 4, this.dino.y - 10);
  }

  renderDino(ctx) {
    const { x, y, width, height, isGrounded, legFrame, dead } = this.dino;
    const bodyColor = dead ? '#DC2626' : '#0F172A';

    ctx.fillStyle = bodyColor;

    // Tail
    ctx.fillRect(x, y + 18, 6, 10);
    ctx.fillRect(x - 4, y + 14, 5, 8);

    // Torso
    ctx.fillRect(x + 6, y + 14, 18, 18);

    // Head & snout
    ctx.fillRect(x + 14, y, 20, 14);
    ctx.fillRect(x + 22, y + 12, 10, 3); // lower jaw

    // Little arm
    ctx.fillRect(x + 24, y + 20, 6, 3);
    ctx.fillRect(x + 28, y + 20, 2, 6);

    // Eye
    ctx.fillStyle = '#FFFFFF';
    if (dead) {
      ctx.fillRect(x + 20, y + 4, 4, 4);
    } else {
      ctx.fillRect(x + 21, y + 4, 3, 3);
    }

    // Legs (animated running stride when grounded)
    ctx.fillStyle = bodyColor;
    if (!isGrounded || dead) {
      ctx.fillRect(x + 9, y + 32, 5, height - 32);
      ctx.fillRect(x + 18, y + 32, 5, height - 32);
    } else {
      const step = Math.floor(legFrame) % 2;
      if (step === 0) {
        ctx.fillRect(x + 9, y + 32, 5, height - 32);
        ctx.fillRect(x + 18, y + 32, 5, height - 36);
      } else {
        ctx.fillRect(x + 9, y + 32, 5, height - 36);
        ctx.fillRect(x + 18, y + 32, 5, height - 32);
      }
    }
  }

  renderCactus(ctx, obs) {
    const x = obs.x;
    const y = this.groundY - obs.height;
    const isWide = obs.typeIndex === 1;

    ctx.fillStyle = '#047857';

    if (!isWide) {
      // Single narrow cactus
      ctx.fillRect(x + 7, y, 8, obs.height);
      // Left arm
      ctx.fillRect(x, y + 10, 7, 5);
      ctx.fillRect(x, y + 4, 5, 11);
      // Right arm
      ctx.fillRect(x + 15, y + 14, 7, 5);
      ctx.fillRect(x + 17, y + 8, 5, 11);
    } else {
      // Double / wide cactus cluster
      // Stem 1
      ctx.fillRect(x + 6, y + 4, 8, obs.height - 4);
      ctx.fillRect(x, y + 14, 6, 5);
      ctx.fillRect(x, y + 8, 4, 10);
      // Stem 2
      ctx.fillRect(x + 26, y, 9, obs.height);
      ctx.fillRect(x + 19, y + 12, 7, 5);
      ctx.fillRect(x + 19, y + 6, 5, 10);
      ctx.fillRect(x + 35, y + 16, 11, 5);
      ctx.fillRect(x + 41, y + 8, 5, 12);
    }
  }
}
