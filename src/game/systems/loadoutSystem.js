import { CONTRACT_BY_ID, CONTRACTS, DOCTRINE_BY_ID, DOCTRINES } from "../../data/loadouts";

export const DEFAULT_DOCTRINE = "vanguard";
export const DEFAULT_CONTRACT = "none";

export function getDoctrineOptions() {
  return DOCTRINES;
}

export function getContractOptions() {
  return CONTRACTS;
}

export function normalizeDoctrine(doctrineId) {
  return DOCTRINE_BY_ID[doctrineId] ? doctrineId : DEFAULT_DOCTRINE;
}

export function normalizeContract(contractId) {
  return CONTRACT_BY_ID[contractId] ? contractId : DEFAULT_CONTRACT;
}

export function getDoctrineById(doctrineId) {
  return DOCTRINE_BY_ID[normalizeDoctrine(doctrineId)];
}

export function getContractById(contractId) {
  return CONTRACT_BY_ID[normalizeContract(contractId)];
}

export function applyDoctrine(run, doctrineId) {
  const player = run.player;
  const id = normalizeDoctrine(doctrineId);
  run.loadout.doctrineId = id;
  player.doctrineId = id;
  player.doctrineMeter = 0;
  player.doctrineRitual = 0;

  if (id === "vanguard") {
    player.projectileCount += 1;
    player.fireRate *= 1.06;
    player.damage *= 0.92;
  } else if (id === "ritual") {
    player.fireRate *= 0.72;
    player.damage *= 1.38;
    player.projectileSpeed *= 0.88;
    player.critChance += 0.03;
  } else if (id === "phantom") {
    player.fireRate *= 0.94;
    player.damage *= 0.95;
    player.critChance += 0.11;
    player.critMult += 0.25;
    player.dashEnabled = true;
    player.dashCooldown *= 0.8;
    player.boomerang = Math.max(player.boomerang, 1);
  }
}

export function applyContract(run, contractId) {
  const player = run.player;
  const id = normalizeContract(contractId);
  run.loadout.contractId = id;
  run.modifiers.contractRiskLabel = getContractById(id).risk;

  if (id === "none") {
    run.modifiers.soulRewardMult = 1;
    run.modifiers.scoreRewardMult = 1;
    return;
  }

  if (id === "glass_core") {
    player.maxHp *= 0.64;
    player.hp = player.maxHp;
    player.damage *= 1.12;
    run.modifiers.soulRewardMult = 1.42;
    run.modifiers.scoreRewardMult = 1.18;
    return;
  }

  if (id === "war_tithe") {
    run.modifiers.enemySpeedMult = 1.18;
    run.modifiers.enemyArmorBonus = 0.06;
    run.modifiers.rareBonus = 0.09;
    run.modifiers.soulRewardMult = 1.55;
    run.modifiers.scoreRewardMult = 1.1;
    return;
  }

  if (id === "scarcity") {
    run.modifiers.xpNeedMult = 1.35;
    run.modifiers.pickupDropMult = 0.84;
    run.modifiers.finalBossSoulBonus = 88;
    run.modifiers.soulRewardMult = 1.68;
    run.modifiers.scoreRewardMult = 1.15;
  }
}

export function applyLoadout(run, save) {
  const doctrineId = normalizeDoctrine(save.selectedDoctrine);
  const contractId = normalizeContract(save.selectedContract);
  applyDoctrine(run, doctrineId);
  applyContract(run, contractId);
}
