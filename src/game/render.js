import { clamp, formatTime } from "./utils";

function clearBackground(ctx, width, height, camera, run) {
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#061829");
  grad.addColorStop(1, "#121b31");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const step = 46;
  const offsetX = ((((camera?.x ?? 0) * (camera?.zoom ?? 1)) % step) + step) % step;
  const offsetY = ((((camera?.y ?? 0) * (camera?.zoom ?? 1)) % step) + step) % step;

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#4f7ba8";
  ctx.lineWidth = 1;
  for (let x = -offsetX; x < width + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = -offsetY; y < height + step; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const majorStep = step * 4;
  const majorOffsetX = ((((camera?.x ?? 0) * 0.5 * (camera?.zoom ?? 1)) % majorStep) + majorStep) % majorStep;
  const majorOffsetY = ((((camera?.y ?? 0) * 0.5 * (camera?.zoom ?? 1)) % majorStep) + majorStep) % majorStep;
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#79a2cf";
  for (let x = -majorOffsetX; x < width + majorStep; x += majorStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = -majorOffsetY; y < height + majorStep; y += majorStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const speed = Math.hypot(run.player.vx, run.player.vy);
  if (speed > 12) {
    const dirX = run.player.vx / speed;
    const dirY = run.player.vy / speed;
    const flowAlpha = Math.min(0.12, speed / 2200);
    for (let i = 0; i < 10; i += 1) {
      const seed = (i * 97 + Math.floor(run.time * 40)) % 997;
      const sx = ((seed * 137) % width + width) % width;
      const sy = ((seed * 73) % height + height) % height;
      ctx.strokeStyle = `rgba(126, 224, 255, ${flowAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - dirX * 22, sy - dirY * 22);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function applyCamera(run, canvas) {
  const targetX = run.player.x;
  const targetY = run.player.y;
  run.camera.x += (targetX - run.camera.x) * 0.14;
  run.camera.y += (targetY - run.camera.y) * 0.14;

  const portrait = window.matchMedia("(orientation: portrait)").matches;
  run.camera.zoom = portrait ? 0.86 : 1;

  const shakeMag = run.feedback.shakeTime > 0 ? run.feedback.shakeMag : 0;
  const shakeX = shakeMag > 0 ? (Math.random() * 2 - 1) * shakeMag : 0;
  const shakeY = shakeMag > 0 ? (Math.random() * 2 - 1) * shakeMag : 0;

  return {
    x: run.camera.x + shakeX,
    y: run.camera.y + shakeY,
    zoom: run.camera.zoom,
    w: canvas.width,
    h: canvas.height,
  };
}

function worldToScreen(camera, x, y) {
  return {
    x: (x - camera.x) * camera.zoom + camera.w * 0.5,
    y: (y - camera.y) * camera.zoom + camera.h * 0.5,
  };
}

function drawWorldBorder(ctx, camera, run) {
  const halfW = run.world.width * 0.5;
  const halfH = run.world.height * 0.5;

  const topLeft = worldToScreen(camera, -halfW, -halfH);
  const bottomRight = worldToScreen(camera, halfW, halfH);

  ctx.strokeStyle = "rgba(120,180,240,0.22)";
  ctx.lineWidth = 3;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function drawPlayer(ctx, camera, run) {
  const player = run.player;
  const p = worldToScreen(camera, player.x, player.y);

  if (player.invulnTimer > 0) {
    ctx.globalAlpha = 0.65;
  }

  ctx.beginPath();
  ctx.fillStyle = "#6cffd4";
  ctx.arc(p.x, p.y, player.r * camera.zoom, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "#112028";
  ctx.arc(p.x + 4, p.y - 3, 4 * camera.zoom, 0, Math.PI * 2);
  ctx.fill();

  if (player.shield > 0) {
    const ratio = clamp(player.shield / Math.max(1, player.shieldMax), 0, 1);
    ctx.strokeStyle = `rgba(120,205,255,${0.2 + ratio * 0.55})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (player.r + 8 + ratio * 5) * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (player.activeEffects.dashingTime > 0) {
    ctx.strokeStyle = "rgba(88,255,221,0.66)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (player.r + 18) * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (player.adrenalineTimer > 0 && player.adrenalineLevel > 0) {
    const alpha = clamp(player.adrenalineTimer * 0.25, 0.08, 0.34);
    ctx.strokeStyle = `rgba(255,170,120,${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (player.r + 24) * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (player.orbitBlades > 0) {
    const bladeCount = player.orbitBlades + 1;
    for (let i = 0; i < bladeCount; i += 1) {
      const angle = player.orbitAngle + (Math.PI * 2 * i) / bladeCount;
      const bx = player.x + Math.cos(angle) * player.orbitRadius;
      const by = player.y + Math.sin(angle) * player.orbitRadius;
      const bp = worldToScreen(camera, bx, by);
      ctx.fillStyle = "#8ff6ff";
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 5.2 * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(143,246,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 9.2 * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function snakePalette(type) {
  if (type === "boss") {
    return { head: "#ff7a7a", body: "#d84d73" };
  }
  if (type === "totem") {
    return { head: "#87d7ff", body: "#5f9dcc" };
  }
  if (type === "elite") {
    return { head: "#ffa46a", body: "#ff8a49" };
  }
  if (type === "rusher") {
    return { head: "#f7e57a", body: "#cda355" };
  }
  return { head: "#f49f6f", body: "#d17a48" };
}

function drawSnakes(ctx, camera, run) {
  for (const snake of run.snakes) {
    const palette = snakePalette(snake.type);

    for (let i = snake.segments.length - 1; i >= 0; i -= 1) {
      const segment = snake.segments[i];
      const p = worldToScreen(camera, segment.x, segment.y);
      const t = 1 - i / Math.max(1, snake.segments.length);
      ctx.fillStyle = palette.body;
      ctx.globalAlpha = 0.45 + t * 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, segment.r * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    const head = worldToScreen(camera, snake.head.x, snake.head.y);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = snake.id === run.ui.targetSnakeId ? "rgba(175,248,255,0.88)" : "rgba(15,28,38,0.82)";
    ctx.lineWidth = snake.id === run.ui.targetSnakeId ? 4 : 2;
    ctx.beginPath();
    ctx.arc(head.x, head.y, snake.head.r * camera.zoom + 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = palette.head;
    ctx.beginPath();
    ctx.arc(head.x, head.y, snake.head.r * camera.zoom, 0, Math.PI * 2);
    ctx.fill();

    const eyeX = head.x + Math.cos(snake.head.dir) * snake.head.r * 0.45 * camera.zoom;
    const eyeY = head.y + Math.sin(snake.head.dir) * snake.head.r * 0.45 * camera.zoom;
    ctx.fillStyle = "#11161f";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 3 * camera.zoom, 0, Math.PI * 2);
    ctx.fill();

    if (snake.type === "boss") {
      const hpRatio = clamp(snake.head.hp / snake.head.maxHp, 0, 1);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(head.x - 46, head.y - 42, 92, 6);
      ctx.fillStyle = "#ff677a";
      ctx.fillRect(head.x - 46, head.y - 42, 92 * hpRatio, 6);

      if (snake.head.barrierActive) {
        ctx.strokeStyle = "rgba(142,205,255,0.78)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(head.x, head.y, (snake.head.r + 14) * camera.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (snake.affixes.includes("totem")) {
        const totems = run.snakes.filter((item) => item.alive && item.type === "totem" && item.anchorBossId === snake.id).length;
        if (totems > 0) {
          ctx.fillStyle = "rgba(129,224,255,0.85)";
          ctx.font = "11px IBM Plex Mono";
          ctx.textAlign = "center";
          ctx.fillText(`支柱 x${totems}`, head.x, head.y - 50);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles(ctx, camera, run) {
  const quality = run.quality.level;

  for (const projectile of run.projectiles) {
    const p = worldToScreen(camera, projectile.x, projectile.y);
    ctx.fillStyle = "#b7f9ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, projectile.r * camera.zoom, 0, Math.PI * 2);
    ctx.fill();

    if (quality === 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#77ddff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, projectile.r * 1.9 * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  for (const shot of run.enemyProjectiles) {
    const p = worldToScreen(camera, shot.x, shot.y);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ff7fa6";
    ctx.beginPath();
    ctx.arc(p.x, p.y, shot.r * 2.7 * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ff9fbc";
    ctx.beginPath();
    ctx.arc(p.x, p.y, shot.r * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPickups(ctx, camera, run) {
  for (const pickup of run.pickups) {
    const p = worldToScreen(camera, pickup.x, pickup.y);
    if (pickup.type === "xp") {
      ctx.fillStyle = "#77f8d4";
      ctx.globalAlpha = 0.86;
    } else if (pickup.type === "heal") {
      ctx.fillStyle = "#7dff8f";
      ctx.globalAlpha = 0.96;
    } else {
      const pulse = 0.5 + Math.sin(run.time * 7 + pickup.id) * 0.5;
      ctx.globalAlpha = 0.78 + pulse * 0.2;
      ctx.fillStyle = "#ffd972";
      ctx.beginPath();
      ctx.arc(p.x, p.y, pickup.r * 1.7 * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffd972";
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, pickup.r * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFx(ctx, camera, run) {
  for (const particle of run.particles) {
    const p = worldToScreen(camera, particle.x, particle.y);
    ctx.globalAlpha = clamp(particle.ttl * 5, 0, 1);
    ctx.strokeStyle = particle.color;
    ctx.fillStyle = particle.color;
    if (particle.ring) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, particle.r * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, particle.r * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.font = "14px JetBrains Mono";
  ctx.textAlign = "center";
  for (const text of run.floatingTexts) {
    const p = worldToScreen(camera, text.x, text.y);
    ctx.fillStyle = text.color;
    ctx.globalAlpha = clamp(text.ttl, 0, 1);
    ctx.fillText(text.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawBossTelegraphs(ctx, camera, run) {
  for (const snake of run.snakes) {
    if (!snake.alive || snake.type !== "boss") {
      continue;
    }

    if (snake.head.chargeWindup > 0) {
      const p = worldToScreen(camera, snake.head.x, snake.head.y);
      const length = 360 * camera.zoom;
      const ex = p.x + Math.cos(snake.head.chargeDir) * length;
      const ey = p.y + Math.sin(snake.head.chargeDir) * length;
      ctx.strokeStyle = `rgba(255,120,146,${clamp(snake.head.chargeWindup * 1.6, 0.16, 0.65)})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }
}

function drawThreatArrows(ctx, camera, run) {
  const threats = run.snakes
    .filter((snake) => snake.alive && (snake.type === "boss" || snake.type === "elite" || snake.type === "rusher"))
    .slice(0, 6);

  for (const snake of threats) {
    const p = worldToScreen(camera, snake.head.x, snake.head.y);
    const margin = 32;
    if (p.x >= margin && p.x <= camera.w - margin && p.y >= margin && p.y <= camera.h - margin) {
      continue;
    }

    const cx = clamp(p.x, margin, camera.w - margin);
    const cy = clamp(p.y, margin, camera.h - margin);
    const angle = Math.atan2(p.y - cy, p.x - cx);
    const size = snake.type === "boss" ? 13 : 9;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = snake.type === "boss" ? "rgba(255,122,144,0.88)" : "rgba(255,205,124,0.82)";
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.55);
    ctx.lineTo(-size * 0.7, -size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawOverlays(ctx, run, canvas) {
  if (run.mode === "playing") {
    if (!run.wave.finalBossSpawned) {
      const nextBossTime = (Math.floor(run.time / 60) + 1) * 60;
      const left = Math.max(0, nextBossTime - run.time);
      if (left <= 12) {
        ctx.fillStyle = "rgba(255, 131, 160, 0.12)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "24px ZCOOL QingKe HuangYou";
        ctx.fillStyle = "#ffd6de";
        ctx.textAlign = "center";
        ctx.fillText(`蛇王信号 ${left.toFixed(1)}s`, canvas.width * 0.5, 48);
      }
    } else if (!run.bossKilled) {
      ctx.fillStyle = "rgba(255, 118, 149, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "24px ZCOOL QingKe HuangYou";
      ctx.fillStyle = "#ffd6de";
      ctx.textAlign = "center";
      ctx.fillText("终局蛇王交战中", canvas.width * 0.5, 48);
    }
  }

  if (run.feedback.overdriveLevel > 0) {
    const pulse = 0.45 + Math.sin(run.time * 10) * 0.35;
    const alpha = run.feedback.overdriveLevel === 2 ? 0.18 + pulse * 0.08 : 0.08 + pulse * 0.05;
    ctx.fillStyle = run.feedback.overdriveLevel === 2 ? `rgba(255,188,105,${alpha})` : `rgba(145,235,255,${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "20px Bungee";
    ctx.fillStyle = run.feedback.overdriveLevel === 2 ? "#ffe6af" : "#a9efff";
    ctx.textAlign = "center";
    ctx.fillText(run.feedback.overdriveLevel === 2 ? "OVERDRIVE MAX" : "OVERDRIVE", canvas.width * 0.5, 84);
  }

  if (run.mode === "victory") {
    ctx.fillStyle = "rgba(95,255,214,0.14)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (run.feedback.playerFlash > 0) {
    ctx.globalAlpha = clamp(run.feedback.playerFlash * 5.5, 0, 0.35);
    ctx.fillStyle = "#ff9cab";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }

  if (run.feedback.bossFlash > 0) {
    const p = worldToScreen(
      { x: run.camera.x, y: run.camera.y, zoom: run.camera.zoom, w: canvas.width, h: canvas.height },
      run.feedback.bossFlashPos.x,
      run.feedback.bossFlashPos.y,
    );
    const radius = 120 * run.camera.zoom;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    grad.addColorStop(0, `rgba(255,140,160,${clamp(run.feedback.bossFlash * 3, 0, 0.5)})`);
    grad.addColorStop(1, "rgba(255,140,160,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  if (hpRatio < 0.35 && run.mode === "playing") {
    const pulse = (Math.sin(run.time * 9) + 1) * 0.5;
    const alpha = clamp((0.35 - hpRatio) * 1.2 * (0.35 + pulse * 0.5), 0.08, 0.42);
    ctx.lineWidth = 24;
    ctx.strokeStyle = `rgba(255,93,124,${alpha})`;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }
}

export function resizeCanvas(canvas) {
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  canvas.width = Math.max(320, width);
  canvas.height = Math.max(320, height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

export function renderGame(ctx, state, canvas) {
  const run = state.run;
  const camera = applyCamera(run, canvas);
  clearBackground(ctx, canvas.width, canvas.height, camera, run);

  drawWorldBorder(ctx, camera, run);
  drawPickups(ctx, camera, run);
  drawProjectiles(ctx, camera, run);
  drawBossTelegraphs(ctx, camera, run);
  drawSnakes(ctx, camera, run);
  drawPlayer(ctx, camera, run);
  drawFx(ctx, camera, run);
  drawThreatArrows(ctx, camera, run);
  drawOverlays(ctx, run, canvas);
}

export function buildRenderTextState(run) {
  const enemies = run.snakes.slice(0, 30).map((snake) => ({
    id: snake.id,
    type: snake.type,
    isFinalBoss: Boolean(snake.isFinalBoss),
    affixes: snake.affixes,
    head: {
      x: Number(snake.head.x.toFixed(1)),
      y: Number(snake.head.y.toFixed(1)),
      hp: Number(snake.head.hp.toFixed(1)),
      maxHp: Number(snake.head.maxHp.toFixed(1)),
    },
    segmentCount: snake.segments.length,
  }));

  const payload = {
    mode: run.mode,
    time: Number(run.time.toFixed(2)),
    score: run.score,
    player: {
      x: Number(run.player.x.toFixed(1)),
      y: Number(run.player.y.toFixed(1)),
      hp: Number(run.player.hp.toFixed(1)),
      maxHp: Number(run.player.maxHp.toFixed(1)),
      speed: Number(run.player.speed.toFixed(1)),
      buffs: Object.keys(run.player.activeEffects).filter((key) => run.player.activeEffects[key]),
    },
    progression: {
      level: run.progression.level,
      xp: run.progression.xp,
      xpToNext: run.progression.xpToNext,
    },
    enemies,
    projectiles: run.projectiles.slice(0, 25).map((p) => ({ x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)), r: p.r })),
    pickups: run.pickups.slice(0, 25).map((p) => ({ type: p.type, x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)) })),
    ui: {
      levelupOpen: run.mode === "levelup",
      levelupChoices: run.levelup.choices,
      quality: run.quality.label,
      timeText: formatTime(run.time),
      doctrine: run.ui.doctrineName,
      contract: run.ui.contractName,
    },
    perf: {
      activeSegments: run.perf.activeSegments,
      collisionChecks: run.perf.collisionChecks,
    },
    combat: {
      lastHit: run.feedback.lastHit,
      ccdEnabled: run.feedback.ccdEnabled,
      heat: Number(run.feedback.heat.toFixed(2)),
      overdriveLevel: run.feedback.overdriveLevel,
    },
    meta: {
      coordinateSystem: "origin=top-left in render output; world uses center-origin. x->right, y->down",
    },
  };

  return JSON.stringify(payload);
}
