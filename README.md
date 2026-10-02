# KisekiOrb

《空之轨迹 the 2nd》本地导力器（Orbment）与魔法（Arts）约束求解器。

## 本地运行

需要 Node.js 22+ 与 pnpm：

```bash
cd webapp
pnpm install
pnpm dev
```

打开终端中显示的 `http://localhost:3000/`。所有游戏数据与玩家状态均保存在当前浏览器的 `localStorage`，不需要账号或网络服务。

## 校验

```bash
cd webapp
pnpm test
pnpm lint
pnpm build
```

内置数据来自 `docs/game_screenshots/` 中的游戏截图，包括 4 名角色的导力器、100 个结晶回路与 70 个魔法。Web App 会直接读取以下 JSON：

- `webapp/data/characters.json`
- `webapp/data/quartz.json`
- `webapp/data/arts.json`
- `webapp/data/default-resources.json`

截图未显示的回路装备等级、唯一装备与系列互斥规则保留为 `null`，不会凭空施加限制。默认库存取自截图“未装备/总数”中的总数；截图没有商店信息，因此默认全部标记为不可购买且价格未知。

这些数据仍可在「游戏数据」页面编辑，或通过 JSON 导入完整数据库。库存、商店状态和角色当前槽位等级与基础数据库分开存储。如果浏览器中已有旧示例或自定义数据，应用会优先保留本地数据；可在「游戏数据」页面点击「恢复截图数据」显式切换到本次生成的数据库。
