import { burstXp, spawnPickup } from "./dropSystem";
import { angleTo, clamp, distance, normalize, wrapAngle } from "../utils";

const HASH_CELL = 64;

function queueSound(run, type, priority = 1, intensity = 0.7) {
  run.feedback.soundEvents.push({ type, priority, intensity });
}

function pushShake(run, time, mag) {
  if (run.input.isMobile) {
    mag *= 0.5;
  }
  run.feedback.shakeTime = Math.max(run.feedback.shakeTime, time);
  run.feedback.shakeMag = Math.max(run.feedback.shakeMag, mag);
}

function segmentCircleHitT(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) {
    const inside = fx * fx + fy * fy <= radius * radius;
    return inside ? 0 : null;
  }

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }

  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);

  if (t1 >= 0 && t1 <= 1) {
    return t1;
  }
  if (t2 >= 0 && t2 <= 1) {
    return t2;
  }
  return null;
}

function getCollisionTier(level) {
  if (level <= 0) {
    return {
      segmentStride: 1,
      maxSegmentsPerSnake: 220,
      candidateBudget: 130,
    };
  }
  if (level === 1) {
    return {
      segmentStride: 2,
      maxSegmentsPerSnake: 140,
      candidateBudget: 82,
    };
  }
  return {
    segmentStride: 3,
    maxSegmentsPerSnake: 92,
    candidateBudget: 56,
  };
}

function createSegments(run, headX, headY, count, spacing, segmentHp) {
  const segments = [];
  for (let i = 0; i < count; i += 1) {
    segments.push({
      segmentId: run.wave.nextSegmentId++,
      x: headX - spacing * (i + 1),
      y: headY,
      r: Math.max(7, 13 - i * 0.03),
      hp: segmentHp,
      maxHp: segmentHp,
    });
  }
  return segments;
}

function registerCombatHit(run, snake, partIndex, hitT, isCrit = false, suppressFeedback = false) {
  run.feedback.lastHit = {
    hitTarget:
      partIndex < 0
        ? `${snake.id}:head`
        : `${snake.id}:seg-${snake.segments[partIndex]?.segmentId ?? "unknown"}`,
    hitType:
      snake.type === "boss" && partIndex < 0
        ? "boss_weak_hit"
        : partIndex < 0
          ? "head_hit"
          : "segment_hit",
    hitT: Number((hitT ?? 1).toFixed(3)),
  };

  if (suppressFeedback) {
    return;
  }

  let hitStop = 0.016;
  if (isCrit) {
    hitStop = 0.028;
  }
  if (snake.type === "boss" && partIndex < 0) {
    hitStop = 0.036;
  }
  run.feedback.hitStop = Math.max(run.feedback.hitStop, hitStop);

  if (snake.type === "boss" && partIndex < 0) {
    run.feedback.bossFlash = Math.max(run.feedback.bossFlash, 0.14);
    run.feedback.bossFlashPos.x = snake.head.x;
    run.feedback.bossFlashPos.y = snake.head.y;
    pushShake(run, 0.16, isCrit ? 8.5 : 6.4);
    queueSound(run, "boss_hit", 3, isCrit ? 1 : 0.85);
  } else {
    pushShake(run, 0.08, isCrit ? 4 : 2.8);
    queueSound(run, isCrit ? "crit" : "hit", 1, isCrit ? 0.95 : 0.72);
  }
}

export function spawnSnake(run, config) {
  const type = config.type ?? "normal";
  const isElite = type === "elite";
  const isBoss = type === "boss";
  const isTotem = type === "totem";

  const segmentSpacing = isBoss ? 24 : isTotem ? 0 : 20;
  const segmentHp = config.segmentHp ?? (isBoss ? 32 : isElite ? 20 : type === "rusher" ? 14 : isTotem ? 0 : 12);
  const baseHp = config.hp ?? (isTotem ? 95 : 30);
  const hpMult = isElite ? 1.8 : isBoss ? 9.8 : type === "rusher" ? 1.4 : 1;
  const armorBonus = run.modifiers.enemyArmorBonus ?? 0;

  const snake = {
    id: run.wave.nextSnakeId++,
    type,
    isFinalBoss: Boolean(config.isFinalBoss),
    affixes: Array.isArray(config.affixes) ? [...config.affixes] : [],
    anchorBossId: config.anchorBossId ?? null,
    orbitOffset: config.orbitOffset ?? 0,
    orbitRadius: config.orbitRadius ?? 120,
    alive: true,
    createdAt: run.time,
    head: {
      x: config.x,
      y: config.y,
      r: isBoss ? 28 : isElite ? 20 : isTotem ? 13 : 16,
      dir: angleTo({ x: config.x, y: config.y }, run.player),
      speed: config.speed ?? 90,
      hp: baseHp * hpMult,
      maxHp: baseHp * hpMult,
      armor: (isElite ? 0.1 : isBoss ? 0.18 : isTotem ? 0.12 : 0) + armorBonus,
      turnRate: isBoss ? 2.1 : isElite ? 2.7 : isTotem ? 0 : 3.3,
      dashCooldown: type === "rusher" ? 2.4 : isBoss ? 4.2 : 0,
      dashTimer: 0,
      dashTimeLeft: 0,
      phase: 1,
      spawnTimer: 0,
      ringTimer: 1.6,
      barrierTimer: 2.6,
      barrierActive: false,
      totemTimer: 5.8,
      chargeTimer: 4,
      chargeWindup: 0,
      chargeTimeLeft: 0,
      chargeDir: 0,
      lastTouch: -999,
    },
    segments: createSegments(run, config.x, config.y, isTotem ? 0 : config.segmentCount ?? 30, segmentSpacing, segmentHp),
    segmentSpacing,
    attackHead: isBoss ? 22 : isElite ? 16 : isTotem ? 4 : 10,
    attackBody: isBoss ? 13 : isElite ? 9 : isTotem ? 0 : 6,
    trail: [{ x: config.x, y: config.y }],
    burn: 0,
    burnTimer: 0,
    frozenTimer: 0,
  };

  run.snakes.push(snake);
}

function ringProjectiles(run, x, y, count = 14, speed = 220) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    run.enemyProjectiles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 6,
      life: 4.8,
      damage: 12,
    });
  }
}

function spawnBossMinions(run, snake) {
  const base = snake.head;
  const offsets = [
    { x: 160, y: 70 },
    { x: -180, y: 20 },
    { x: 90, y: -130 },
  ];
  for (const offset of offsets) {
    spawnSnake(run, {
      type: "normal",
      x: base.x + offset.x,
      y: base.y + offset.y,
      segmentCount: 24,
      segmentHp: 10,
      speed: 120,
      hp: 54,
    });
  }
}

function activeTotemsForBoss(run, bossId) {
  let count = 0;
  for (const snake of run.snakes) {
    if (!snake.alive || snake.type !== "totem" || snake.anchorBossId !== bossId) {
      continue;
    }
    count += 1;
  }
  return count;
}

function spawnBossTotems(run, snake) {
  const existing = activeTotemsForBoss(run, snake.id);
  if (existing >= 3) {
    return;
  }
  const count = 2 - Math.min(1, existing);
  for (let i = 0; i < count; i += 1) {
    const angle = snake.head.dir + i * Math.PI + Math.random() * 0.5;
    spawnSnake(run, {
      type: "totem",
      x: snake.head.x + Math.cos(angle) * 150,
      y: snake.head.y + Math.sin(angle) * 150,
      hp: 130 + snake.head.phase * 28,
      speed: 0,
      anchorBossId: snake.id,
      orbitOffset: angle,
      orbitRadius: 145 + Math.random() * 28,
    });
  }
}

function getHeadBurstCount(snake) {
  const segCount = snake.segments.length;
  if (snake.type === "boss") {
    return clamp(16 + Math.floor(segCount / 12), 18, 42);
  }
  if (snake.type === "totem") {
    return 6;
  }
  if (snake.type === "elite") {
    return clamp(8 + Math.floor(segCount / 16), 8, 24);
  }
  return clamp(4 + Math.floor(segCount / 20), 4, 14);
}

function killSnakeHead(run, snake) {
  snake.alive = false;

  const dropMult = run.modifiers.pickupDropMult ?? 1;
  const burstCount = Math.max(1, Math.round(getHeadBurstCount(snake) * dropMult));
  burstXp(run, snake.head.x, snake.head.y, burstCount, snake.type === "boss" ? 6 : snake.type === "elite" ? 3 : snake.type === "totem" ? 2 : 2);

  if (snake.type !== "boss" && snake.type !== "totem" && Math.random() < run.player.chestChance * dropMult) {
    spawnPickup(run, "chest", snake.head.x, snake.head.y, 1);
  }
  if (snake.type === "elite" || snake.type === "boss" || snake.type === "totem") {
    spawnPickup(run, "heal", snake.head.x + 12, snake.head.y - 10, 22);
  }

  if (snake.type === "boss" && snake.isFinalBoss) {
    run.bossKilled = true;
  }

  if (snake.type !== "totem") {
    run.kills += 1;
  }
  const scoreBase = snake.type === "boss" ? 1200 : snake.type === "elite" ? 190 : snake.type === "totem" ? 80 : 42;
  run.score += Math.round(scoreBase * (run.modifiers.scoreRewardMult ?? 1));

  if (run.feedback.killStreakTimer > 0) {
    run.feedback.killStreak += 1;
  } else {
    run.feedback.killStreak = 1;
  }
  run.feedback.killStreakTimer = 1.4;
  const heatGain = snake.type === "boss" ? 0.28 : snake.type === "elite" ? 0.13 : snake.type === "totem" ? 0.06 : 0.04;
  run.feedback.heat = Math.min(1, run.feedback.heat + heatGain);

  queueSound(run, "kill", 2, snake.type === "boss" ? 1 : 0.8);
  if (run.feedback.killStreak >= 3) {
    queueSound(run, "combo", 3, clamp(0.6 + run.feedback.killStreak * 0.08, 0.6, 1));
  }
  if (run.player.killPulseLevel > 0) {
    const pulseRadius = 118 + run.player.killPulseLevel * 34;
    const pulseDamage = 9 + run.player.killPulseLevel * 7;
    for (const target of run.snakes) {
      if (!target.alive || target.id === snake.id) {
        continue;
      }
      if (distance(snake.head, target.head) > pulseRadius) {
        continue;
      }
      damageSnakePart(run, target, -1, pulseDamage, { suppressFeedback: true });
    }
    run.particles.push({
      x: snake.head.x,
      y: snake.head.y,
      ttl: 0.22,
      r: pulseRadius,
      color: "rgba(145,235,255,0.25)",
      ring: true,
    });
    queueSound(run, "pulse", 3, 0.75 + run.player.killPulseLevel * 0.12);
  }
  if (snake.type === "totem") {
    run.floatingTexts.push({
      x: snake.head.x,
      y: snake.head.y - 18,
      text: "支柱摧毁",
      ttl: 0.7,
      color: "#9de5ff",
    });
    queueSound(run, "boss_break", 3, 0.8);
  }
}

function damageSnakePart(run, snake, partIndex, damage, meta = {}) {
  if (!snake.alive) {
    return false;
  }

  let finalDamage = damage;
  if (snake.type === "boss") {
    if (snake.affixes.includes("barrier") && snake.head.barrierActive) {
      finalDamage *= 0.22;
      if (!meta.suppressFeedback && run.time - (snake.head.lastBarrierHintAt ?? -999) > 0.35) {
        snake.head.lastBarrierHintAt = run.time;
        run.floatingTexts.push({
          x: snake.head.x,
          y: snake.head.y - 34,
          text: "护盾吸收",
          ttl: 0.35,
          color: "#9dd8ff",
        });
      }
    }

    if (snake.affixes.includes("totem")) {
      const totemCount = activeTotemsForBoss(run, snake.id);
      if (totemCount > 0) {
        finalDamage *= 1 / (1 + totemCount * 0.36);
      }
    }
  }

  if (partIndex < 0) {
    snake.head.hp -= finalDamage;
    snake.head.hp = Number(snake.head.hp.toFixed(3));
    if (snake.head.hp > 0 && run.player.executeThreshold > 0) {
      const executeThreshold = snake.type === "boss" ? run.player.executeThreshold * 0.45 : run.player.executeThreshold;
      if (snake.head.hp <= snake.head.maxHp * executeThreshold) {
        snake.head.hp = 0;
        run.floatingTexts.push({
          x: snake.head.x,
          y: snake.head.y - 20,
          text: "处决",
          ttl: 0.5,
          color: "#ffe9a2",
        });
      }
    }
    registerCombatHit(run, snake, partIndex, meta.hitT, meta.isCrit, meta.suppressFeedback);
    if (snake.head.hp <= 0) {
      killSnakeHead(run, snake);
      return true;
    }
    return false;
  }

  const segment = snake.segments[partIndex];
  if (!segment) {
    return false;
  }

  segment.hp -= finalDamage;
  if (segment.hp > 0 && run.player.executeThreshold > 0) {
    const executeThreshold = snake.type === "boss" ? run.player.executeThreshold * 0.4 : run.player.executeThreshold;
    if (segment.hp <= segment.maxHp * executeThreshold) {
      segment.hp = 0;
    }
  }
  registerCombatHit(run, snake, partIndex, meta.hitT, meta.isCrit, meta.suppressFeedback);
  if (segment.hp <= 0) {
    const removed = snake.segments.splice(partIndex, 1)[0];
    if (removed) {
      const dropChance = (snake.type === "boss" ? 0.65 : snake.type === "elite" ? 0.45 : 0.28) * (run.modifiers.pickupDropMult ?? 1);
      if (Math.random() < dropChance) {
        burstXp(run, removed.x, removed.y, 1, 1);
      }
    }
    run.score += Math.round(8 * (run.modifiers.scoreRewardMult ?? 1));
  }
  return false;
}

function applyDamageToPlayer(run, amount, sourceSnake = null) {
  const player = run.player;
  if (player.invulnTimer > 0 || run.mode !== "playing") {
    return;
  }

  if (Math.random() < player.dodgeChance) {
    run.floatingTexts.push({
      x: player.x,
      y: player.y - 20,
      text: "闪避",
      ttl: 0.6,
      color: "#b3f4ff",
    });
    player.invulnTimer = 0.15;
    return;
  }

  const reduced = amount * (1 - player.damageReduction);
  let remaining = reduced;

  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, remaining);
    player.shield -= absorbed;
    remaining -= absorbed;
  }

  if (remaining > 0) {
    player.hp -= remaining;
  }

  player.invulnTimer = 0.22;
  run.wave.lastDamageAt = run.time;
  run.feedback.playerFlash = Math.max(run.feedback.playerFlash, 0.16);
  pushShake(run, 0.12, 5.5);
  queueSound(run, "player_hurt", 3, 0.9);

  run.floatingTexts.push({
    x: player.x,
    y: player.y - 24,
    text: `-${Math.round(reduced)}`,
    ttl: 0.8,
    color: "#ff8d8d",
  });

  if (player.adrenalineLevel > 0) {
    player.adrenalineTimer = Math.max(player.adrenalineTimer, 1.6 + player.adrenalineLevel * 0.45);
    queueSound(run, "adrenaline", 2, 0.6 + player.adrenalineLevel * 0.12);
  }

  if (sourceSnake && player.thorns > 0) {
    damageSnakePart(run, sourceSnake, -1, player.thorns, { suppressFeedback: true });
  }

  if (player.activeEffects.thornShield) {
    for (const snake of run.snakes) {
      if (!snake.alive) {
        continue;
      }
      const dist = distance(player, snake.head);
      if (dist < 140) {
        damageSnakePart(run, snake, -1, 7, { suppressFeedback: true });
      }
    }
  }

  if (player.hp <= 0 && player.reviveCharges > 0) {
    player.reviveCharges -= 1;
    player.hp = Math.round(player.maxHp * 0.5);
    player.shield = player.shieldMax;
    player.invulnTimer = 2;
    run.floatingTexts.push({
      x: player.x,
      y: player.y - 32,
      text: "不灭意志触发",
      ttl: 1.6,
      color: "#ffe88f",
    });
    queueSound(run, "revive", 4, 1);
    return;
  }

  if (player.hp <= 0) {
    run.player.hp = 0;
    run.mode = "gameover";
  }
}

export function applyOrbitBladeDamage(run, bladePoints, bladeRadius, damage) {
  if (!Array.isArray(bladePoints) || bladePoints.length === 0 || damage <= 0) {
    return;
  }

  for (const blade of bladePoints) {
    let targetSnake = null;
    let targetPartIndex = -1;
    let best = bladeRadius * bladeRadius;

    for (const snake of run.snakes) {
      if (!snake.alive) {
        continue;
      }

      const headDx = snake.head.x - blade.x;
      const headDy = snake.head.y - blade.y;
      const headDistSq = headDx * headDx + headDy * headDy;
      if (headDistSq < best) {
        best = headDistSq;
        targetSnake = snake;
        targetPartIndex = -1;
      }

      for (let i = 0; i < snake.segments.length; i += 2) {
        const segment = snake.segments[i];
        const segDx = segment.x - blade.x;
        const segDy = segment.y - blade.y;
        const segDistSq = segDx * segDx + segDy * segDy;
        if (segDistSq < best) {
          best = segDistSq;
          targetSnake = snake;
          targetPartIndex = i;
        }
      }
    }

    if (targetSnake) {
      damageSnakePart(run, targetSnake, targetPartIndex, damage, { suppressFeedback: true });
      run.particles.push({
        x: blade.x,
        y: blade.y,
        ttl: 0.12,
        r: 8,
        color: "rgba(139,255,244,0.42)",
      });
      queueSound(run, "orbit_hit", 1, 0.45);
    }
  }
}

function updateBossBehavior(run, snake, dt) {
  const head = snake.head;
  const prevPhase = head.phase;
  const hpRatio = head.hp / head.maxHp;
  if (hpRatio <= 0.33) {
    head.phase = 3;
  } else if (hpRatio <= 0.66) {
    head.phase = 2;
  } else {
    head.phase = 1;
  }

  if (head.phase !== prevPhase) {
    queueSound(run, "boss_phase", 4, 1);
    pushShake(run, 0.2, 8);
  }

  if (head.phase >= 2) {
    head.spawnTimer -= dt;
    if (head.spawnTimer <= 0) {
      spawnBossMinions(run, snake);
      head.spawnTimer = 7.5;
    }
  }

  if (head.phase === 3) {
    head.ringTimer -= dt;
    if (head.ringTimer <= 0) {
      ringProjectiles(run, head.x, head.y, 16, 250);
      head.ringTimer = 2.2;
    }
  }

  if (snake.affixes.includes("barrier")) {
    head.barrierTimer -= dt;
    if (head.barrierTimer <= 0) {
      head.barrierActive = !head.barrierActive;
      head.barrierTimer = head.barrierActive ? clamp(2.8 - head.phase * 0.3, 1.8, 2.8) : clamp(2.6 - head.phase * 0.2, 1.6, 2.6);
      queueSound(run, head.barrierActive ? "boss_phase" : "boss_break", 4, 0.82);
    }
  } else {
    head.barrierActive = false;
  }

  if (snake.affixes.includes("totem")) {
    head.totemTimer -= dt;
    if (head.totemTimer <= 0) {
      spawnBossTotems(run, snake);
      head.totemTimer = clamp(8.6 - head.phase * 0.8, 5.4, 8.6);
      queueSound(run, "boss_phase", 3, 0.7);
    }
  }

  if (snake.affixes.includes("charge")) {
    if (head.chargeTimeLeft > 0) {
      head.chargeTimeLeft -= dt;
    } else if (head.chargeWindup > 0) {
      head.chargeWindup -= dt;
      if (head.chargeWindup <= 0) {
        head.chargeTimeLeft = 0.5;
        queueSound(run, "boss_spawn", 4, 0.62);
      }
    } else {
      head.chargeTimer -= dt;
      if (head.chargeTimer <= 0) {
        head.chargeTimer = clamp(5.2 - head.phase * 0.7, 3, 5.2);
        head.chargeWindup = 0.75;
        head.chargeDir = angleTo(head, run.player);
        queueSound(run, "boss_phase", 4, 0.85);
      }
    }
  } else {
    head.chargeTimer = 0;
    head.chargeWindup = 0;
    head.chargeTimeLeft = 0;
  }
}

function updateSnakeMovement(run, snake, dt) {
  if (snake.type === "totem") {
    const boss = run.snakes.find((item) => item.alive && item.id === snake.anchorBossId);
    if (!boss) {
      snake.alive = false;
      return;
    }
    snake.orbitOffset += dt * 0.85;
    snake.head.x = boss.head.x + Math.cos(snake.orbitOffset) * snake.orbitRadius;
    snake.head.y = boss.head.y + Math.sin(snake.orbitOffset) * snake.orbitRadius;
    snake.head.dir = angleTo(snake.head, run.player);
    snake.trail[0] = { x: snake.head.x, y: snake.head.y };
    return;
  }

  const player = run.player;
  const head = snake.head;
  if (snake.type === "boss") {
    updateBossBehavior(run, snake, dt);
  }

  const toPlayerAngle = head.chargeTimeLeft > 0 ? head.chargeDir : angleTo(head, player);
  let maxTurn = head.turnRate;

  if (snake.frozenTimer > 0) {
    maxTurn *= 0.48;
  }
  if (snake.type === "boss" && head.chargeWindup > 0) {
    maxTurn *= 0.22;
  }

  const delta = wrapAngle(toPlayerAngle - head.dir);
  const turnAmount = clamp(delta, -maxTurn * dt, maxTurn * dt);
  head.dir += turnAmount;

  let speedMultiplier = 1;

  if (snake.type === "rusher" || snake.type === "elite" || snake.type === "boss") {
    head.dashTimer -= dt;
    if (head.dashTimer <= 0) {
      head.dashTimeLeft = snake.type === "boss" ? 0.65 : 0.33;
      head.dashTimer = head.dashCooldown;
    }
    if (head.dashTimeLeft > 0) {
      head.dashTimeLeft -= dt;
      speedMultiplier *= snake.type === "boss" ? 1.9 : 2.1;
    }
  }
  if (snake.type === "boss" && head.chargeWindup > 0) {
    speedMultiplier *= 0.25;
  }
  if (snake.type === "boss" && head.chargeTimeLeft > 0) {
    head.dir = head.chargeDir;
    speedMultiplier *= 3.4;
  }

  if (player.frostAura > 0) {
    const dist = distance(player, head);
    if (dist < player.frostAura + 40) {
      speedMultiplier *= 0.68;
      snake.frozenTimer = Math.max(snake.frozenTimer, 0.12);
    }
  }

  if (snake.frozenTimer > 0) {
    snake.frozenTimer -= dt;
  }

  const speed = head.speed * speedMultiplier;
  head.x += Math.cos(head.dir) * speed * dt;
  head.y += Math.sin(head.dir) * speed * dt;

  const boundX = run.world.width * 0.65;
  const boundY = run.world.height * 0.65;
  head.x = clamp(head.x, -boundX, boundX);
  head.y = clamp(head.y, -boundY, boundY);

  snake.trail.unshift({ x: head.x, y: head.y });
  const maxTrail = Math.max(300, snake.segments.length * 12);
  if (snake.trail.length > maxTrail) {
    snake.trail.length = maxTrail;
  }

  let traveled = 0;
  let trailIndex = 1;
  let targetDistance = snake.segmentSpacing;

  for (let i = 0; i < snake.segments.length; i += 1) {
    while (trailIndex < snake.trail.length) {
      const prev = snake.trail[trailIndex - 1];
      const cur = snake.trail[trailIndex];
      const dx = prev.x - cur.x;
      const dy = prev.y - cur.y;
      const step = Math.sqrt(dx * dx + dy * dy);
      if (traveled + step >= targetDistance) {
        break;
      }
      traveled += step;
      trailIndex += 1;
    }

    const sampled = snake.trail[Math.min(trailIndex, snake.trail.length - 1)];
    snake.segments[i].x = sampled.x;
    snake.segments[i].y = sampled.y;
    targetDistance += snake.segmentSpacing;
  }
}

function tryTouchPlayer(run, snake) {
  const player = run.player;
  const now = run.time;
  if (now - snake.head.lastTouch < 0.25) {
    return;
  }

  const hitHead = distance(player, snake.head) < player.r + snake.head.r;
  if (hitHead) {
    snake.head.lastTouch = now;
    applyDamageToPlayer(run, snake.attackHead, snake);
    return;
  }

  for (const segment of snake.segments) {
    if (distance(player, segment) < player.r + segment.r) {
      snake.head.lastTouch = now;
      applyDamageToPlayer(run, snake.attackBody, snake);
      return;
    }
  }
}

export function resolveSnakeContacts(run) {
  for (const snake of run.snakes) {
    if (!snake.alive) {
      continue;
    }
    tryTouchPlayer(run, snake);
  }
}

export function updateEnemyProjectiles(run, dt) {
  const remaining = [];
  for (const shot of run.enemyProjectiles) {
    shot.life -= dt;
    if (shot.life <= 0) {
      continue;
    }
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    const hitPlayer = distance(run.player, shot) < run.player.r + shot.r;
    if (hitPlayer) {
      applyDamageToPlayer(run, shot.damage, null);
      continue;
    }

    remaining.push(shot);
  }
  run.enemyProjectiles = remaining;
}

function maybeApplyBurn(snake, projectile) {
  if (!projectile.burnDamage) {
    return;
  }
  snake.burn = Math.max(snake.burn, projectile.burnDamage);
  snake.burnTimer = 2.5;
}

function dealChainDamage(run, sourceSnake, damage) {
  if (run.player.chainChance <= 0) {
    return;
  }
  if (Math.random() > run.player.chainChance) {
    return;
  }

  for (const snake of run.snakes) {
    if (!snake.alive || snake.id === sourceSnake.id) {
      continue;
    }
    const dist = distance(sourceSnake.head, snake.head);
    if (dist < 140) {
      damageSnakePart(run, snake, -1, damage * 0.65, { suppressFeedback: true });
      run.particles.push({
        x: snake.head.x,
        y: snake.head.y,
        ttl: 0.16,
        r: 14,
        color: "rgba(138,246,255,0.6)",
      });
      break;
    }
  }
}

function findNearestSnake(run, x, y, skipId) {
  let best = null;
  let bestDist = Infinity;
  for (const snake of run.snakes) {
    if (!snake.alive || snake.id === skipId) {
      continue;
    }
    const dist = (snake.head.x - x) ** 2 + (snake.head.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = snake;
    }
  }
  return best;
}

function gridKey(cellX, cellY) {
  return `${cellX}:${cellY}`;
}

function insertGridEntry(grid, entry, x, y, r) {
  const minX = Math.floor((x - r) / HASH_CELL);
  const maxX = Math.floor((x + r) / HASH_CELL);
  const minY = Math.floor((y - r) / HASH_CELL);
  const maxY = Math.floor((y + r) / HASH_CELL);

  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const key = gridKey(cx, cy);
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key).push(entry);
    }
  }
}

function buildCollisionGrid(run) {
  const tier = getCollisionTier(run.quality.level);
  const grid = new Map();
  let activeSegments = 0;

  for (const snake of run.snakes) {
    if (!snake.alive) {
      continue;
    }

    insertGridEntry(
      grid,
      {
        snake,
        partIndex: -1,
        x: snake.head.x,
        y: snake.head.y,
        r: snake.head.r,
      },
      snake.head.x,
      snake.head.y,
      snake.head.r,
    );
    activeSegments += 1;

    const distToPlayer = distance(run.player, snake.head);
    const farPenalty = run.quality.level >= 2 && distToPlayer > 780 ? 2 : 1;
    const stride = tier.segmentStride * farPenalty;

    let sampled = 0;
    for (let i = 0; i < snake.segments.length; i += stride) {
      if (sampled >= tier.maxSegmentsPerSnake) {
        break;
      }
      const segment = snake.segments[i];
      insertGridEntry(
        grid,
        {
          snake,
          partIndex: i,
          x: segment.x,
          y: segment.y,
          r: segment.r,
        },
        segment.x,
        segment.y,
        segment.r,
      );
      sampled += 1;
      activeSegments += 1;
    }
  }

  run.perf.activeSegments = activeSegments;
  return { grid, tier };
}

function queryCollisionCandidates(grid, ax, ay, bx, by, pad) {
  const minX = Math.floor((Math.min(ax, bx) - pad) / HASH_CELL);
  const maxX = Math.floor((Math.max(ax, bx) + pad) / HASH_CELL);
  const minY = Math.floor((Math.min(ay, by) - pad) / HASH_CELL);
  const maxY = Math.floor((Math.max(ay, by) + pad) / HASH_CELL);

  const result = [];
  const seen = new Set();

  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const entries = grid.get(gridKey(cx, cy));
      if (!entries) {
        continue;
      }
      for (const entry of entries) {
        const dedupeId = `${entry.snake.id}:${entry.partIndex}`;
        if (seen.has(dedupeId)) {
          continue;
        }
        seen.add(dedupeId);
        result.push(entry);
      }
    }
  }

  return result;
}

function findClosestCollision(run, projectile, grid, tier) {
  const ax = projectile.prevX ?? projectile.x;
  const ay = projectile.prevY ?? projectile.y;
  const bx = projectile.x;
  const by = projectile.y;
  const candidates = queryCollisionCandidates(grid, ax, ay, bx, by, projectile.r + 30);

  let closest = null;
  let checks = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    if (checks >= tier.candidateBudget) {
      break;
    }

    const candidate = candidates[i];
    const hitRadius = projectile.r + candidate.r;
    const t = segmentCircleHitT(ax, ay, bx, by, candidate.x, candidate.y, hitRadius);
    checks += 1;
    if (t === null) {
      continue;
    }

    if (!closest || t < closest.t) {
      closest = {
        snake: candidate.snake,
        partIndex: candidate.partIndex,
        t,
        hitX: ax + (bx - ax) * t,
        hitY: ay + (by - ay) * t,
      };
    }
  }

  run.perf.collisionChecks += checks;
  return closest;
}

export function resolveProjectileCollisions(run) {
  const { grid, tier } = buildCollisionGrid(run);
  const remainingProjectiles = [];

  for (const projectile of run.projectiles) {
    let consumed = false;
    const collision = findClosestCollision(run, projectile, grid, tier);

    if (!collision || !collision.snake.alive) {
      remainingProjectiles.push(projectile);
      continue;
    }

    projectile.travelT = collision.t;
    projectile.x = collision.hitX;
    projectile.y = collision.hitY;

    const snake = collision.snake;
    const bossMod = snake.type === "boss" ? 1 + run.player.vsBossMult : 1;
    const armorMod = 1 - snake.head.armor + run.player.armorBreak;
    const damage = Math.max(1, projectile.damage * bossMod * clamp(armorMod, 0.2, 1.8));

    const wasKilled = damageSnakePart(run, snake, collision.partIndex, damage, {
      hitT: collision.t,
      isCrit: Boolean(projectile.isCrit),
    });

    maybeApplyBurn(snake, projectile);
    dealChainDamage(run, snake, damage * 0.7);

    if (Math.random() < run.player.lifesteal) {
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + damage * 0.1);
    }

    projectile.pierceLeft -= 1;

    if (projectile.pierceLeft < 0) {
      if (projectile.ricochetLeft > 0) {
        const target = findNearestSnake(run, projectile.x, projectile.y, snake.id);
        if (target) {
          const dir = normalize(target.head.x - projectile.x, target.head.y - projectile.y);
          projectile.vx = dir.x * run.player.projectileSpeed;
          projectile.vy = dir.y * run.player.projectileSpeed;
          projectile.pierceLeft = 0;
          projectile.ricochetLeft -= 1;
          projectile.prevX = projectile.x;
          projectile.prevY = projectile.y;
        } else {
          consumed = true;
        }
      } else {
        consumed = true;
      }
    }

    if (run.player.activeEffects.spiralTrail && !wasKilled) {
      run.particles.push({
        x: projectile.x,
        y: projectile.y,
        ttl: 0.15,
        r: 10,
        color: "rgba(127,247,255,0.55)",
      });
    }

    if (!consumed) {
      const dir = normalize(projectile.vx, projectile.vy);
      projectile.x += dir.x * 0.6;
      projectile.y += dir.y * 0.6;
      remainingProjectiles.push(projectile);
    }
  }

  run.projectiles = remainingProjectiles;
  run.snakes = run.snakes.filter((snake) => snake.alive);
}

export function updateSnakes(run, dt) {
  for (const snake of run.snakes) {
    if (!snake.alive) {
      continue;
    }

    if (snake.burnTimer > 0 && snake.burn > 0) {
      snake.burnTimer -= dt;
      snake.head.hp -= snake.burn * dt;
      if (snake.head.hp <= 0) {
        killSnakeHead(run, snake);
        continue;
      }
    }

    updateSnakeMovement(run, snake, dt);
  }

  run.snakes = run.snakes.filter((snake) => snake.alive);
}
