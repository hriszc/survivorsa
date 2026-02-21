import { clamp, distance, normalize, randRange } from "../utils";

export function spawnPickup(run, type, x, y, value = 1) {
  run.pickups.push({
    id: run.wave.nextPickupId++,
    type,
    x,
    y,
    r: type === "xp" ? 7 : type === "heal" ? 10 : 12,
    value,
    vx: 0,
    vy: 0,
  });
}

export function burstXp(run, x, y, count = 3, value = 1) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = randRange(10, 28);
    spawnPickup(run, "xp", x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, value);
  }
}

export function awardXp(run, baseXp) {
  const gain = Math.max(1, Math.round(baseXp * run.player.xpGainMult));
  run.progression.xp += gain;

  let leveled = 0;
  while (run.progression.xp >= run.progression.xpToNext) {
    run.progression.xp -= run.progression.xpToNext;
    run.progression.level += 1;
    run.progression.xpToNext = Math.round((run.progression.xpToNext * 1.28 + 6) * (run.modifiers.xpNeedMult ?? 1));
    leveled += 1;
    run.levelup.pendingCount = (run.levelup.pendingCount ?? 0) + 1;

    if (run.player.soulOnLevelup > 0) {
      run.score += run.player.soulOnLevelup * 12;
    }
  }

  return { gain, leveled };
}

export function updatePickups(run, dt) {
  const player = run.player;
  const remaining = [];
  const pickupRadius = player.pickupRadius;
  const magnetRadius = pickupRadius + 130;
  let xpCollected = false;
  let healCollected = false;
  let chestCollected = false;

  for (const pickup of run.pickups) {
    const dist = distance(player, pickup);
    if (dist < pickupRadius + pickup.r) {
      if (pickup.type === "xp") {
        awardXp(run, pickup.value);
        run.score += 6;
        xpCollected = true;
      } else if (pickup.type === "heal") {
        player.hp = Math.min(player.maxHp, player.hp + pickup.value);
        healCollected = true;
        run.floatingTexts.push({
          x: player.x,
          y: player.y - 26,
          text: `+${Math.round(pickup.value)}HP`,
          ttl: 0.9,
          color: "#7dff95",
        });
      } else if (pickup.type === "chest") {
        run.score += 120;
        awardXp(run, 18);
        run.levelup.pendingCount = (run.levelup.pendingCount ?? 0) + 1;
        chestCollected = true;
      }
      continue;
    }

    if (dist < magnetRadius) {
      const direction = normalize(player.x - pickup.x, player.y - pickup.y);
      const pull = clamp((magnetRadius - dist) / magnetRadius, 0.2, 1);
      pickup.vx += direction.x * 920 * pull * dt;
      pickup.vy += direction.y * 920 * pull * dt;
    }

    pickup.vx *= 0.88;
    pickup.vy *= 0.88;
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    remaining.push(pickup);
  }

  run.pickups = remaining;

  if (xpCollected) {
    run.feedback.soundEvents.push({ type: "pickup_xp", priority: 1, intensity: 0.45 });
  }
  if (healCollected) {
    run.feedback.soundEvents.push({ type: "pickup_heal", priority: 2, intensity: 0.75 });
  }
  if (chestCollected) {
    run.feedback.soundEvents.push({ type: "pickup_chest", priority: 3, intensity: 0.95 });
  }
}
