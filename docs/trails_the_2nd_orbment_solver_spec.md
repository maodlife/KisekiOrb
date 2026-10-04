# 《空之轨迹 the 2nd》导力器魔法约束求解器 — 本地 Web App 规格说明书

> 当前实现更新（2026-10-04）：正式项目使用官方 z3-solver 5.2.0 WebAssembly，在浏览器 Worker 中按总时间预算逐步增加额外魔法。以下早期规划中的字典序、多目标排序和 DFS 建议已由第 13、18 节的当前实现取代。


**英文工作名：** Orbment / Quartz / Arts Constraint Solver  
**文档性质：** Product & Engineering Specification  
**目标读者：** 后续使用 ChatGPT Codex 进行实现的开发者 / Agent  
**版本：** v0.1（基于当前讨论冻结核心需求）

---

## 1. 项目概述

本项目要实现一个运行在本机的 Web App，用来解决《空之轨迹 the 2nd》重制版中的导力器（Orbment）配装问题。

它不是攻略站，也不是“根据章节自动推断玩家拥有什么”的进度工具，而是一个**由玩家手动维护当前资源状态，并基于角色导力器连线、槽位升级状态、Quartz 库存与商店可购情况，对目标 Arts 进行约束求解的配装工具**。

核心问题可表述为：

> 在指定角色的物理 Slot / Line 拓扑、当前 Slot 等级、可选 Slot 升级、已拥有 Quartz、当前商店可购买 Quartz 的条件下，寻找一组合法 Quartz 配置，使指定的 Must-have Arts 全部被解锁；必要时允许把“升级某些 Slot”和“购买某些 Quartz”一并纳入解空间，并按照用户指定偏好对合法方案排序。

### 1.1 核心设计原则

1. **资源状态由玩家直接输入，不依赖章节。**
2. **物理 Slot 是一等对象；Line 只引用 Slot。** 一个 Slot 可以属于多条 Line，从而自然表达公共节点。
3. **Slot 升级既可以是固定输入，也可以成为求解变量。**
4. **Quartz 来源至少分为 Owned 与 Shop Available。**
5. **Must-have Arts 是硬约束。**
6. **在满足硬约束后，再用购买成本、Slot 升级数量、角色属性、额外 Arts 数量等软目标排序。**
7. **本地优先。** 用户数据与游戏数据库默认存本机，不依赖云服务。

---

## 2. 范围

### 2.1 MVP 必须实现

- 管理角色与其 7 个物理 Slot。
- 管理每个角色的 Line 拓扑；同一 Slot 可同时属于任意多条 Line。
- 记录每个 Slot：当前升级等级、最大允许等级、属性限制（如有）。
- 管理 Quartz 数据：名称、系列/互斥族、等级需求、元素值、装备效果、数量相关信息。
- 管理 Arts 数据：名称、各元素发动条件、其它展示信息。
- 维护玩家当前拥有 Quartz 数量（Owned Count）。
- 维护当前商店可购买哪些 Quartz（Shop Available），可选记录价格。
- 求解时可切换：
  - 只使用 Owned；
  - 使用 Owned + Shop Available。
- 求解时可勾选哪些 Slot 允许升级，并设置允许升级到的最大等级。
- 求解时可勾选一个或多个 Must-have Arts。
- 自动返回合法 Quartz 配装方案，并明确列出：
  - 每个 Slot 装什么；
  - 哪些 Quartz 需要购买；
  - 哪些 Slot 需要升级；
  - 每条 Line 的元素值；
  - 必须 Arts 由哪条 Line 满足；
  - 额外解锁了哪些 Arts。
- 对结果进行排序，并允许用户选择/调整主要优化目标。
- 所有配置可持久化到本机。

### 2.2 明确不做 / 非目标

- 不根据“序章 / 第一章 / 第二章……”自动推断可获得 Quartz。
- 不强制维护剧情进度。
- 不要求联网才能使用。
- MVP 不要求自动读取游戏存档或内存。
- MVP 不要求自动识别游戏截图。
- MVP 不要求做完整攻略、地图、宝箱、任务或剧情数据库。
- MVP 不需要账号体系、多用户云同步或在线排行榜。

---

## 3. 术语

| 术语 | 定义 |
|---|---|
| Physical Slot | 角色导力器上实际存在的一个槽位。每个角色当前按 7 个物理槽设计。 |
| Line | 用于累计元素值并判定 Arts 的线路。Line 由若干 Physical Slot ID 构成。 |
| Shared Slot | 同一 Physical Slot 被两条或多条 Line 引用时形成的公共节点；无需单独布尔字段。 |
| Slot Level | Slot 当前强化等级，决定其可装备 Quartz 的等级上限等规则。 |
| Quartz | 可装备在 Slot 中的回路，提供元素值及角色属性/特殊效果。 |
| Owned | 玩家当前实际拥有的 Quartz 及数量。 |
| Shop Available | 当前商店允许购买的 Quartz；与 Owned 独立。 |
| Arts | 通过某条 Line 上元素值达到发动条件后解锁的魔法。 |
| Must-have Arts | 本次求解必须全部解锁的 Arts，属于硬约束。 |
| Build | 一套完整的 Slot 升级决定 + Quartz 分配 + 必要购买行为。 |

---

## 4. 用户工作流

### 4.1 首次准备 / 数据维护

1. 打开本地 Web App。
2. 游戏基础数据中已有角色、Quartz、Arts；若数据不完整，可在“数据管理”页面编辑。
3. 为角色确认或编辑 Orbment：
   - 7 个 Physical Slot；
   - 每个 Slot 的属性限制；
   - 各条 Line 包含哪些 Slot；
   - 公共节点通过重复引用同一 Slot 自然表达。
4. 玩家在“库存 / 商店”页面录入：
   - 每种 Quartz 当前拥有数量；
   - 当前商店是否可购买；
   - 可选：价格、购买上限。
5. 玩家在角色页面录入当前各 Slot 的升级等级。

### 4.2 日常求解

1. 选择角色。
2. 检查当前 Orbment 图和 Slot 等级。
3. 选择 Quartz 来源模式：
   - Owned only；或
   - Owned + Shop。
4. 对每个 Slot 选择：
   - 当前等级固定；或
   - 允许求解器升级，并设置最大允许等级。
5. 勾选 Must-have Arts。
6. 设置尝试时间（1–120 秒，默认 10 秒），目标为尽可能多的额外 Arts。
7. 点击“求解”，初始化完成后开始计算预算。
8. 实时查看改善候选；到时或取消保留当前最佳，证明无法改善时提前结束。
9. 选中方案后，按清单在游戏内执行升级 / 购买 / 配装。

---

## 5. Orbment 数据模型

### 5.1 关键决策：不用 `shared: true/false`

不采用“某 Slot 是否 shared”的布尔建模。共享关系由 Line 对同一个物理 Slot ID 的引用自然决定。

示例：

```json
{
  "characterId": "estelle",
  "slots": [
    { "id": 0, "currentLevel": 2, "restriction": null },
    { "id": 1, "currentLevel": 1, "restriction": null },
    { "id": 2, "currentLevel": 2, "restriction": "Earth" },
    { "id": 3, "currentLevel": 1, "restriction": null },
    { "id": 4, "currentLevel": 2, "restriction": null },
    { "id": 5, "currentLevel": 1, "restriction": null },
    { "id": 6, "currentLevel": 1, "restriction": null }
  ],
  "lines": [
    { "id": "L1", "slots": [0, 1, 2] },
    { "id": "L2", "slots": [0, 3] },
    { "id": "L3", "slots": [0, 4, 5] },
    { "id": "L4", "slots": [0, 4, 6] }
  ]
}
```

上述模型中：

- Slot 0 属于 L1/L2/L3/L4，是四线公共节点；
- Slot 4 属于 L3/L4，是局部公共节点；
- 不需要额外声明任何 `shared` 字段。

### 5.2 Slot 建议字段

```text
id
position / displayPosition
currentLevel
maxGameLevel
restriction
notes
```

求解页面还需要临时参数：

```text
allowUpgrade
solveMaxLevel
upgradeCostByTargetLevel (可选)
```

注意：`allowUpgrade` 与 `solveMaxLevel` 更适合属于“求解请求 / 玩家状态”，而不是静态角色模板。

---

## 6. Quartz 数据模型

建议至少包含：

```json
{
  "id": "mind_3",
  "name": "精神3",
  "family": "mind",
  "quartzLevel": 3,
  "elements": {
    "earth": 0,
    "water": 3,
    "fire": 0,
    "wind": 0,
    "time": 0,
    "space": 0,
    "mirage": 0
  },
  "stats": {
    "ats": 0,
    "spd": 0
  },
  "tags": [],
  "uniqueEquip": false,
  "notes": ""
}
```

### 6.1 玩家资源状态必须独立存储

```json
{
  "quartzId": "mind_3",
  "ownedCount": 1,
  "shopAvailable": true,
  "shopPrice": 1000,
  "shopPurchaseLimit": null
}
```

理由：游戏基础数据与玩家当前状态不是一回事。后续更新基础数据库时，不应覆盖玩家的库存信息。

### 6.2 数量而非布尔值

Owned 必须是 `count`，不能只有“拥有 / 不拥有”。求解器需要防止同一颗实际只有 1 个的 Quartz 被同时分配给多个 Slot。

若商店可无限购买，可令 `shopPurchaseLimit = null`；若商店有库存限制，则设置具体数量。

---

## 7. Arts 数据模型

```json
{
  "id": "la_tearial",
  "name": "La Tearial",
  "requirements": {
    "earth": 0,
    "water": 6,
    "fire": 0,
    "wind": 3,
    "time": 0,
    "space": 3,
    "mirage": 0
  },
  "epCost": 0,
  "category": "heal",
  "notes": ""
}
```

一个 Art 被解锁的条件：**至少存在一条 Line，使该 Line 的所有元素累计值均满足此 Art 的 requirements。**

多个 Must-have Arts 不要求由同一条 Line 满足。

---

## 8. 求解请求模型

一次求解请求应当显式包含以下内容：

```json
{
  "characterId": "estelle",
  "resourceMode": "owned_plus_shop",
  "slotPolicies": {
    "0": { "currentLevel": 2, "allowUpgrade": true, "maxLevel": 3 },
    "1": { "currentLevel": 1, "allowUpgrade": false, "maxLevel": 1 }
  },
  "mustHaveArts": ["art_a", "art_b", "art_c"],
  "requiredQuartz": [],
  "forbiddenQuartz": [],
  "ranking": [
    "min_slot_upgrades",
    "min_purchased_quartz",
    "max_extra_arts"
  ],
  "maxResults": 50
}
```

### 8.1 后续可扩展但非 MVP 必需

- Required Quartz：指定某颗 Quartz 必须装备。
- Forbidden Quartz：禁止使用某颗 Quartz。
- Pin Slot：指定某个 Quartz 必须放在某个 Slot。
- 保留当前装备，尽量少换装。
- 总预算上限。
- 某种资源 / 稀有 Quartz 的使用上限。
- 最低 ATS / SPD / HP 等属性要求。

这些字段建议在数据结构上预留，但不必阻塞 MVP。

---

## 9. 硬约束

每个返回 Build 必须满足全部硬约束。

### C-01 Slot 唯一装备

每个 Physical Slot 最多装备一个 Quartz。

### C-02 Quartz 数量

在 `owned_only` 模式下：

```text
某 Quartz 在全部 Slot 中的使用数量 <= ownedCount
```

在 `owned_plus_shop` 模式下：

```text
使用数量 <= ownedCount + 可购买数量
```

超出 `ownedCount` 的部分计入 `purchaseCount`。

### C-03 商店可购性

若某 Quartz 不在 Owned 中且 `shopAvailable = false`，则不得通过购买获得。

### C-04 Slot 等级

某 Slot 上 Quartz 的等级要求必须 <= 该 Build 中该 Slot 的最终等级。

### C-05 Slot 升级权限

- `allowUpgrade = false`：最终等级必须等于当前等级；
- `allowUpgrade = true`：最终等级范围为 `[currentLevel, maxLevel]`。

### C-06 Slot 属性限制

若游戏存在元素锁槽等规则，Quartz 必须符合该 Physical Slot 的 restriction。

### C-07 Quartz 互斥 / Family 规则

按实际游戏规则实现同系列互斥、唯一装备、Blade / Shield 等特殊约束。此部分应数据驱动，不应把具体名字硬编码进求解算法。

已确认的刃、盾、理系规则：按回路名称中的「之刃」「之盾」「之理」后缀分类，每类在中央插槽和每条结晶线上分别最多装备一颗。中央插槽不占用线路名额，但继续向引用它的线路贡献元素值；其它共享槽同时占用其所属各条线路的名额。三个类别互不排斥，此限制也适用于商店购买的回路。

角色用可选字段 `centralSlotId` 标明中央物理槽 ID（`null` 表示没有中央槽）；旧数据缺少该字段时，仅兼容识别唯一处于 `(50, 50)` 的槽，不以「被多条线路引用」推断中央槽。

### C-08 Must-have Arts

对每一个 Must-have Art：

```text
exists line in character.lines:
    line.elementTotals satisfies art.requirements
```

所有 Must-have Arts 都必须满足，否则 Build 非法。

---

## 10. Line 元素计算

对每条 Line：

```text
LineElements[line][element]
    = sum(Quartz[assignment[slot]].elements[element]
          for slot in line.slots)
```

因为同一 Physical Slot 可被多条 Line 引用，放在公共节点上的 Quartz 会自然地对所有相关 Line 贡献元素值。

示例：

```text
Slot 0 = Quartz A：水 3 / 空 2
Slot 1 = Quartz B：水 3
Slot 2 = Quartz C：风 3 / 空 1

L1 = [0, 1]
L2 = [0, 2]

L1 = 水 6 / 空 2
L2 = 水 3 / 风 3 / 空 3
```

---

## 11. Slot 升级作为求解变量

这是本项目与普通配装计算器的重要区别。

每个 Slot 有：

```text
currentLevel
allowUpgrade
maxLevel
```

如果允许升级，求解器可选择一个 `finalLevel`，从而使更高等级 Quartz 成为可用候选。

结果必须明确告诉用户：

```text
Slot 3：Lv1 → Lv2
Slot 6：不升级
```

### 11.1 排序中对升级进行惩罚

默认不应为了“多一个无关魔法”随意升级所有 Slot。因此建议把：

```text
slotUpgradeSteps = Σ(finalLevel - currentLevel)
upgradedSlotCount = count(finalLevel > currentLevel)
```

作为可排序成本。

若未来录入每级升级消耗，还可以加入：

```text
slotUpgradeResourceCost
```

---

## 12. 购买作为求解变量

在 `owned_plus_shop` 模式下，如果某 Build 使用的 Quartz 数量超过 Owned Count，则差额视为购买。

例：

```text
精神2：Owned = 1，Shop = 可购买
Build 使用 2 个
=> purchaseCount(精神2) = 1
```

结果中应显示购物清单：

```text
需要购买
- 精神2 ×1
- 驱动2 ×1

预计购买成本：xxxx（若数据库提供价格）
```

---

## 13. 限时增量求解与候选展示

1. 先求满足全部硬约束的合法 Build。
2. 每获得一个候选，将额外 Arts 的最低数量提高为当前最佳数量加一。
3. 复用 Z3 Solver 继续求解，候选实时显示。
4. 在总尝试时间上限或取消时保留最佳；更高数量 unsat 时提前结束，证明额外 Arts 数量最优。

时间可输入 1–120 秒，默认 10 秒。预算包括模型构建和全部检查，首次下载和初始化不占预算。超时未找到候选应返回未完成，不能判作无解。

保存最多 20 个改善候选，并继续搜索。按额外 Arts 数量递减显示。购买成本、升级数量和 ATS/SPD 用于比较，不保证最优；不使用 Optimize 多层目标，也不把槽位编号排列作为优化目标。

---

## 14. 结果模型与展示

每个 Build 至少包含：

```json
{
  "assignments": {
    "0": "quartz_a",
    "1": "quartz_b"
  },
  "slotFinalLevels": {
    "0": 3,
    "1": 1
  },
  "purchases": {
    "quartz_a": 1
  },
  "lineTotals": {
    "L1": { "water": 6, "space": 3 },
    "L2": { "time": 7, "space": 7 }
  },
  "artWitness": {
    "art_a": "L1",
    "art_b": "L2"
  },
  "unlockedArts": ["art_a", "art_b", "art_extra"],
  "metrics": {
    "upgradeSteps": 1,
    "purchasedCount": 1,
    "purchaseCost": 1000,
    "extraArtsCount": 1
  }
}
```

### 14.1 结果卡片必须直观回答四件事

1. **装什么？**
2. **要买什么？**
3. **要升级哪里？**
4. **为什么这些 Must-have Arts 能出来？**

示意：

```text
方案 #1

需要升级
- Slot 3：Lv2 → Lv3

需要购买
- 精神3 ×1
- 省EP2 ×1

配装
- Slot 1：驱动2
- Slot 2：精神3
- ...

Must-have Arts
✓ La Tearal — Line 2
✓ Zodiac — Line 3
✓ Clock Up — Line 1

额外解锁 Arts：18
```

---

## 15. UI / 页面规格

### 15.1 Navigation

建议 MVP 使用 4 个主要页面：

1. **Solver** — 日常主要使用页面；
2. **Inventory** — Owned / Shop 状态；
3. **Characters / Orbment** — 角色、Slot 等级、Line 图；
4. **Game Data** — Quartz / Arts 基础数据维护与导入导出。

### 15.2 Solver 页面

#### A. 角色区域

- Character 下拉选择。
- 立即显示该角色 Orbment 图。

#### B. Orbment 图

建议用 SVG / Canvas / HTML absolute positioning 绘制，要求：

- 清晰显示 7 个 Physical Slot；
- Line 以线段连接；
- 公共节点视觉上只有一个 Slot；
- 每个 Slot 显示当前等级；
- 点击 Slot 可打开求解策略：
  - 当前等级；
  - Allow Upgrade；
  - Max Level。

示意：

```text
             [③ Lv2]
                 │
[② Lv1] ── [① Lv3] ── [④ Lv2]
                 │
             [⑤ Lv2]
              /     \
        [⑥ Lv1]   [⑦ Lv1]
```

#### C. Resource Mode

```text
Quartz 来源
(●) 只使用已拥有
( ) 已拥有 + 当前商店可购买
```

#### D. Must-have Arts

- 支持搜索；
- 支持按元素 / 类型筛选；
- Checkbox 多选；
- 已选项固定显示在顶部或右侧。

#### E. Optimization

MVP 可先提供 preset：

- 最省资源；
- 最少升级；
- 最少购买；
- 最大额外 Arts；
- 自定义（后续）。

#### F. Solve

- Solve 按钮；
- 显示搜索状态；
- 若无解，要给出明确“无合法方案”，不能只返回空白。

### 15.3 Inventory 页面

推荐表格：

| Quartz | Owned | Shop | Price | Purchase Limit |
|---|---:|:---:|---:|---:|
| 精神2 | 1 | ✓ | 1000 | ∞ |
| 驱动2 | 0 | ✓ | 1200 | ∞ |
| 稀有回路A | 1 | ✗ | - | - |

功能：

- 搜索 / 过滤；
- 数量加减；
- 批量切换 Shop Available；
- 自动保存。

### 15.4 Characters / Orbment 页面

需要两种状态：

**日常模式：** 修改当前 Slot Level。  
**编辑模板模式：** 编辑 7 个槽的位置、Line 成员、restriction 等静态角色数据。

Line 编辑优先追求可靠，不要求 MVP 做复杂拖线编辑器；可以先用：

```text
Line 1: [Slot 0] [Slot 1] [Slot 2]
Line 2: [Slot 0] [Slot 3]
Line 3: [Slot 0] [Slot 4] [Slot 5]
```

显示层再将其绘成图。

---

## 16. 本地持久化

建议逻辑上至少分成两类数据：

### 16.1 Game Database

- characters
- orbment templates
- quartz definitions
- arts definitions

这些是“游戏规则 / 基础数据”。

### 16.2 Player State

- owned quartz count
- shop availability / price / purchase limit
- character current slot levels
- 最近一次 solver 设置
- 可选：保存的 Builds

这些是“玩家当前状态”。

两者分离是强要求。

### 16.3 存储技术

MVP 可选：

- SQLite（推荐）；或
- JSON 文件（最简单）。

若预计后续数据编辑、查询、迁移较多，优先 SQLite。必须支持导入 / 导出玩家状态，避免数据锁死。

---

## 17. 建议技术架构

Spec 不强制技术栈，但实现应保持求解核心与 UI 解耦。

推荐逻辑分层：

```text
UI / Local Web Frontend
        │
Application Service
        │
Solver Engine  <── pure logic, independently testable
        │
Repositories / Persistence
        │
SQLite / JSON
```

### 17.1 可选实现方案 A：Python 单体本地 Web App

适合快速由 Codex 实现：

- FastAPI + Jinja/HTMX，或 NiceGUI；
- Python Solver；
- SQLite。

优点：开发快、求解逻辑集中、部署简单。

### 17.2 可选实现方案 B：React/Vue + Python API

- React / Vue 前端；
- FastAPI 后端；
- Python Solver；
- SQLite。

优点：Orbment 图、拖拽排序、复杂交互更容易做漂亮；缺点是工程量更大。

### 17.3 重要架构约束

无论选哪种技术栈：

- Solver 不得直接依赖 UI 控件；
- Solver 输入输出应为稳定的数据模型；
- 所有游戏特殊规则尽量数据驱动；
- 必须给 Solver 写单元测试。

---

## 18. Solver 实现建议

当前只有 7 个物理 Slot，问题规模小，但候选 Quartz 数量可能较大，朴素全排列仍会膨胀。

### 18.1 当前实现

使用官方 z3-solver WebAssembly 的普通 Solver（有限布尔与伪布尔约束）。回路是否被选择、线路元素阈值、魔法是否解锁，以及库存、同名/系列互斥和刃盾理配额均交给 Z3 判断。保留中央槽例外和队友装备占用规则。

只有回路候选、逐回路升级成本、全部线路成员及中央槽身份完全相同的物理槽位才合并。将选中的回路确定性还原到具体槽位，避免重复搜索等价排列。每轮按剩余总预算设置超时；取消会中断当前检查并保留已找到的最佳。

### 18.2 Slot Level 搜索

两种可行方式：

- 外层枚举允许的 `finalLevel` 组合，再解 Quartz；
- 将 `finalLevel` 与 Quartz 候选一体化搜索。

由于只有 7 个 Slot，第一版可选更容易验证正确性的方式。

### 18.3 未来可考虑

- OR-Tools CP-SAT；
- ILP / MILP；
- 约束编程库。

但 MVP 不需要为了“高级”而过度复杂化。正确性、可解释性、容易测试优先。

---

## 19. 性能目标

建议 MVP 目标：

- 普通角色 + 数十到百级 Quartz 候选 + 1~5 个 Must-have Arts：典型请求 1 秒级返回；
- 复杂搜索如果超过数秒，应显示可取消的求解状态；
- 返回 Top N，而不是把所有合法 Build 一次性灌给 UI；
- 默认 Top N 可设为 20 或 50。

如果第一版达不到目标，再做剪枝 / 缓存 / CP-SAT 优化，不应先牺牲正确性。

---

## 20. 可解释性要求

本工具不能只输出一个“最优解”。每个方案必须可解释。

至少提供：

- 每个 Must-have Art 的 witness Line；
- 该 Line 的元素总值与该 Art 的需求对照；
- 为什么产生购买；
- 为什么需要升级 Slot；
- 排序指标值。

可选增强：点击某个 Must-have Art 展开：

```text
Zodiac
需求：幻6 / 水3 / 风3 / 空3
满足线路：Line 3
当前：幻7 / 水4 / 风3 / 空5
```

---

## 21. 无解体验

如果没有合法 Build，不应只显示“0 results”。

MVP 至少区分：

```text
未找到满足全部 Must-have Arts 的合法配置。
```

后续可实现诊断：

- 只差哪个 Art；
- 哪个元素门槛无法达到；
- 如果允许某 Slot 升 1 级是否能有解；
- 如果允许购买某颗当前商店不可购 Quartz 是否能有解。

“最近可行方案 / 冲突解释”属于很有价值的 V2 功能。

---

## 22. 数据导入 / 更新

由于游戏数据可能在正式版后补齐或修正，基础数据库应允许更新。

建议支持：

- JSON 导入 / 导出；
- 数据版本号；
- 基础数据更新时保留 Player State；
- 对 character/quartz/art 使用稳定 ID，而不是用显示名称做外键。

不得把玩家 Owned / Shop 状态直接混入官方/攻略数据文件。

---

## 23. 测试要求

### 23.1 Solver 单元测试

至少覆盖：

- 单 Line Arts 解锁；
- 公共 Slot 同时对两条 Line 生效；
- 局部共享节点（只属于部分 Line）；
- 多 Must-have Arts 可由不同 Line 分别满足；
- Owned 数量不足时不能重复使用；
- Shop 模式下能正确产生 purchaseCount；
- Owned-only 模式禁止购买；
- Slot 等级不足时 Quartz 不可装备；
- Allow Upgrade 后可形成新解；
- 不允许升级的 Slot 绝不能被修改；
- restriction 生效；
- Family / unique 规则生效；
- 无解时返回空结果 + 明确状态。

### 23.2 固定小型测试数据

不要一开始只拿完整游戏数据库测试。创建 3~5 个 Quartz、2~3 条 Line、几个 Arts 的 toy dataset，用手算得到答案，以验证 solver 正确性。

---

## 24. MVP 验收标准

### AC-01
玩家可以录入任意 Quartz 的 Owned Count 与 Shop Available。

### AC-02
玩家可以选择角色并看到其 7 Slot Orbment Line 图。

### AC-03
同一 Physical Slot 可以属于多条 Line，且元素贡献在所有相关 Line 中计算正确。

### AC-04
玩家可以记录每个 Slot 当前等级。

### AC-05
在一次求解中，玩家可逐 Slot 指定是否允许升级以及最大允许等级。

### AC-06
玩家可以切换 `Owned only` / `Owned + Shop`，结果严格遵守对应资源限制。

### AC-07
玩家可以选择多个 Must-have Arts；所有返回方案必须解锁全部选中 Arts。

### AC-08
如果只有通过升级 Slot 才能得到合法解，系统能找到该解并明确列出升级清单。

### AC-09
如果只有通过购买 Quartz 才能得到合法解，系统能找到该解并明确列出购买清单。

### AC-10
结果显示每个 Slot 的 Quartz、每条 Line 元素总值、Must-have Art 对应满足线路，以及额外 Arts。

### AC-11
结果可按至少“升级成本 / 购买数量 / 额外 Arts”进行稳定排序。

### AC-12
关闭并重新打开 App 后，玩家库存、商店状态和角色 Slot 当前等级仍然存在。

---

## 25. 建议开发顺序

### Milestone 1 — Domain Model + Solver Core

- Character / Slot / Line；
- Quartz；
- Arts；
- Inventory；
- SolveRequest / Build；
- 手写 toy dataset；
- 单元测试；
- 先从 CLI / test 调用 Solver，不做 UI。

### Milestone 2 — Persistence

- SQLite / JSON；
- Game Data 与 Player State 分离；
- Repository 层；
- 导入 / 导出。

### Milestone 3 — Basic Local Web UI

- Inventory；
- Character + Slot Level；
- Solver：角色 / resource mode / Must-have Arts / Solve；
- 文本 / 表格结果。

### Milestone 4 — Orbment Visual UI

- 绘制 7 Slot + Line；
- 点击 Slot 编辑升级策略；
- 结果在 Orbment 图中直接显示 Quartz。

### Milestone 5 — Optimization & UX

- 排序 preset；
- 购买成本；
- ATS/SPD 等属性优化；
- 保存 Build；
- 无解诊断。

---

## 26. 给 Codex 的实现约束摘要

在开始写代码前，先遵守以下不可改变的核心设定：

1. **不要实现章节系统。** 可用资源由 Owned / Shop 状态直接决定。
2. **不要把 Line 当成独立 Slot 副本。** 必须建模 7 个 Physical Slot，Line 引用 Slot ID。
3. **共享节点不是布尔值。** 一个 Slot 出现在多条 Line 中即表示共享。
4. **玩家库存和游戏基础数据必须分离。**
5. **Owned 必须有数量。**
6. **Slot upgrade 是求解变量之一。** 用户可逐 Slot 决定是否允许升级。
7. **Must-have Arts 是硬约束。** 所有返回解都必须满足全部勾选项。
8. **一个 Art 只需由任意一条 Line 满足；不同 Must-have Arts 可以由不同 Line 满足。**
9. **购买是求解行为。** `Owned + Shop` 模式下，超出 Owned 的使用量自动形成购买清单。
10. **Solver 必须与 UI 解耦并可单元测试。**
11. **先保证正确性与可解释性，再优化搜索速度。**
12. **每个结果必须告诉用户：装什么、买什么、升级什么、目标 Arts 为什么满足。**

---

## 27. 当前待补充的游戏数据

实现框架不应等待全部真实游戏数据齐全。可先用 mock / toy dataset 开发。

后续需要填充 / 校验：

- the 2nd 各角色 7 Slot Orbment 拓扑；
- 每个 Slot 的限制；
- Slot 最大等级及 Quartz 等级兼容规则；
- Quartz 完整元素值 / 系列 / 特殊互斥规则；
- Arts 完整发动条件；
- Quartz 商店价格（如果要做成本优化）；
- Slot 升级成本（如果要做资源成本优化）。

这些属于数据填充工作，不应改变上述核心架构。

---

## 28. 最终产品一句话定义

> 一个完全由玩家当前资源状态驱动的本地 Orbment CSP Solver：用户选择角色、维护 Owned / Shop Quartz、设置 Physical Slot 当前等级与可升级范围、勾选 Must-have Arts；系统同时搜索 Slot 升级、Quartz 配装与必要购买行为，返回可解释、可排序的合法最优方案。
