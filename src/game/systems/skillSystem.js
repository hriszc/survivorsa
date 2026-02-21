import { SKILLS, SKILL_BY_ID } from "../../data/skills";
import { choose } from "../utils";

const EVOLUTION_RULES = [
  {
    id: "spiral_pierce_evo",
    name: "进化A：螺旋贯穿",
    hint: "贯甲弹 + 回旋弹道 + 超频射击",
    check: (levels) => (levels.pierce_shot ?? 0) >= 2 && (levels.boomerang ?? 0) >= 1 && (levels.attack_speed ?? 0) >= 2,
    apply(run) {
      run.player.projectileCount += 1;
      run.player.pierce += 1;
      run.player.ricochet += 1;
      run.player.activeEffects.spiralTrail = true;
    },
  },
  {
    id: "frost_break_evo",
    name: "进化B：霜裂审判",
    hint: "寒域核心 + 破甲偏转 + 弱点识别",
    check: (levels) => (levels.frost_aura ?? 0) >= 2 && (levels.armor_break ?? 0) >= 2 && (levels.crit_mastery ?? 0) >= 2,
    apply(run) {
      run.player.frostAura += 45;
      run.player.armorBreak += 0.18;
      run.player.critChance += 0.08;
      run.player.activeEffects.frostBreak = true;
    },
  },
  {
    id: "xp_storm_evo",
    name: "进化C：经验风暴",
    hint: "磁场放大 + 过载结晶",
    check: (levels) => (levels.pickup_radius ?? 0) >= 2 && (levels.overflow_xp ?? 0) >= 1,
    apply(run) {
      run.player.activeEffects.xpStorm = true;
      run.player.pickupRadius += 60;
    },
  },
  {
    id: "thorn_shield_evo",
    name: "进化D：棘盾回响",
    hint: "棱镜护盾 + 痛觉链接",
    check: (levels) => (levels.shield_matrix ?? 0) >= 2 && (levels.pain_link ?? 0) >= 1,
    apply(run) {
      run.player.thorns += 8;
      run.player.activeEffects.thornShield = true;
    },
  },
  {
    id: "dash_burst_evo",
    name: "进化E：折跃爆发",
    hint: "冲刺驱动 + 折跃回充",
    check: (levels) => (levels.dash_drive ?? 0) >= 1 && (levels.dash_cooldown ?? 0) >= 2,
    apply(run) {
      run.player.dashBoost += 0.8;
      run.player.activeEffects.dashBurst = true;
    },
  },
];

export function getSkillLevel(run, skillId) {
  return run.skillLevels[skillId] ?? 0;
}

export function getSkillDefinition(skillId) {
  return SKILL_BY_ID[skillId] ?? null;
}

function pickWeightedSkill(candidates, rareChance) {
  const rarePool = candidates.filter((skill) => skill.rarity === "rare");
  const commonPool = candidates.filter((skill) => skill.rarity !== "rare");
  const forceRare = Math.random() < rareChance && rarePool.length > 0;

  if (forceRare) {
    return choose(rarePool);
  }

  if (commonPool.length > 0) {
    return choose(commonPool);
  }

  return choose(candidates);
}

export function generateLevelupChoices(run, count = 3) {
  const levels = run.skillLevels;
  const available = SKILLS.filter((skill) => (levels[skill.id] ?? 0) < skill.maxLevel);
  const choices = [];

  if (available.length === 0) {
    return [];
  }

  const pool = [...available];
  const rareChance = 0.15 + run.player.rareSkillChance + (run.modifiers.rareBonus ?? 0);

  while (choices.length < count && pool.length > 0) {
    const picked = pickWeightedSkill(pool, rareChance);
    choices.push(picked.id);
    const index = pool.findIndex((skill) => skill.id === picked.id);
    if (index >= 0) {
      pool.splice(index, 1);
    }
  }

  return choices;
}

function applySingleSkillLevel(run, skillId) {
  const player = run.player;

  switch (skillId) {
    case "attack_speed":
      player.fireRate *= 1.12;
      break;
    case "base_damage":
      player.damage *= 1.14;
      break;
    case "multishot":
      player.projectileCount += 1;
      break;
    case "pierce_shot":
      player.pierce += 1;
      break;
    case "boomerang":
      player.boomerang = Math.min(1, player.boomerang + 1);
      player.projectileLifetime += 0.25;
      break;
    case "projectile_speed":
      player.projectileSpeed *= 1.15;
      break;
    case "crit_mastery":
      player.critChance += 0.06;
      player.critMult += 0.12;
      break;
    case "armor_break":
      player.armorBreak += 0.1;
      break;
    case "execution_protocol":
      player.executeThreshold += 0.06;
      break;
    case "frost_aura":
      player.frostAura += 22;
      break;
    case "chain_lightning":
      player.chainChance += 0.16;
      break;
    case "ignite_rounds":
      player.burnDamage += 2.6;
      break;
    case "ricochet":
      player.ricochet += 1;
      break;
    case "max_hp":
      player.maxHp += 18;
      player.hp += 18;
      break;
    case "regen":
      player.regen += 0.55;
      break;
    case "lifesteal":
      player.lifesteal += 0.03;
      break;
    case "shield_matrix":
      player.shieldMax += 18;
      player.shield = player.shieldMax;
      player.shieldRegen += 0.36;
      break;
    case "pain_link":
      player.thorns += 4;
      break;
    case "dodge":
      player.dodgeChance += 0.05;
      break;
    case "fortified_skin":
      player.damageReduction += 0.05;
      break;
    case "adrenaline_loop":
      player.adrenalineLevel += 1;
      break;
    case "swift_step":
      player.speed *= 1.08;
      break;
    case "dash_drive":
      player.dashEnabled = true;
      break;
    case "dash_cooldown":
      player.dashCooldown *= 0.83;
      break;
    case "pickup_radius":
      player.pickupRadius *= 1.22;
      break;
    case "overflow_xp":
      player.activeEffects.overflowXP = true;
      break;
    case "soul_greed":
      player.soulGainMult += 0.08;
      break;
    case "treasure_instinct":
      player.chestChance += 0.08;
      break;
    case "gravity_well":
      player.gravityPulse += 1;
      break;
    case "shockwave":
      player.shockwaveLevel += 1;
      break;
    case "orbital_blades":
      player.orbitBlades += 1;
      player.orbitDamage += 5;
      player.orbitRadius += 8;
      break;
    case "kill_pulse":
      player.killPulseLevel += 1;
      break;
    default:
      break;
  }

  player.critChance = Math.min(0.78, player.critChance);
  player.damageReduction = Math.min(0.72, player.damageReduction);
  player.dodgeChance = Math.min(0.55, player.dodgeChance);
  player.executeThreshold = Math.min(0.35, player.executeThreshold);
  player.fireRate = Math.min(9.5, player.fireRate);
}

export function evaluateEvolutions(run) {
  let unlockedAny = false;
  for (const rule of EVOLUTION_RULES) {
    if (run.unlockedEvolutions[rule.id]) {
      continue;
    }
    if (rule.check(run.skillLevels)) {
      rule.apply(run);
      run.unlockedEvolutions[rule.id] = {
        name: rule.name,
        hint: rule.hint,
      };
      run.floatingTexts.push({
        x: run.player.x,
        y: run.player.y - 40,
        text: `${rule.name} 解锁!`,
        ttl: 2.2,
        color: "#7ffff1",
      });
      run.feedback.soundEvents.push({ type: "levelup", priority: 3, intensity: 1 });
      unlockedAny = true;
    }
  }
  return unlockedAny;
}

export function acquireSkill(run, skillId) {
  const skill = getSkillDefinition(skillId);
  if (!skill) {
    return false;
  }

  const level = getSkillLevel(run, skillId);
  if (level >= skill.maxLevel) {
    return false;
  }

  run.skillLevels[skillId] = level + 1;
  applySingleSkillLevel(run, skillId);
  run.score += 12 + run.progression.level * 2;

  if (run.player.soulOnLevelup > 0) {
    run.score += run.player.soulOnLevelup * 2;
  }

  evaluateEvolutions(run);
  run.feedback.soundEvents.push({ type: "skill_pick", priority: 2, intensity: 0.8 });
  return true;
}

export function getSkillOptionPayload(run, skillId) {
  const skill = getSkillDefinition(skillId);
  const level = getSkillLevel(run, skillId);
  if (!skill) {
    return null;
  }

  const nextLevel = Math.min(level + 1, skill.maxLevel);
  const evolutions = Object.values(run.unlockedEvolutions);

  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    rarity: skill.rarity,
    level,
    nextLevel,
    maxLevel: skill.maxLevel,
    desc: skill.desc,
    evolvedCount: evolutions.length,
  };
}

export function getEvolutionList(run) {
  return EVOLUTION_RULES.map((rule) => ({
    id: rule.id,
    name: rule.name,
    hint: rule.hint,
    unlocked: Boolean(run.unlockedEvolutions[rule.id]),
  }));
}
