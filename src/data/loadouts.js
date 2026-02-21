export const DOCTRINES = [
  {
    id: "vanguard",
    name: "前锋压制",
    tagline: "弹幕压制，越打越快",
    summary: "连续开火会叠加压制热度，显著提升攻速并触发压制弹。",
    pros: "+稳定火力曲线",
    cons: "-需要持续输出维持热度",
  },
  {
    id: "ritual",
    name: "血仪狩猎",
    tagline: "慢射高伤，法阵处决",
    summary: "命中积累仪式层数，满层后触发处刑法阵并造成范围爆裂。",
    pros: "+爆发伤害极高",
    cons: "-基础射速较低",
  },
  {
    id: "phantom",
    name: "折跃幻影",
    tagline: "高机动暴击流",
    summary: "冲刺时生成幻影弹幕，暴击与回旋能力强化，节奏更激进。",
    pros: "+机动和暴击峰值",
    cons: "-生存更依赖操作",
  },
];

export const CONTRACTS = [
  {
    id: "none",
    name: "无契约",
    risk: "无额外风险",
    reward: "标准奖励",
    desc: "稳定开局，不改变基础难度。",
  },
  {
    id: "glass_core",
    name: "脆核协议",
    risk: "生命上限 -36%，受击更致命",
    reward: "灵魂点 +42%，分数 +18%",
    desc: "高风险高收益，适合熟练走位玩家。",
  },
  {
    id: "war_tithe",
    name: "战税条款",
    risk: "敌人速度 +18%，Boss 额外护甲",
    reward: "灵魂点 +55%，稀有技能概率提升",
    desc: "整体压迫更强，回报也更高。",
  },
  {
    id: "scarcity",
    name: "匮乏誓约",
    risk: "升级经验需求 +35%，补给更稀缺",
    reward: "灵魂点 +68%，Boss 击杀额外奖励",
    desc: "构筑节奏更慢，但最终收益最大。",
  },
];

export const DOCTRINE_BY_ID = Object.fromEntries(DOCTRINES.map((item) => [item.id, item]));
export const CONTRACT_BY_ID = Object.fromEntries(CONTRACTS.map((item) => [item.id, item]));
