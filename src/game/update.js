import { GAME_TIME_LIMIT, restartRun } from "./state";
import { clamp, distance, normalize } from "./utils";
import {
  updateSnakes,
  spawnSnake,
  resolveProjectileCollisions,
  updateEnemyProjectiles,
  resolveSnakeContacts,
  applyOrbitBladeDamage,
} from "./systems/enemySystem";
import { updateWaveAndSpawn } from "./systems/waveSystem";
import { updatePickups, spawnPickup } from "./systems/dropSystem";
import { acquireSkill, generateLevelupChoices, getSkillOptionPayload } from "./systems/skillSystem";
import { applyLoadout, getContractById, getDoctrineById } from "./systems/loadoutSystem";

function nearestSnake(run, x, y) {
  let target = null;
  let best = Infinity;
  for (const snake of run.snakes) {
    if (!snake.alive) {
      continue;
    }
    const dist = (snake.head.x - x) ** 2 + (snake.head.y - y) ** 2;
    if (dist < best) {
      best = dist;
      target = snake;
    }
  }
  return target;
}

function spawnPlayerProjectile(run, angle) {
  const player = run.player;
  const isCrit = Math.random() < player.critChance;
  let damage = player.damage;

  if (player.hp / player.maxHp <= 0.35) {
    damage *= 1 + player.lowHpDamageBoost;
  }

  if (player.adrenalineTimer > 0 && player.adrenalineLevel > 0) {
    damage *= 1 + player.adrenalineLevel * 0.12;
  }

  if (player.doctrineId === "ritual") {
    damage *= 1.14;
  }
  if (run.feedback.heat > 0.55) {
    damage *= 1 + (run.feedback.heat - 0.55) * 0.45;
  }

  if (isCrit) {
    damage *= player.critMult;
  }

  run.projectiles.push({
    id: run.wave.nextProjectileId++,
    x: player.x,
    y: player.y,
    prevX: player.x,
    prevY: player.y,
    vx: Math.cos(angle) * player.projectileSpeed,
    vy: Math.sin(angle) * player.projectileSpeed,
    r: player.projectileSize,
    life: player.projectileLifetime,
    age: 0,
    travelT: 1,
    damage,
    isCrit,
    pierceLeft: player.pierce,
    ricochetLeft: player.ricochet,
    burnDamage: player.burnDamage,
  });
}

function fireAutoWeapon(run, dt) {
  const player = run.player;
  player.fireCooldown -= dt;
  if (player.fireCooldown > 0) {
    return;
  }

  const target = nearestSnake(run, player.x, player.y);
  run.ui.targetSnakeId = target?.id ?? null;
  const baseAngle = target ? Math.atan2(target.head.y - player.y, target.head.x - player.x) : Math.atan2(run.input.moveY, run.input.moveX);
  const fallback = Number.isFinite(baseAngle) ? baseAngle : -Math.PI / 2;

  for (let i = 0; i < player.projectileCount; i += 1) {
    const spreadFactor = Math.max(0.05, player.spread * (1 - player.spreadControl));
    const offset = (i - (player.projectileCount - 1) / 2) * spreadFactor;
    spawnPlayerProjectile(run, fallback + offset);
  }

  if (player.doctrineId === "vanguard") {
    player.doctrineMeter = Math.min(1, player.doctrineMeter + 0.08);
    if (player.doctrineMeter >= 0.92 && target) {
      spawnPlayerProjectile(run, fallback);
      run.feedback.soundEvents.push({ type: "overdrive_start", priority: 3, intensity: 0.8 });
      player.doctrineMeter = 0.45;
    }
  } else if (player.doctrineId === "ritual" && target) {
    player.doctrineRitual += 1;
    if (player.doctrineRitual >= 8) {
      player.doctrineRitual = 0;
      target.head.hp -= player.damage * 2.4;
      for (const snake of run.snakes) {
        if (!snake.alive) {
          continue;
        }
        const dist = distance(target.head, snake.head);
        if (dist < 125) {
          snake.head.hp -= player.damage * 0.7;
        }
      }
      run.particles.push({
        x: target.head.x,
        y: target.head.y,
        ttl: 0.26,
        r: 120,
        color: "rgba(255,132,120,0.28)",
        ring: true,
      });
      run.feedback.soundEvents.push({ type: "pulse", priority: 3, intensity: 0.95 });
    }
  } else if (player.doctrineId === "phantom") {
    player.doctrineMeter = Math.min(1, player.doctrineMeter + 0.06);
  }

  const adrenalineRateBuff = player.adrenalineTimer > 0 ? 1 + player.adrenalineLevel * 0.16 : 1;
  const doctrineRateBuff = player.doctrineId === "vanguard" ? 1 + player.doctrineMeter * 0.4 : 1;
  const effectiveFireRate = player.fireRate * adrenalineRateBuff * doctrineRateBuff;
  player.fireCooldown = 1 / effectiveFireRate;
}

function updateProjectiles(run, dt) {
  const halfW = run.world.width * 0.75;
  const halfH = run.world.height * 0.75;
  const next = [];

  for (const projectile of run.projectiles) {
    projectile.life -= dt;
    projectile.age += dt;
    if (projectile.life <= 0) {
      continue;
    }
    projectile.prevX = projectile.x;
    projectile.prevY = projectile.y;

    if (run.player.boomerang > 0 && projectile.age > run.player.projectileLifetime * 0.55) {
      const dir = normalize(run.player.x - projectile.x, run.player.y - projectile.y);
      projectile.vx += dir.x * 620 * dt;
      projectile.vy += dir.y * 620 * dt;
    }

    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.travelT = 1;

    if (Math.abs(projectile.x) > halfW + 180 || Math.abs(projectile.y) > halfH + 180) {
      continue;
    }

    next.push(projectile);
  }

  run.projectiles = next;
}

function updatePlayerMovement(run, dt) {
  const player = run.player;
  const moveX = run.input.moveX;
  const moveY = run.input.moveY;

  if (player.invulnTimer > 0) {
    player.invulnTimer -= dt;
  }

  if (player.dashTimer > 0) {
    player.dashTimer -= dt;
  }

  const dashingTime = player.activeEffects.dashingTime ?? 0;
  if (dashingTime > 0) {
    player.activeEffects.dashingTime -= dt;
  }

  if (player.dashEnabled && run.input.wantDash && player.dashTimer <= 0) {
    player.dashTimer = player.dashCooldown;
    player.activeEffects.dashingTime = player.dashDuration;
    player.invulnTimer = Math.max(player.invulnTimer, 0.15);

    if (player.activeEffects.dashBurst) {
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI * 2 * i) / 10;
        run.projectiles.push({
          id: run.wave.nextProjectileId++,
          x: player.x,
          y: player.y,
          prevX: player.x,
          prevY: player.y,
          vx: Math.cos(angle) * player.projectileSpeed * 0.8,
          vy: Math.sin(angle) * player.projectileSpeed * 0.8,
          r: Math.max(5, player.projectileSize * 0.8),
          life: 0.55,
          age: 0,
          travelT: 1,
          damage: player.damage * 0.85,
          isCrit: false,
          pierceLeft: 0,
          ricochetLeft: 0,
          burnDamage: 0,
        });
      }
    }

    if (player.doctrineId === "phantom") {
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.3;
        run.projectiles.push({
          id: run.wave.nextProjectileId++,
          x: player.x,
          y: player.y,
          prevX: player.x,
          prevY: player.y,
          vx: Math.cos(angle) * player.projectileSpeed,
          vy: Math.sin(angle) * player.projectileSpeed,
          r: Math.max(4, player.projectileSize * 0.72),
          life: 0.48,
          age: 0,
          travelT: 1,
          damage: player.damage * 0.68,
          isCrit: Math.random() < player.critChance * 0.5,
          pierceLeft: 0,
          ricochetLeft: 0,
          burnDamage: player.burnDamage * 0.5,
        });
      }
    }
    run.feedback.soundEvents.push({ type: "dash", priority: 2, intensity: 0.85 });
  }

  run.input.wantDash = false;

  const speedMult = (player.activeEffects.dashingTime ?? 0) > 0 ? player.dashBoost : 1;
  const adrenalineSpeedBuff = player.adrenalineTimer > 0 ? 1 + player.adrenalineLevel * 0.11 : 1;
  player.vx = moveX * player.speed * speedMult * adrenalineSpeedBuff;
  player.vy = moveY * player.speed * speedMult * adrenalineSpeedBuff;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const boundX = run.world.width * 0.5 - 40;
  const boundY = run.world.height * 0.5 - 40;
  player.x = clamp(player.x, -boundX, boundX);
  player.y = clamp(player.y, -boundY, boundY);
}

function updateAuras(run, dt) {
  const player = run.player;

  if (player.adrenalineTimer > 0) {
    player.adrenalineTimer = Math.max(0, player.adrenalineTimer - dt);
  }
  if (player.doctrineId === "vanguard" && player.doctrineMeter > 0) {
    player.doctrineMeter = Math.max(0, player.doctrineMeter - dt * 0.12);
  }
  if (player.doctrineId === "phantom" && player.doctrineMeter > 0) {
    player.doctrineMeter = Math.max(0, player.doctrineMeter - dt * 0.18);
  }

  player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);

  if (player.shieldMax > 0 && run.time - run.wave.lastDamageAt > 1.2) {
    player.shield = Math.min(player.shieldMax, player.shield + player.shieldRegen * dt);
  }

  if (player.gravityPulse > 0) {
    player.gravityTimer -= dt;
    const interval = clamp(4 - player.gravityPulse * 0.6, 1.6, 4);
    if (player.gravityTimer <= 0) {
      player.gravityTimer = interval;
      for (const snake of run.snakes) {
        if (!snake.alive) {
          continue;
        }
        const dir = normalize(player.x - snake.head.x, player.y - snake.head.y);
        snake.head.x += dir.x * 34;
        snake.head.y += dir.y * 34;
      }
    }
  }

  if (player.shockwaveLevel > 0) {
    player.shockwaveTimer -= dt;
    const interval = clamp(3.5 - player.shockwaveLevel * 0.38, 1.8, 3.5);
    if (player.shockwaveTimer <= 0) {
      player.shockwaveTimer = interval;
      const radius = 130 + player.shockwaveLevel * 24;
      for (const snake of run.snakes) {
        if (!snake.alive) {
          continue;
        }
        if (distance(player, snake.head) <= radius) {
          snake.head.hp -= 16 + player.shockwaveLevel * 10;
        }
      }
      run.particles.push({
        x: player.x,
        y: player.y,
        ttl: 0.2,
        r: radius,
        color: "rgba(160,248,255,0.2)",
        ring: true,
      });
    }
  }

  if (player.orbitBlades > 0 && player.orbitDamage > 0) {
    player.orbitAngle += dt * (1.8 + player.orbitBlades * 0.24);
    player.orbitTickTimer -= dt;
    if (player.orbitTickTimer <= 0) {
      const bladePoints = [];
      const bladeCount = player.orbitBlades + 1;
      for (let i = 0; i < bladeCount; i += 1) {
        const angle = player.orbitAngle + (Math.PI * 2 * i) / bladeCount;
        bladePoints.push({
          x: player.x + Math.cos(angle) * player.orbitRadius,
          y: player.y + Math.sin(angle) * player.orbitRadius,
        });
      }
      applyOrbitBladeDamage(run, bladePoints, 28, player.orbitDamage);
      player.orbitTickTimer = clamp(0.24 - bladeCount * 0.02, 0.1, 0.24);
    }
  }
}

function openLevelupIfNeeded(run) {
  if (run.mode !== "playing") {
    return;
  }
  if ((run.levelup.pendingCount ?? 0) <= 0) {
    return;
  }

  const choices = generateLevelupChoices(run, 3);
  if (choices.length === 0) {
    run.levelup.pendingCount = 0;
    return;
  }

  run.mode = "levelup";
  run.levelup.pending = true;
  run.levelup.choices = choices;
}

function updateFx(run, dt) {
  const particles = [];
  for (const particle of run.particles) {
    particle.ttl -= dt;
    if (particle.ttl > 0) {
      particles.push(particle);
    }
  }
  run.particles = particles;

  const texts = [];
  for (const text of run.floatingTexts) {
    text.ttl -= dt;
    text.y -= 24 * dt;
    if (text.ttl > 0) {
      texts.push(text);
    }
  }
  run.floatingTexts = texts;

  if (run.feedback.hitStop > 0) {
    run.feedback.hitStop = Math.max(0, run.feedback.hitStop - dt);
  }
  if (run.feedback.shakeTime > 0) {
    run.feedback.shakeTime = Math.max(0, run.feedback.shakeTime - dt);
    if (run.feedback.shakeTime <= 0) {
      run.feedback.shakeMag = 0;
    }
  }
  if (run.feedback.playerFlash > 0) {
    run.feedback.playerFlash = Math.max(0, run.feedback.playerFlash - dt);
  }
  if (run.feedback.bossFlash > 0) {
    run.feedback.bossFlash = Math.max(0, run.feedback.bossFlash - dt);
  }
  if (run.feedback.killStreakTimer > 0) {
    run.feedback.killStreakTimer = Math.max(0, run.feedback.killStreakTimer - dt);
    if (run.feedback.killStreakTimer <= 0) {
      run.feedback.killStreak = 0;
    }
  }
  run.feedback.heat = Math.max(0, run.feedback.heat - dt * 0.08);
  const prevOverdrive = run.feedback.overdriveLevel;
  if (run.feedback.heat >= 0.86) {
    run.feedback.overdriveLevel = 2;
  } else if (run.feedback.heat >= 0.62) {
    run.feedback.overdriveLevel = 1;
  } else {
    run.feedback.overdriveLevel = 0;
  }
  if (run.feedback.overdriveLevel > prevOverdrive) {
    run.feedback.soundEvents.push({
      type: run.feedback.overdriveLevel === 2 ? "overdrive_peak" : "overdrive_start",
      priority: 4,
      intensity: 0.95,
    });
    run.floatingTexts.push({
      x: run.player.x,
      y: run.player.y - 46,
      text: run.feedback.overdriveLevel === 2 ? "极限过载" : "连杀升温",
      ttl: 0.9,
      color: run.feedback.overdriveLevel === 2 ? "#ffe39d" : "#9fe9ff",
    });
  }
}

export function applyLevelupChoice(run, skillId) {
  if (run.mode !== "levelup") {
    return false;
  }

  const ok = acquireSkill(run, skillId);
  if (!ok) {
    return false;
  }

  run.levelup.pendingCount = Math.max(0, (run.levelup.pendingCount ?? 1) - 1);
  run.levelup.pending = false;
  run.levelup.choices = [];
  run.mode = "playing";
  run.feedback.soundEvents.push({ type: "levelup", priority: 2, intensity: 0.75 });
  return true;
}

export function rerollLevelupChoices(run) {
  if (run.mode !== "levelup" || run.levelup.rerolls <= 0) {
    return false;
  }
  run.levelup.rerolls -= 1;
  run.levelup.choices = generateLevelupChoices(run, 3);
  return true;
}

export function updatePerformance(run, frameDt) {
  const fps = frameDt > 0 ? 1 / frameDt : 60;
  const quality = run.quality;
  quality.fpsSamples.push(fps);
  if (quality.fpsSamples.length > 90) {
    quality.fpsSamples.shift();
  }
  quality.avgFps = quality.fpsSamples.reduce((sum, value) => sum + value, 0) / quality.fpsSamples.length;

  quality.adjustCooldown -= frameDt;
  if (quality.adjustCooldown > 0) {
    return;
  }

  if (quality.avgFps < 44 && quality.level < 2) {
    quality.level += 1;
    quality.adjustCooldown = 2.2;
  } else if (quality.avgFps > 56 && quality.level > 0) {
    quality.level -= 1;
    quality.adjustCooldown = 3.8;
  }

  quality.label = quality.level === 0 ? "高" : quality.level === 1 ? "中" : "低";
}

export function beginRun(state) {
  restartRun(state, "playing");
  const run = state.run;
  applyLoadout(run, state.save);
  run.player.x = run.playerSpawn.x;
  run.player.y = run.playerSpawn.y;
  run.progression.xpToNext = Math.round(run.progression.xpToNext * run.modifiers.xpNeedMult);
  const doctrine = getDoctrineById(run.loadout.doctrineId);
  const contract = getContractById(run.loadout.contractId);
  run.ui.doctrineName = doctrine.name;
  run.ui.contractName = contract.name;
  run.feedback.soundEvents.push({ type: "run_start", priority: 4, intensity: 0.9 });

  for (let i = 0; i < run.runSeeds.startHealOrb; i += 1) {
    spawnPickup(run, "heal", run.player.x + 34 + i * 18, run.player.y, 18);
  }
}

export function updateGameState(state, dt) {
  const run = state.run;

  if (run.input.toggleFullscreen) {
    run.input.toggleFullscreen = false;
    run.ui.wantToggleFullscreen = true;
  }

  if (run.input.wantPause) {
    if (run.mode === "playing") {
      run.mode = "paused";
    } else if (run.mode === "paused") {
      run.mode = "playing";
    }
    run.input.wantPause = false;
  }

  if (run.input.wantConfirm) {
    if (run.mode === "levelup" && run.levelup.choices.length > 0) {
      applyLevelupChoice(run, run.levelup.choices[0]);
    } else if (run.mode === "paused") {
      run.mode = "playing";
    }
    run.input.wantConfirm = false;
  }

  if (run.input.levelupChoice !== null) {
    if (run.mode === "levelup") {
      const index = Math.max(0, Math.min(2, run.input.levelupChoice));
      const skillId = run.levelup.choices[index];
      if (skillId) {
        applyLevelupChoice(run, skillId);
      }
    }
    run.input.levelupChoice = null;
  }

  if (run.mode === "playing") {
    if (run.feedback.hitStop > 0) {
      updateFx(run, dt);
      return;
    }

    run.perf.collisionChecks = 0;
    run.perf.activeSegments = 0;
    run.time += dt;

    updatePlayerMovement(run, dt);
    fireAutoWeapon(run, dt);
    updateProjectiles(run, dt);

    updateWaveAndSpawn(run, dt, spawnSnake);
    updateSnakes(run, dt);
    resolveProjectileCollisions(run);
    resolveSnakeContacts(run);
    updateEnemyProjectiles(run, dt);
    updatePickups(run, dt);
    updateAuras(run, dt);

    if (run.player.activeEffects.xpStorm) {
      const overflowXp = run.progression.xp - run.progression.xpToNext;
      if (overflowXp > 0) {
        run.progression.xp = run.progression.xpToNext - 1;
        for (let i = 0; i < 4; i += 1) {
          spawnPickup(run, "xp", run.player.x + (Math.random() - 0.5) * 80, run.player.y + (Math.random() - 0.5) * 80, 1);
        }
      }
    }

    if (run.wave.finalBossSpawned && run.time > GAME_TIME_LIMIT + 60 && !run.bossKilled) {
      run.mode = "gameover";
    }

    if (run.bossKilled) {
      run.mode = "victory";
    }

    openLevelupIfNeeded(run);
  }

  updateFx(run, dt);
}

export function buildLevelupOptions(run) {
  return run.levelup.choices.map((id) => getSkillOptionPayload(run, id)).filter(Boolean);
}
