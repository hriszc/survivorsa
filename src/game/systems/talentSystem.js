import { TALENT_BY_ID, TALENT_BRANCHES, TALENT_NODES } from "../../data/talents";

export function createTalentEffects() {
  return {
    damageMult: 0,
    attackSpeedMult: 0,
    projectileSpeedMult: 0,
    projectileSizeMult: 0,
    baseDamageFlat: 0,
    critChanceFlat: 0,
    critDamageMult: 0,
    pierceBonus: 0,
    projectileCountBonus: 0,
    chainChance: 0,
    spreadControl: 0,
    vsBossMult: 0,
    maxHpFlat: 0,
    regenFlat: 0,
    damageReduction: 0,
    shieldMaxFlat: 0,
    shieldRegenFlat: 0,
    thornsFlat: 0,
    dodgeFlat: 0,
    lowHpDamageBoost: 0,
    reviveCharge: 0,
    xpGainMult: 0,
    soulGainMult: 0,
    pickupRadiusFlat: 0,
    chestChance: 0,
    startXp: 0,
    rareSkillChance: 0,
    soulOnLevelup: 0,
    startHealOrb: 0,
    metaBonusAll: 0,
  };
}

export function computeTalentEffects(unlockedIds) {
  const effects = createTalentEffects();
  const ids = Array.isArray(unlockedIds) ? unlockedIds : [];

  for (const id of ids) {
    const node = TALENT_BY_ID[id];
    if (!node) {
      continue;
    }
    const key = node.effect?.key;
    const value = node.effect?.value;
    if (!key || typeof value !== "number") {
      continue;
    }
    if (typeof effects[key] !== "number") {
      effects[key] = 0;
    }
    effects[key] += value;
  }

  if (effects.metaBonusAll > 0) {
    effects.damageMult += effects.metaBonusAll;
    effects.attackSpeedMult += effects.metaBonusAll;
    effects.xpGainMult += effects.metaBonusAll;
    effects.soulGainMult += effects.metaBonusAll;
  }

  return effects;
}

export function canUnlockTalent(save, nodeId) {
  const node = TALENT_BY_ID[nodeId];
  if (!node) {
    return { ok: false, reason: "节点不存在" };
  }

  const unlocked = new Set(save.talentNodesUnlocked ?? []);
  if (unlocked.has(nodeId)) {
    return { ok: false, reason: "已解锁" };
  }

  const missing = node.prereq.filter((id) => !unlocked.has(id));
  if (missing.length > 0) {
    return { ok: false, reason: "前置天赋未满足" };
  }

  if ((save.metaCurrency ?? 0) < node.cost) {
    return { ok: false, reason: "灵魂点不足" };
  }

  return { ok: true, reason: "" };
}

export function unlockTalent(save, nodeId) {
  const can = canUnlockTalent(save, nodeId);
  if (!can.ok) {
    return can;
  }

  const node = TALENT_BY_ID[nodeId];
  save.metaCurrency -= node.cost;
  save.talentNodesUnlocked.push(nodeId);
  return { ok: true, reason: "" };
}

export function getTalentTreeByBranch() {
  const result = {};
  for (const branch of TALENT_BRANCHES) {
    result[branch] = TALENT_NODES.filter((node) => node.branch === branch);
  }
  return result;
}
