import { ArrowRight, BookOpen, Check, Database, Gem, Users } from 'lucide-react';

type Destination = 'inventory' | 'characters' | 'solver' | 'data';

const basePath = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true'
  ? (process.env.NEXT_PUBLIC_BASE_PATH ?? '/KisekiOrb')
  : '';

const steps = [
  { id: 'inventory', title: '设置库存与商店' },
  { id: 'character', title: '确认角色与槽位' },
  { id: 'constraints', title: '选择求解约束' },
  { id: 'results', title: '求解、查看与装备' },
  { id: 'backup', title: '导出与导入数据' },
];

const screenshotSizes: Record<string, [number, number]> = {
  'inventory.png': [1600, 750],
  'character.png': [1600, 900],
  'required-quartz.png': [1244, 640],
  'required-arts.png': [1600, 950],
  'results.png': [1600, 800],
  'backup.png': [1600, 320],
};

function GuideFigure({ file, alt, caption }: { file: string; alt: string; caption: string }) {
  const [width, height] = screenshotSizes[file];
  return <figure className="guide-figure">
    <a href={`${basePath}/guide/${file}`} target="_blank" rel="noreferrer" aria-label={`查看大图：${alt}`}>
      <img src={`${basePath}/guide/${file}`} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
    </a>
    <figcaption>{caption} <span>点击图片可查看大图</span></figcaption>
  </figure>;
}

export function UsageGuide({ onNavigate }: { onNavigate: (destination: Destination) => void }) {
  return <article className="usage-guide">
    <section className="panel guide-intro">
      <div className="guide-intro-icon"><BookOpen size={26} /></div>
      <div>
        <p className="step">第一次使用，从这里开始</p>
        <h2>把想要的魔法，变成可执行的配装</h2>
        <p>先告诉求解器你有哪些回路、角色的槽位情况，再选择必须装备的回路或必须获得的魔法。求解器会在满足这些条件的基础上，尝试获得更多额外魔法。</p>
        <div className="guide-intro-actions">
          <button className="guide-action" onClick={() => onNavigate('inventory')}><Gem size={16} />从设置库存开始<ArrowRight size={15} /></button>
          <span><Check size={14} />修改会自动保存在当前浏览器</span>
        </div>
      </div>
    </section>

    <nav className="guide-contents" aria-label="使用说明目录">
      {steps.map((step, index) => <a key={step.id} href={`#guide-${step.id}`}><span>{String(index + 1).padStart(2, '0')}</span>{step.title}</a>)}
    </nav>

    <section id="guide-inventory" className="panel guide-section">
      <div className="guide-section-heading"><span className="guide-number">01</span><div><p className="step">准备资源</p><h2>设置库存与商店</h2></div><button className="guide-action secondary" onClick={() => onNavigate('inventory')}>打开库存与商店<ArrowRight size={15} /></button></div>
      <ol className="guide-instructions">
        <li>在左侧打开「库存与商店」，按元素系列展开分组，或搜索回路名称。</li>
        <li>将「可用/拥有」右侧的数量改成你实际拥有的总数，包含已装备在角色身上的回路。左侧的可用数由系统扣除全部已装备数量后计算。</li>
        <li>如果希望规划购买，打开对应回路的「商店」开关，填写价格和购买上限；上限留空表示不限购。价格未知时可以留空，求解结果也无法给出这部分的准确费用。</li>
      </ol>
      <div className="guide-note"><Gem size={18} /><p><b>默认库存是示例。</b>初始数量来自项目内置的游戏截图，并不代表你的存档；默认所有回路都不可购买。先核对库存，再用求解结果安排配装。</p></div>
      <GuideFigure file="inventory.png" alt="库存与商店页面，展示可用和拥有数量、商店开关、价格及购买上限" caption="在右侧编辑总拥有数；商店可购、价格和限购数量分别设置。" />
    </section>

    <section id="guide-character" className="panel guide-section">
      <div className="guide-section-heading"><span className="guide-number">02</span><div><p className="step">确认角色状态</p><h2>确认角色与槽位</h2></div><button className="guide-action secondary" onClick={() => onNavigate('characters')}>打开角色导力器<ArrowRight size={15} /></button></div>
      <ol className="guide-instructions">
        <li>打开「角色导力器」，选择要配装的角色，将各槽位的「当前等级」改成游戏中的实际等级。</li>
        <li>内置角色已有导力器线路和属性限制。需要修正或新增角色时，可以编辑最高等级、属性限制、中央插槽和线路成员；同一个物理槽可以被多条线路引用。</li>
        <li>返回「求解器」并选择同一角色。点击导力器图中的槽位，可以单独开启「允许升级」并设置最高等级；未开启时，只使用当前等级。</li>
      </ol>
      <div className="guide-note"><Users size={18} /><p><b>当前等级和允许升级是两件事。</b>当前等级记录实际状态；允许升级让求解器规划升级方案。每次切换角色或重新载入页面后，请重新确认各槽位的升级策略。</p></div>
      <GuideFigure file="character.png" alt="角色导力器页面，展示角色选择、线路图和每个槽位的当前等级、最高等级与属性限制" caption="先确认角色的实际槽位等级，再到求解器中设置是否允许升级。" />
    </section>

    <section id="guide-constraints" className="panel guide-section">
      <div className="guide-section-heading"><span className="guide-number">03</span><div><p className="step">告诉求解器你的目标</p><h2>选择求解约束</h2></div><button className="guide-action secondary" onClick={() => onNavigate('solver')}>打开求解器<ArrowRight size={15} /></button></div>
      <p>在「求解器」中，依次确认「01 · 选择角色」和槽位策略，再设置下面的条件。</p>
      <div className="guide-table-wrap"><table className="guide-table"><caption>「02 · 回路来源」如何选择</caption><thead><tr><th scope="col">来源模式</th><th scope="col">适用情况与规则</th></tr></thead><tbody>
        <tr><th scope="row">只使用可用</th><td>保持队友配装。扣除队友已装备的回路，当前角色的回路可以复用。</td></tr>
        <tr><th scope="row">只使用已拥有</th><td>按总拥有数规划，包含队友装备的回路；实际装备前可能需要让队友脱下。</td></tr>
        <tr><th scope="row">已拥有 + 商店</th><td>允许规划购买已标记可购的回路，遵守购买上限；不会自动增加库存。</td></tr>
      </tbody></table></div>
      <ol className="guide-instructions">
        <li>在「03 · 必须回路」中搜索并勾选想保留的回路。每项显示「可使用」数量（扣除队友装备，包含当前角色可复用的回路）与「当前库存」（总拥有数）。每个选中的种类都必须装备一颗，放在哪个槽位由求解器安排。</li>
        <li>在「04 · 必须魔法」中勾选目标魔法，可按分组展开、折叠或搜索。所选魔法都必须满足线路元素需求。</li>
        <li>必须回路和必须魔法可以只选一种，也可以同时选择；至少选一项，才能开始求解。已有默认魔法时，可点各选择区的「清空」后重新选择。</li>
        <li>在「05 · 求解目标与时间」中设置 1–120 秒的整数，默认 10 秒。目标为「尽可能多的额外魔法」。</li>
      </ol>
      <GuideFigure file="required-quartz.png" alt="必须回路选择区，搜索精神并勾选精神2回路" caption="示例：搜索「精神」，勾选「精神2」，要求每个候选方案都装备这颗回路。" />
      <GuideFigure file="required-arts.png" alt="必须魔法选择区，搜索并勾选水蓝升华，下面显示求解目标、尝试时间和开始求解按钮" caption="示例：选择必须获得的「水蓝升华」，设定尝试时间后点击「开始求解」。" />
    </section>

    <section id="guide-results" className="panel guide-section">
      <div className="guide-section-heading"><span className="guide-number">04</span><div><p className="step">将结果用到配装中</p><h2>求解、查看与装备</h2></div></div>
      <ol className="guide-instructions">
        <li>点击「开始求解」。首次会加载约 35 MB 的求解器并初始化，这段时间不计入尝试时间；之后配装计算在浏览器中进行。</li>
        <li>向下查看结果。求解器先寻找满足全部约束的方案，再持续增加额外魔法。到时或点击「取消」会保留已经找到的最佳方案。</li>
        <li>点击候选方案展开，查看导力器图、配装清单、购买和升级步骤，以及各条线路如何满足必须魔法。</li>
        <li>点击方案旁的「装备」，会更新网站中当前角色的整套回路与槽位等级，再按清单到游戏里操作。装备会占用可用库存，总拥有数保持不变。</li>
        <li>若回路尚未购买或被队友占用，先在「库存与商店」补充实际库存，或在「角色导力器」让队友脱下对应回路，再重新求解并装备。</li>
      </ol>
      <div className="guide-note"><Check size={18} /><p><b>怎么看“最佳”？</b>候选按额外魔法数量排列，最多显示 20 个改善方案；费用、升级、ATS 和 SPD 供比较，不保证最优。只有提示已证明无法增加数量时，才说明额外魔法数量已最优。</p></div>
      <GuideFigure file="results.png" alt="真实求解结果，展示候选方案、装备按钮、配装清单和必须魔法的线路元素值" caption="展开方案核对回路、等级和需要执行的步骤，再点击「装备」。图中数量仅为示例。" />
    </section>

    <section id="guide-backup" className="panel guide-section">
      <div className="guide-section-heading"><span className="guide-number">05</span><div><p className="step">备份与迁移</p><h2>导出与导入数据</h2></div><button className="guide-action secondary" onClick={() => onNavigate('data')}>打开游戏数据<ArrowRight size={15} /></button></div>
      <ol className="guide-instructions">
        <li>打开「游戏数据」，点击「导出 JSON」，保存下载的 <code>kiseki-orbment-backup.json</code>。</li>
        <li>备份包含游戏数据库、库存与商店、角色槽位等级、装备记录，以及角色、回路来源、必须回路、必须魔法和尝试时间等求解偏好。候选结果与临时允许升级策略不会导出。</li>
        <li>在另一设备、浏览器或站点打开「游戏数据」，点击「导入 JSON」，选择之前导出的备份。导入成功后会替换当前数据并自动保存；建议先导出当前数据再导入。</li>
      </ol>
      <div className="guide-note"><Database size={18} /><p><b>自动保存只针对当前浏览器、当前站点。</b>无需账号，也不会在设备间自动同步。清理浏览器数据、使用无痕窗口或切换域名，都可能需要重新导入备份。「恢复截图数据」会重置本地数据库和玩家状态，使用前请先导出。</p></div>
      <GuideFigure file="backup.png" alt="游戏数据页面顶部，展示导出 JSON、导入 JSON 和恢复截图数据按钮" caption="「游戏数据」顶部提供完整备份的导出、导入和恢复内置数据操作。" />
    </section>

    <section className="panel guide-section guide-faq">
      <p className="step">遇到问题时</p><h2>常见问题</h2>
      <details><summary>为什么「开始求解」不能点击？</summary><p>至少选择一个必须回路或必须魔法，检查尝试时间是否为 1–120 的整数，并等待正在运行的求解结束。</p></details>
      <details><summary>「没有合法方案」和「本次尝试未找到方案」有什么区别？</summary><p>「没有合法方案」表示已证明当前条件无解，可以减少必选目标、调整库存或允许升级；使用商店模式前先设置可购回路。「本次尝试未找到方案」只表示这次没找到，可以增加时间重试。</p></details>
      <details><summary>为什么有方案，却无法装备？</summary><p>「只使用已拥有」可能规划了队友装备的回路，「已拥有 + 商店」可能规划了尚未购买的回路。实际装备始终检查现有可用库存；先脱下队友装备或补充实际库存，再重新求解。</p></details>
      <details><summary>首次加载求解器较慢，怎么办？</summary><p>首次需要下载和初始化求解器，请等待完成。GitHub Pages 首次访问可能自动刷新一次以准备浏览器隔离环境；请通过 HTTPS 使用支持 Service Worker 的现代浏览器。出现失败时查看页面提示后重试。</p></details>
      <details><summary>截图中的数量和我的页面不同？</summary><p>这些配图来自网站实际操作，用来说明控件的位置和操作顺序。你的库存、装备、角色和约束不同，求解结果也会不同。</p></details>
    </section>
  </article>;
}
