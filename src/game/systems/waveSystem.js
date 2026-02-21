import { GAME_TIME_LIMIT } from "../state";
import { clamp, randRange } from "../utils";

function difficultyAt(time) {
  if (time < 120) {
    return 0.75 + time / 220;
  }
  if (time < 480) {
    return 1.25 + (time - 120) / 220;
  }
  if (time < 630) {
    return 2.85 + (time - 480) / 110;
  }
  return 4.2 + (time - 630) / 75;
}

function segmentCountAt(time, kind = "normal") {
  if (kind === "elite") {
    return Math.min(110, 80 + Math.floor(Math.max(0, time - 120) / 24));
  }
  if (kind === "rusher") {
    return Math.min(60, 38 + Math.floor(Math.max(0, time - 300) / 28));
  }
  if (kind === "boss") {
    return Math.min(180, 120 + Math.floor(Math.max(0, time) / 48));
  }
  return Math.min(40, 20 + Math.floor(time / 26));
}

function speedAt(time, elite = false) {
  const base = 70 + time * 0.22;
  return elite ? base * 1.32 : base;
}

function bossAffixesAt(minute, isFinalBoss) {
  if (isFinalBoss) {
    return ["barrier", "totem", "charge"];
  }
  const order = ["barrier", "totem", "charge"];
  return [order[(Math.max(1, minute) - 1) % order.length]];
}

function edgeSpawn(run) {
  const margin = 120;
  const halfW = run.world.width * 0.5;
  const halfH = run.world.height * 0.5;
  const roll = Math.random();

  if (roll < 0.25) {
    return { x: randRange(-halfW, halfW), y: -halfH - margin };
  }
  if (roll < 0.5) {
    return { x: randRange(-halfW, halfW), y: halfH + margin };
  }
  if (roll < 0.75) {
    return { x: -halfW - margin, y: randRange(-halfH, halfH) };
  }

  return { x: halfW + margin, y: randRange(-halfH, halfH) };
}

function countByType(snakes) {
  const counts = {
    normal: 0,
    elite: 0,
    rusher: 0,
    boss: 0,
  };
  for (const snake of snakes) {
    if (!snake.alive) {
      continue;
    }
    if (snake.type === "elite") {
      counts.elite += 1;
    } else if (snake.type === "rusher") {
      counts.rusher += 1;
    } else if (snake.type === "boss") {
      counts.boss += 1;
    } else if (snake.type === "totem") {
      // Boss mechanic entity, not part of wave population cap.
      continue;
    } else {
      counts.normal += 1;
    }
  }
  return counts;
}

function capsByQuality(level) {
  if (level <= 0) {
    return { normal: 5, elite: 2, rusher: 1, boss: 1 };
  }
  if (level === 1) {
    return { normal: 4, elite: 1, rusher: 1, boss: 1 };
  }
  return { normal: 3, elite: 1, rusher: 0, boss: 1 };
}

export function updateWaveAndSpawn(run, dt, spawnSnake) {
  if (run.mode !== "playing") {
    return;
  }

  const difficulty = difficultyAt(run.time);
  run.wave.spawnTimer -= dt;
  run.wave.eliteTimer -= dt;
  run.wave.specialTimer -= dt;

  const caps = capsByQuality(run.quality.level);
  const counts = countByType(run.snakes);
  const enemySpeedMult = run.modifiers.enemySpeedMult ?? 1;
  const enemyHpMult = run.modifiers.enemyHpMult ?? 1;

  const baseInterval = clamp(1.25 - difficulty * 0.09, 0.62, 1.25);

  if (run.wave.spawnTimer <= 0) {
    if (counts.normal < caps.normal) {
      const count = difficulty > 3.5 && counts.normal <= caps.normal - 2 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        if (counts.normal >= caps.normal) {
          break;
        }
        const point = edgeSpawn(run);
        spawnSnake(run, {
          type: "normal",
          x: point.x,
          y: point.y,
          segmentCount: segmentCountAt(run.time, "normal"),
          segmentHp: (9 + difficulty * 0.9) * enemyHpMult,
          speed: speedAt(run.time, false) * enemySpeedMult,
          hp: (20 + difficulty * 8) * enemyHpMult,
        });
        counts.normal += 1;
      }
    }
    run.wave.spawnTimer = baseInterval;
  }

  if (run.time >= 120 && run.wave.eliteTimer <= 0 && counts.elite < caps.elite) {
    const point = edgeSpawn(run);
    spawnSnake(run, {
      type: "elite",
      x: point.x,
      y: point.y,
      segmentCount: segmentCountAt(run.time, "elite"),
      segmentHp: (16 + difficulty * 1.45) * enemyHpMult,
      speed: speedAt(run.time, true) * enemySpeedMult,
      hp: (90 + difficulty * 20) * enemyHpMult,
    });
    run.wave.eliteTimer = clamp(26 - difficulty * 1.2, 11, 26);
  }

  if (run.time >= 480 && run.wave.specialTimer <= 0 && counts.rusher < caps.rusher) {
    const point = edgeSpawn(run);
    spawnSnake(run, {
      type: "rusher",
      x: point.x,
      y: point.y,
      segmentCount: segmentCountAt(run.time, "rusher"),
      segmentHp: (11 + difficulty * 1.2) * enemyHpMult,
      speed: speedAt(run.time, true) * 1.15 * enemySpeedMult,
      hp: (68 + difficulty * 12) * enemyHpMult,
    });
    run.wave.specialTimer = 14;
  }

  const nextBossMinute = run.wave.lastBossMinute + 1;
  const shouldSpawnMinuteBoss = nextBossMinute >= 1 && run.time >= nextBossMinute * 60 && !run.wave.finalBossSpawned;
  if (shouldSpawnMinuteBoss && counts.boss < caps.boss) {
    const minuteScale = nextBossMinute;
    const isFinalBoss = nextBossMinute * 60 >= GAME_TIME_LIMIT;
    const bossHp = (420 + minuteScale * 210) * enemyHpMult;
    const bossSegmentHp = (20 + minuteScale * 2.2) * enemyHpMult;
    const bossSpeed = (108 + minuteScale * 4.5) * enemySpeedMult;
    const affixes = bossAffixesAt(nextBossMinute, isFinalBoss);

    run.wave.lastBossMinute = nextBossMinute;
    run.wave.finalBossSpawned = isFinalBoss;
    spawnSnake(run, {
      type: "boss",
      x: run.player.x + 420,
      y: run.player.y,
      segmentCount: segmentCountAt(run.time + minuteScale * 18, "boss"),
      segmentHp: bossSegmentHp,
      speed: bossSpeed,
      hp: bossHp,
      isFinalBoss,
      affixes,
    });
    run.feedback.soundEvents.push({ type: "boss_spawn", priority: 5, intensity: isFinalBoss ? 1 : 0.82 });
  }
}
