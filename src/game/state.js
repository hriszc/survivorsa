import { computeTalentEffects } from "./systems/talentSystem";
import { DEFAULT_CONTRACT, DEFAULT_DOCTRINE, normalizeContract, normalizeDoctrine } from "./systems/loadoutSystem";

export const SAVE_KEY = "snake-survivor-save";
export const SAVE_VERSION = 3;
export const GAME_TIME_LIMIT = 11 * 60;

function defaultStats() {
  return {
    bestTime: 0,
    totalKills: 0,
    totalRuns: 0,
    totalBossKills: 0,
  };
}

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    metaCurrency: 0,
    talentNodesUnlocked: [],
    selectedDoctrine: DEFAULT_DOCTRINE,
    selectedContract: DEFAULT_CONTRACT,
    stats: defaultStats(),
  };
}

export function migrateSave(save) {
  if (!save || typeof save !== "object") {
    return createDefaultSave();
  }

  const migrated = {
    version: typeof save.version === "number" ? save.version : 1,
    metaCurrency: Number.isFinite(Number(save.metaCurrency)) ? Number(save.metaCurrency) : 0,
    talentNodesUnlocked: Array.isArray(save.talentNodesUnlocked)
      ? save.talentNodesUnlocked.filter((value) => typeof value === "string")
      : [],
    selectedDoctrine: typeof save.selectedDoctrine === "string" ? save.selectedDoctrine : DEFAULT_DOCTRINE,
    selectedContract: typeof save.selectedContract === "string" ? save.selectedContract : DEFAULT_CONTRACT,
    stats: {
      ...defaultStats(),
      ...(save.stats ?? {}),
    },
  };

  if (migrated.version <= 1) {
    // V1 -> V2: reserve field normalization and future compatibility hooks.
    migrated.version = 2;
    if (!Array.isArray(migrated.talentNodesUnlocked)) {
      migrated.talentNodesUnlocked = [];
    }
  }

  if (migrated.version <= 2) {
    // V2 -> V3: store persistent run-loadout selection.
    migrated.selectedDoctrine = normalizeDoctrine(migrated.selectedDoctrine);
    migrated.selectedContract = normalizeContract(migrated.selectedContract);
    migrated.version = 3;
  }

  migrated.version = SAVE_VERSION;
  migrated.selectedDoctrine = normalizeDoctrine(migrated.selectedDoctrine);
  migrated.selectedContract = normalizeContract(migrated.selectedContract);
  return migrated;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return createDefaultSave();
    }
    return migrateSave(JSON.parse(raw));
  } catch (error) {
    return createDefaultSave();
  }
}

export function persistSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (error) {
    // Ignore write failures in private mode or quota pressure.
  }
}

function createBasePlayer() {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 18,
    maxHp: 120,
    hp: 120,
    regen: 0.35,
    speed: 270,
    damage: 18,
    fireRate: 2.2,
    fireCooldown: 0,
    projectileSpeed: 470,
    projectileSize: 7,
    projectileLifetime: 1.65,
    projectileCount: 1,
    spread: 0.26,
    pierce: 0,
    critChance: 0.08,
    critMult: 1.85,
    lifesteal: 0,
    armorBreak: 0,
    pickupRadius: 100,
    xpGainMult: 1,
    soulGainMult: 1,
    soulOnLevelup: 0,
    dodgeChance: 0,
    damageReduction: 0,
    shieldMax: 0,
    shield: 0,
    shieldRegen: 0,
    thorns: 0,
    frostAura: 0,
    gravityPulse: 0,
    gravityTimer: 0,
    shockwaveLevel: 0,
    shockwaveTimer: 0,
    dashEnabled: false,
    dashCooldown: 5.2,
    dashTimer: 0,
    dashDuration: 0.17,
    dashBoost: 2.5,
    dashBuffTimer: 0,
    invulnTimer: 0,
    lowHpDamageBoost: 0,
    reviveCharges: 0,
    chainChance: 0,
    ricochet: 0,
    boomerang: 0,
    burnDamage: 0,
    doctrineId: DEFAULT_DOCTRINE,
    doctrineMeter: 0,
    doctrineRitual: 0,
    executeThreshold: 0,
    adrenalineLevel: 0,
    adrenalineTimer: 0,
    orbitBlades: 0,
    orbitDamage: 0,
    orbitRadius: 64,
    orbitAngle: 0,
    orbitTickTimer: 0,
    killPulseLevel: 0,
    chestChance: 0.04,
    rareSkillChance: 0,
    spreadControl: 0,
    vsBossMult: 0,
    activeEffects: {},
  };
}

function applyTalentEffectsToPlayer(player, effects) {
  player.damage += effects.baseDamageFlat;
  player.damage *= 1 + effects.damageMult;
  player.fireRate *= 1 + effects.attackSpeedMult;
  player.projectileSpeed *= 1 + effects.projectileSpeedMult;
  player.projectileSize *= 1 + effects.projectileSizeMult;
  player.projectileCount += effects.projectileCountBonus;
  player.pierce += effects.pierceBonus;
  player.critChance += effects.critChanceFlat;
  player.critMult += effects.critDamageMult;
  player.chainChance += effects.chainChance;
  player.spreadControl += effects.spreadControl;
  player.vsBossMult += effects.vsBossMult;

  player.maxHp += effects.maxHpFlat;
  player.hp = player.maxHp;
  player.regen += effects.regenFlat;
  player.damageReduction += effects.damageReduction;
  player.shieldMax += effects.shieldMaxFlat;
  player.shield = player.shieldMax;
  player.shieldRegen += effects.shieldRegenFlat;
  player.thorns += effects.thornsFlat;
  player.dodgeChance += effects.dodgeFlat;
  player.lowHpDamageBoost += effects.lowHpDamageBoost;
  player.reviveCharges += effects.reviveCharge;

  player.xpGainMult += effects.xpGainMult;
  player.soulGainMult += effects.soulGainMult;
  player.pickupRadius += effects.pickupRadiusFlat;
  player.chestChance += effects.chestChance;
  player.rareSkillChance += effects.rareSkillChance;
  player.soulOnLevelup += effects.soulOnLevelup;

  player.maxHp = Math.round(player.maxHp);
  player.hp = Math.round(player.hp);
  player.damage = Number(player.damage.toFixed(2));
  player.fireRate = Number(player.fireRate.toFixed(3));
  player.critChance = Math.min(0.65, player.critChance);
  player.dodgeChance = Math.min(0.45, player.dodgeChance);
  player.damageReduction = Math.min(0.7, player.damageReduction);
  player.shield = Math.max(0, player.shield);

  return {
    startXp: effects.startXp,
    startHealOrb: effects.startHealOrb,
  };
}

export function createRunState(save) {
  const player = createBasePlayer();
  const talentEffects = computeTalentEffects(save.talentNodesUnlocked);
  const runSeeds = applyTalentEffectsToPlayer(player, talentEffects);

  return {
    mode: "menu",
    world: {
      width: 2400,
      height: 1600,
    },
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    time: 0,
    score: 0,
    kills: 0,
    bossKilled: false,
    player,
    playerSpawn: { x: 0, y: 0 },
    snakes: [],
    enemyProjectiles: [],
    projectiles: [],
    pickups: [],
    particles: [],
    floatingTexts: [],
    skillLevels: {},
    unlockedEvolutions: {},
    levelup: {
      pending: false,
      choices: [],
      rerolls: 1,
      pendingCount: 0,
    },
    wave: {
      spawnTimer: 0,
      eliteTimer: 0,
      specialTimer: 0,
      lastBossMinute: 0,
      finalBossSpawned: false,
      nextSnakeId: 1,
      nextSegmentId: 1,
      nextPickupId: 1,
      nextProjectileId: 1,
      lastDamageAt: 0,
    },
    progression: {
      level: 1,
      xp: Math.max(0, runSeeds.startXp),
      xpToNext: 10,
    },
    quality: {
      level: 0,
      label: "高",
      fpsSamples: [],
      avgFps: 60,
      adjustCooldown: 0,
    },
    ui: {
      hint: "",
      showDamageNumbers: true,
      doctrineName: "",
      contractName: "",
      targetSnakeId: null,
    },
    loadout: {
      doctrineId: DEFAULT_DOCTRINE,
      contractId: DEFAULT_CONTRACT,
    },
    modifiers: {
      enemySpeedMult: 1,
      enemyHpMult: 1,
      enemyArmorBonus: 0,
      xpNeedMult: 1,
      pickupDropMult: 1,
      rareBonus: 0,
      soulRewardMult: 1,
      scoreRewardMult: 1,
      finalBossSoulBonus: 0,
      contractRiskLabel: "",
    },
    perf: {
      activeSegments: 0,
      collisionChecks: 0,
    },
    feedback: {
      hitStop: 0,
      shakeTime: 0,
      shakeMag: 0,
      playerFlash: 0,
      bossFlash: 0,
      bossFlashPos: { x: 0, y: 0 },
      killStreak: 0,
      killStreakTimer: 0,
      heat: 0,
      overdriveLevel: 0,
      soundEvents: [],
      lastHit: null,
      ccdEnabled: true,
    },
    runSeeds,
    input: {
      moveX: 0,
      moveY: 0,
      wantPause: false,
      wantDash: false,
      wantConfirm: false,
      levelupChoice: null,
      pointerX: 0,
      pointerY: 0,
      isMobile: false,
      joystick: {
        active: false,
        id: -1,
        x: 0,
        y: 0,
      },
    },
  };
}

export function createGameState() {
  const save = loadSave();
  return {
    save,
    run: createRunState(save),
    lastTimestamp: 0,
    accumulator: 0,
    fixedDt: 1 / 60,
    uiState: {
      activeLevelupButtons: [],
      talentHint: "",
    },
  };
}

export function restartRun(state, mode = "playing") {
  state.run = createRunState(state.save);
  state.run.mode = mode;
  state.lastTimestamp = 0;
  state.accumulator = 0;
}

export function recordRunResult(state, won) {
  const run = state.run;
  const save = state.save;
  save.stats.totalRuns += 1;
  save.stats.totalKills += run.kills;
  save.stats.bestTime = Math.max(save.stats.bestTime, run.time);
  if (won) {
    save.stats.totalBossKills += 1;
  }
  persistSave(save);
}
