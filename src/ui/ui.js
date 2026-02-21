import { TALENT_BRANCHES } from "../data/talents";
import { getTalentTreeByBranch, canUnlockTalent } from "../game/systems/talentSystem";
import { getSkillOptionPayload, getEvolutionList } from "../game/systems/skillSystem";
import { getContractOptions, getDoctrineOptions } from "../game/systems/loadoutSystem";
import { formatTime } from "../game/utils";

function toggle(visible, element) {
  if (visible) {
    element.classList.add("visible");
  } else {
    element.classList.remove("visible");
  }
}

const TALENT_EFFECT_LABEL = {
  damageMult: "伤害倍率",
  attackSpeedMult: "攻击频率",
  projectileSpeedMult: "弹速",
  projectileSizeMult: "弹体尺寸",
  baseDamageFlat: "基础伤害",
  critChanceFlat: "暴击率",
  critDamageMult: "暴击伤害",
  pierceBonus: "穿透层数",
  projectileCountBonus: "额外弹体",
  chainChance: "连锁概率",
  spreadControl: "弹道稳定",
  vsBossMult: "对 Boss 伤害",
  maxHpFlat: "最大生命",
  regenFlat: "每秒回复",
  damageReduction: "减伤",
  shieldMaxFlat: "护盾上限",
  shieldRegenFlat: "护盾回复",
  thornsFlat: "反伤",
  dodgeFlat: "闪避率",
  lowHpDamageBoost: "低血增伤",
  reviveCharge: "复活次数",
  xpGainMult: "经验获取",
  soulGainMult: "灵魂获取",
  pickupRadiusFlat: "拾取范围",
  chestChance: "宝箱概率",
  startXp: "开局经验",
  rareSkillChance: "稀有技能概率",
  soulOnLevelup: "升级额外灵魂",
  startHealOrb: "开局治疗球",
  metaBonusAll: "全局加成",
};

function formatTalentEffect(effect) {
  const key = effect?.key ?? "";
  const value = effect?.value ?? 0;
  const label = TALENT_EFFECT_LABEL[key] ?? key;
  const percentKeys = new Set([
    "damageMult",
    "attackSpeedMult",
    "projectileSpeedMult",
    "projectileSizeMult",
    "critChanceFlat",
    "critDamageMult",
    "chainChance",
    "vsBossMult",
    "damageReduction",
    "dodgeFlat",
    "lowHpDamageBoost",
    "xpGainMult",
    "soulGainMult",
    "chestChance",
    "rareSkillChance",
    "metaBonusAll",
  ]);
  if (percentKeys.has(key)) {
    return `${label} +${Math.round(value * 100)}%`;
  }
  if (key === "regenFlat" || key === "shieldRegenFlat") {
    return `${label} +${value.toFixed(2)}`;
  }
  return `${label} +${value}`;
}

export function createUIController({ state, elements, actions }) {
  const talentTree = getTalentTreeByBranch();
  const doctrines = getDoctrineOptions();
  const contracts = getContractOptions();
  let lastLevelupToken = "";
  let lastLoadoutToken = "";
  let lastTalentToken = "";

  elements.startBtn.addEventListener("click", actions.onStart);
  elements.restartBtn.addEventListener("click", actions.onRestart);
  elements.backMenuBtn.addEventListener("click", actions.onBackMenu);
  elements.resumeBtn.addEventListener("click", actions.onResume);
  elements.talentBtn.addEventListener("click", actions.onOpenTalentScreen);
  elements.closeTalentBtn.addEventListener("click", actions.onCloseTalentScreen);
  elements.rerollBtn.addEventListener("click", actions.onRerollLevelup);
  elements.mobilePauseBtn.addEventListener("click", actions.onTogglePause);
  elements.mobileConfirmBtn.addEventListener("click", actions.onConfirm);

  function renderLoadoutSelection() {
    elements.doctrineOptions.innerHTML = "";
    elements.contractOptions.innerHTML = "";

    const selectedDoctrine = state.save.selectedDoctrine;
    const selectedContract = state.save.selectedContract;

    for (const doctrine of doctrines) {
      const button = document.createElement("button");
      button.className = `pick-item${doctrine.id === selectedDoctrine ? " active" : ""}`;
      button.innerHTML = `
        <strong>${doctrine.name}</strong>
        <span class="meta">${doctrine.tagline}</span>
        <span class="tradeoff">${doctrine.summary}</span>
      `;
      button.addEventListener("click", () => actions.onSelectDoctrine(doctrine.id));
      elements.doctrineOptions.appendChild(button);
    }

    for (const contract of contracts) {
      const button = document.createElement("button");
      button.className = `pick-item${contract.id === selectedContract ? " active" : ""}`;
      button.innerHTML = `
        <strong>${contract.name}</strong>
        <span class="meta">风险：${contract.risk}</span>
        <span class="tradeoff">收益：${contract.reward}</span>
      `;
      button.addEventListener("click", () => actions.onSelectContract(contract.id));
      elements.contractOptions.appendChild(button);
    }
  }

  function renderLevelupOptions(run) {
    elements.levelupOptions.innerHTML = "";

    let optionIndex = 0;
    for (const skillId of run.levelup.choices) {
      const payload = getSkillOptionPayload(run, skillId);
      if (!payload) {
        continue;
      }
      optionIndex += 1;

      const button = document.createElement("button");
      button.className = "btn option-btn";
      if (payload.rarity === "rare") {
        button.classList.add("option-rare");
      }
      button.dataset.skillId = payload.id;
      button.innerHTML = `
        <span class="option-key">${optionIndex}</span>
        <strong>${payload.name} Lv.${payload.nextLevel}/${payload.maxLevel}</strong>
        <small>${payload.category} · ${payload.rarity === "rare" ? "稀有模块" : "常规模块"}</small>
        <small>${payload.desc}</small>
        <small class="option-synergy">已解锁进化：${payload.evolvedCount}</small>
      `;
      button.addEventListener("click", () => actions.onChooseLevelup(payload.id));
      elements.levelupOptions.appendChild(button);
    }

    const evolutions = getEvolutionList(run)
      .map((item) => `${item.unlocked ? "[已解锁]" : "[待解锁]"} ${item.name}：${item.hint}`)
      .join("<br>");

    const footer = document.createElement("p");
    footer.className = "option-footer";
    footer.innerHTML = evolutions;
    elements.levelupOptions.appendChild(footer);
  }

  function renderTalentTree() {
    const save = state.save;
    const unlocked = new Set(save.talentNodesUnlocked);
    elements.talentBranches.innerHTML = "";

    for (const branch of TALENT_BRANCHES) {
      const branchElement = document.createElement("section");
      branchElement.className = "talent-branch";
      const title = document.createElement("h3");
      title.textContent = branch;
      branchElement.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "talent-grid";

      const nodes = talentTree[branch] ?? [];
      for (const node of nodes) {
        const button = document.createElement("button");
        button.className = "talent-node btn";
        button.dataset.nodeId = node.id;

        const lockState = canUnlockTalent(save, node.id);
        const isUnlocked = unlocked.has(node.id);
        const canBuy = lockState.ok;

        if (isUnlocked) {
          button.classList.add("unlocked");
          button.disabled = true;
        } else if (!canBuy) {
          button.classList.add("locked");
        }

        button.innerHTML = `
          <strong>${node.name}</strong>
          <div>${formatTalentEffect(node.effect)}</div>
          <div>花费 ${node.cost} · ${isUnlocked ? "已解锁" : canBuy ? "可学习" : lockState.reason}</div>
        `;

        button.addEventListener("click", () => actions.onUnlockTalent(node.id));
        grid.appendChild(button);
      }

      branchElement.appendChild(grid);
      elements.talentBranches.appendChild(branchElement);
    }
  }

  function refreshHUD() {
    const run = state.run;
    elements.hudTime.textContent = formatTime(run.time);
    elements.hudScore.textContent = `分数 ${run.score}`;
    elements.hudFps.textContent = `FPS ${Math.round(run.quality.avgFps)} (${run.quality.label})`;
    elements.hudLevel.textContent = `Lv.${run.progression.level}`;
    elements.hudXp.textContent = `XP ${run.progression.xp} / ${run.progression.xpToNext}`;
    elements.hudSoul.textContent = `灵魂点 ${state.save.metaCurrency}`;
    elements.hudLoadout.textContent = `${run.ui.doctrineName || "流派未选"} / ${run.ui.contractName || "无契约"} / 热度 ${Math.round(run.feedback.heat * 100)}%`;

    const hpRatio = Math.max(0, Math.min(1, run.player.hp / run.player.maxHp));
    elements.hpFill.style.width = `${hpRatio * 100}%`;

    const shieldRatio = run.player.shieldMax > 0 ? Math.max(0, Math.min(1, run.player.shield / run.player.shieldMax)) : 0;
    elements.shieldFill.style.width = `${shieldRatio * 100}%`;
  }

  function refreshOverlays() {
    const run = state.run;

    toggle(run.mode === "menu", elements.startScreen);
    toggle(run.mode === "levelup", elements.levelupScreen);
    toggle(run.mode === "paused", elements.pauseScreen);
    toggle(run.mode === "talent", elements.talentScreen);
    toggle(run.mode === "gameover" || run.mode === "victory", elements.endScreen);

    if (run.mode === "levelup") {
      const token = `${run.progression.level}|${run.levelup.rerolls}|${run.levelup.choices.join(",")}`;
      if (token !== lastLevelupToken) {
        renderLevelupOptions(run);
        lastLevelupToken = token;
      }
      elements.rerollBtn.textContent = `重抽（${run.levelup.rerolls}）`;
      elements.rerollBtn.disabled = run.levelup.rerolls <= 0;
    } else {
      lastLevelupToken = "";
    }

    if (run.mode === "talent") {
      const token = `${state.save.metaCurrency}|${(state.save.talentNodesUnlocked ?? []).join(",")}`;
      if (token !== lastTalentToken) {
        renderTalentTree();
        lastTalentToken = token;
      }
      elements.talentHint.textContent = state.uiState.talentHint || "提示：优先学习每个分支第一层，再向高层推进。";
    } else {
      lastTalentToken = "";
      elements.talentHint.textContent = "";
    }

    if (run.mode === "menu") {
      const token = `${state.save.selectedDoctrine}|${state.save.selectedContract}`;
      if (token !== lastLoadoutToken) {
        renderLoadoutSelection();
        lastLoadoutToken = token;
      }
    } else {
      lastLoadoutToken = "";
    }

    if (run.mode === "gameover" || run.mode === "victory") {
      elements.endTitle.textContent = run.mode === "victory" ? "胜利" : "失败";
      const soulGain = run.ui.rewardSoul ?? 0;
      elements.endSummary.textContent = `生存时间 ${formatTime(run.time)} · 击杀 ${run.kills} · 分数 ${run.score} · 灵魂点 +${soulGain}`;
    }

    elements.talentCurrency.textContent = `灵魂点 ${state.save.metaCurrency}`;
  }

  function update() {
    refreshHUD();
    refreshOverlays();
  }

  return {
    update,
    renderTalentTree,
  };
}
