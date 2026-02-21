import "./style.css";
import { createGameState, persistSave, recordRunResult, restartRun } from "./game/state";
import { createInputController } from "./game/input";
import { buildRenderTextState, renderGame, resizeCanvas } from "./game/render";
import { beginRun, buildLevelupOptions, rerollLevelupChoices, applyLevelupChoice, updateGameState, updatePerformance } from "./game/update";
import { createUIController } from "./ui/ui";
import { unlockTalent } from "./game/systems/talentSystem";
import { createAudioEngine } from "./game/audio";
import { normalizeContract, normalizeDoctrine } from "./game/systems/loadoutSystem";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d", { alpha: false });

const elements = {
  hudTime: document.getElementById("hud-time"),
  hudScore: document.getElementById("hud-score"),
  hudFps: document.getElementById("hud-fps"),
  hudLevel: document.getElementById("hud-level"),
  hudXp: document.getElementById("hud-xp"),
  hudSoul: document.getElementById("hud-soul"),
  hudLoadout: document.getElementById("hud-loadout"),
  hpFill: document.getElementById("hp-fill"),
  shieldFill: document.getElementById("shield-fill"),
  startScreen: document.getElementById("start-screen"),
  levelupScreen: document.getElementById("levelup-screen"),
  pauseScreen: document.getElementById("pause-screen"),
  endScreen: document.getElementById("end-screen"),
  talentScreen: document.getElementById("talent-screen"),
  startBtn: document.getElementById("start-btn"),
  talentBtn: document.getElementById("talent-btn"),
  doctrineOptions: document.getElementById("doctrine-options"),
  contractOptions: document.getElementById("contract-options"),
  levelupOptions: document.getElementById("levelup-options"),
  rerollBtn: document.getElementById("reroll-btn"),
  resumeBtn: document.getElementById("resume-btn"),
  restartBtn: document.getElementById("restart-btn"),
  backMenuBtn: document.getElementById("back-menu-btn"),
  endTitle: document.getElementById("end-title"),
  endSummary: document.getElementById("end-summary"),
  talentCurrency: document.getElementById("talent-currency"),
  talentHint: document.getElementById("talent-hint"),
  talentBranches: document.getElementById("talent-branches"),
  closeTalentBtn: document.getElementById("close-talent-btn"),
  joystickArea: document.getElementById("joystick-area"),
  joystickStick: document.getElementById("joystick-stick"),
  mobilePauseBtn: document.getElementById("mobile-pause-btn"),
  mobileConfirmBtn: document.getElementById("mobile-confirm-btn"),
};

const state = createGameState();
const inputController = createInputController({ canvas, elements });
const audioEngine = createAudioEngine();

function commitRunRewardIfNeeded() {
  const run = state.run;
  if (run.mode !== "gameover" && run.mode !== "victory") {
    return;
  }
  if (run.ui.rewardsCommitted) {
    return;
  }

  const baseSoul = Math.round(run.time * 0.35 + run.kills * 0.8 + (run.bossKilled ? 140 : 0));
  const skillBonus = Math.round(Object.keys(run.skillLevels).length * 3);
  const contractSoul = run.modifiers.finalBossSoulBonus && run.bossKilled ? run.modifiers.finalBossSoulBonus : 0;
  const totalSoul = Math.max(8, Math.round((baseSoul + skillBonus + contractSoul) * run.player.soulGainMult * run.modifiers.soulRewardMult));

  state.save.metaCurrency += totalSoul;
  persistSave(state.save);

  run.ui.rewardsCommitted = true;
  run.ui.rewardSoul = totalSoul;
  recordRunResult(state, run.mode === "victory");

  if (elements.endSummary) {
    elements.endSummary.textContent = `生存时间 ${Math.floor(run.time)} 秒 · 击杀 ${run.kills} · 灵魂点 +${totalSoul}`;
  }
}

function resetToMenu() {
  restartRun(state, "menu");
}

function togglePause() {
  if (state.run.mode === "playing") {
    state.run.mode = "paused";
  } else if (state.run.mode === "paused") {
    state.run.mode = "playing";
  }
}

function chooseFirstLevelup() {
  const run = state.run;
  if (run.mode !== "levelup") {
    return;
  }
  const first = run.levelup.choices[0];
  if (first) {
    applyLevelupChoice(run, first);
  }
}

const uiController = createUIController({
  state,
  elements,
  actions: {
    onStart: () => beginRun(state),
    onRestart: () => beginRun(state),
    onBackMenu: () => resetToMenu(),
    onResume: () => togglePause(),
    onOpenTalentScreen: () => {
      if (state.run.mode === "menu") {
        state.run.mode = "talent";
      }
    },
    onCloseTalentScreen: () => {
      if (state.run.mode === "talent") {
        state.run.mode = "menu";
      }
    },
    onRerollLevelup: () => rerollLevelupChoices(state.run),
    onTogglePause: () => togglePause(),
    onConfirm: () => chooseFirstLevelup(),
    onChooseLevelup: (skillId) => applyLevelupChoice(state.run, skillId),
    onUnlockTalent: (nodeId) => {
      const result = unlockTalent(state.save, nodeId);
      if (result.ok) {
        persistSave(state.save);
        state.uiState.talentHint = "已学习天赋。";
        uiController.renderTalentTree();
      } else {
        state.uiState.talentHint = result.reason || "暂时无法学习该天赋。";
      }
    },
    onSelectDoctrine: (doctrineId) => {
      state.save.selectedDoctrine = normalizeDoctrine(doctrineId);
      persistSave(state.save);
    },
    onSelectContract: (contractId) => {
      state.save.selectedContract = normalizeContract(contractId);
      persistSave(state.save);
    },
  },
});

function maybeToggleFullscreen() {
  if (!state.run.ui.wantToggleFullscreen) {
    return;
  }
  state.run.ui.wantToggleFullscreen = false;

  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function onResize() {
  resizeCanvas(canvas);
}

window.addEventListener("resize", onResize);
onResize();

function stepSimulation(dt) {
  inputController.update(state.run);
  updateGameState(state, dt);
}

function frame(timestamp) {
  if (!state.lastTimestamp) {
    state.lastTimestamp = timestamp;
  }

  let frameDt = (timestamp - state.lastTimestamp) / 1000;
  state.lastTimestamp = timestamp;
  frameDt = Math.max(0, Math.min(0.05, frameDt));

  updatePerformance(state.run, frameDt);
  state.accumulator += frameDt;

  let guard = 0;
  while (state.accumulator >= state.fixedDt && guard < 8) {
    stepSimulation(state.fixedDt);
    state.accumulator -= state.fixedDt;
    guard += 1;
  }

  maybeToggleFullscreen();
  renderGame(ctx, state, canvas);
  commitRunRewardIfNeeded();
  uiController.update();
  audioEngine.playQueued(state.run.feedback.soundEvents);
  state.run.feedback.soundEvents.length = 0;

  window.requestAnimationFrame(frame);
}

window.requestAnimationFrame(frame);

window.render_game_to_text = () => buildRenderTextState(state.run);
window.restartGame = () => beginRun(state);
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    stepSimulation(state.fixedDt);
  }
  renderGame(ctx, state, canvas);
  uiController.update();
  return buildRenderTextState(state.run);
};

window.__snakeSurvivor = {
  getState: () => state,
  getLevelupOptions: () => buildLevelupOptions(state.run),
};
