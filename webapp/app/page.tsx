'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Check, ChevronDown, CircleDot, Database, Download, Gem, Plus, RotateCcw, Search, Settings2, ShieldCheck, Sparkles, Upload, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DEFAULT_GAME_DATA, createDefaultPlayerState } from '@/lib/default-data.ts';
import { ELEMENTS, ELEMENT_LABELS, emptyElements, type Build, type Character, type ElementKey, type GameData, type PlayerState, type RankingPreset, type ResourceMode, type SlotPolicy, type SolveResult } from '@/lib/domain.ts';
import { solveOrbment } from '@/lib/solver.ts';
import { loadGameData, loadPlayerState, resetLocalData, saveGameData, savePlayerState } from '@/lib/storage.ts';

type View = 'solver' | 'inventory' | 'characters' | 'data';

const VIEW_META: Record<View, { title: string; eyebrow: string }> = {
  solver: { title: '导力器配装求解', eyebrow: 'ARTS CONSTRAINT SOLVER' },
  inventory: { title: '库存与商店', eyebrow: 'PLAYER RESOURCES' },
  characters: { title: '角色导力器', eyebrow: 'ORBMENT TOPOLOGY' },
  data: { title: '游戏数据', eyebrow: 'LOCAL GAME DATABASE' },
};

const RANKING_LABELS: Record<RankingPreset, string> = {
  resource: '最省资源', upgrades: '最少升级', purchases: '最少购买', extra_arts: '最多额外魔法',
};

const makePolicies = (character: Character, player: PlayerState): Record<number, SlotPolicy> => Object.fromEntries(character.slots.map((slot) => {
  const currentLevel = player.slotLevels[character.id]?.[String(slot.id)] ?? slot.currentLevel;
  return [slot.id, { currentLevel, allowUpgrade: false, maxLevel: currentLevel }];
}));

function nonZeroElements(values: Record<ElementKey, number>) {
  return ELEMENTS.filter((element) => values[element] > 0);
}

function ElementSummary({ values, compare }: { values: Record<ElementKey, number>; compare?: Record<ElementKey, number> }) {
  const active = nonZeroElements(values);
  if (!active.length) return <span className="muted">无元素值</span>;
  return <span className="element-list">{active.map((element) => <span key={element} className={`element-token el-${element} ${compare && values[element] < compare[element] ? 'short' : ''}`}>{ELEMENT_LABELS[element]} {values[element]}{compare?.[element] ? ` / ${compare[element]}` : ''}</span>)}</span>;
}

function OrbmentGraph({ character, policies, assignments, quartzNames, activeSlot, onSlot }: { character: Character; policies?: Record<number, SlotPolicy>; assignments?: Record<number, string | null>; quartzNames?: Record<string, string>; activeSlot?: number; onSlot?: (id: number) => void }) {
  return <div className="orbment-stage interactive" aria-label={`${character.name}的七槽导力器图`}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      {character.lines.flatMap((line, lineIndex) => line.slots.slice(1).map((slotId, index) => {
        const from = character.slots.find((slot) => slot.id === line.slots[index]);
        const to = character.slots.find((slot) => slot.id === slotId);
        return from && to ? <line key={`${line.id}-${slotId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`orb-line line-${lineIndex % 4}`} /> : null;
      }))}
    </svg>
    {character.slots.map((slot) => {
      const policy = policies?.[slot.id];
      const quartzId = assignments?.[slot.id];
      const shared = character.lines.filter((line) => line.slots.includes(slot.id)).length > 1;
      return <button key={slot.id} onClick={() => onSlot?.(slot.id)} className={`orb-slot ${shared ? 'core' : ''} ${activeSlot === slot.id ? 'active' : ''} ${quartzId ? 'equipped' : ''}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} aria-label={`槽位${slot.id + 1}`}>
        <span>{slot.id + 1}</span><small>Lv{policy?.currentLevel ?? slot.currentLevel}{policy?.allowUpgrade ? `→${policy.maxLevel}` : ''}</small>{quartzId && <em>{quartzNames?.[quartzId] ?? quartzId}</em>}
      </button>;
    })}
  </div>;
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <span className="metric"><b>{value}</b><small>{label}</small></span>;
}

export default function Home() {
  const [view, setView] = useState<View>('solver');
  const [gameData, setGameData] = useState<GameData>(DEFAULT_GAME_DATA);
  const [player, setPlayer] = useState<PlayerState>(() => createDefaultPlayerState(DEFAULT_GAME_DATA));
  const [hydrated, setHydrated] = useState(false);
  const [characterId, setCharacterId] = useState(DEFAULT_GAME_DATA.characters[0].id);
  const [resourceMode, setResourceMode] = useState<ResourceMode>('owned_plus_shop');
  const [ranking, setRanking] = useState<RankingPreset>('resource');
  const [mustHave, setMustHave] = useState<string[]>(['la_tearial', 'clock_up']);
  const [policies, setPolicies] = useState<Record<number, SlotPolicy>>(() => makePolicies(DEFAULT_GAME_DATA.characters[0], createDefaultPlayerState(DEFAULT_GAME_DATA)));
  const [activeSlot, setActiveSlot] = useState(0);
  const [artSearch, setArtSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [expandedBuild, setExpandedBuild] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const loadedGame = loadGameData();
    const loadedPlayer = loadPlayerState(loadedGame);
    const savedCharacter = loadedGame.characters.find((item) => item.id === loadedPlayer.lastSolver.characterId) ?? loadedGame.characters[0];
    // oxlint-disable-next-line react/react-compiler -- one-time hydration from localStorage
    setGameData(loadedGame); setPlayer(loadedPlayer); setCharacterId(savedCharacter.id);
    setResourceMode(loadedPlayer.lastSolver.resourceMode); setRanking(loadedPlayer.lastSolver.rankingPreset);
    setMustHave(loadedPlayer.lastSolver.mustHaveArts.filter((id) => loadedGame.arts.some((art) => art.id === id)));
    setPolicies(makePolicies(savedCharacter, loadedPlayer)); setActiveSlot(savedCharacter.slots[0]?.id ?? 0); setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) saveGameData(gameData); }, [gameData, hydrated]);
  useEffect(() => { if (hydrated) savePlayerState(player); }, [player, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    // oxlint-disable-next-line react/react-compiler -- persist the latest solver preferences in player state
    setPlayer((current) => ({ ...current, lastSolver: { characterId, resourceMode, mustHaveArts: mustHave, rankingPreset: ranking } }));
  }, [characterId, resourceMode, mustHave, ranking, hydrated]);

  const character = gameData.characters.find((item) => item.id === characterId) ?? gameData.characters[0];
  const quartzNames = useMemo(() => Object.fromEntries(gameData.quartz.map((quartz) => [quartz.id, quartz.name])), [gameData.quartz]);
  const artById = useMemo(() => Object.fromEntries(gameData.arts.map((art) => [art.id, art])), [gameData.arts]);
  const activePolicy = policies[activeSlot];

  const switchCharacter = (id: string) => {
    const next = gameData.characters.find((item) => item.id === id);
    if (!next) return;
    setCharacterId(id); setPolicies(makePolicies(next, player)); setActiveSlot(next.slots[0]?.id ?? 0); setSolveResult(null);
  };

  const patchPolicy = (slotId: number, patch: Partial<SlotPolicy>) => setPolicies((current) => ({ ...current, [slotId]: { ...current[slotId], ...patch } }));
  const toggleArt = (id: string) => setMustHave((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const runSolver = () => {
    setSolving(true); setSolveResult(null);
    window.setTimeout(() => {
      const result = solveOrbment({ character, quartz: gameData.quartz, arts: gameData.arts, resources: player.resources, resourceMode, slotPolicies: policies, mustHaveArts: mustHave, rankingPreset: ranking, maxResults: 20 });
      setSolveResult(result); setExpandedBuild(0); setSolving(false);
      window.setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
    }, 30);
  };

  const updateResource = (id: string, patch: Partial<PlayerState['resources'][string]>) => setPlayer((current) => ({ ...current, resources: { ...current.resources, [id]: { ...(current.resources[id] ?? { quartzId: id, ownedCount: 0, shopAvailable: false, shopPrice: null, shopPurchaseLimit: null }), ...patch } } }));

  const updateSlotLevel = (slotId: number, level: number) => {
    setPlayer((current) => ({ ...current, slotLevels: { ...current.slotLevels, [character.id]: { ...current.slotLevels[character.id], [String(slotId)]: level } } }));
    setPolicies((current) => ({ ...current, [slotId]: { ...current[slotId], currentLevel: level, maxLevel: Math.max(level, current[slotId]?.maxLevel ?? level) } }));
  };

  const patchCharacter = (updated: Character) => setGameData((current) => ({ ...current, characters: current.characters.map((item) => item.id === updated.id ? updated : item) }));

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), gameData, playerState: player }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kiseki-orbment-backup.json'; anchor.click(); URL.revokeObjectURL(url); setNotice('已导出完整本地数据。');
  };

  const importAll = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { gameData?: GameData; playerState?: PlayerState };
      if (!parsed.gameData?.characters || !parsed.gameData.quartz || !parsed.gameData.arts || !parsed.playerState?.resources) throw new Error('invalid');
      setGameData(parsed.gameData); setPlayer(parsed.playerState);
      const nextCharacter = parsed.gameData.characters.find((item) => item.id === parsed.playerState!.lastSolver.characterId) ?? parsed.gameData.characters[0];
      setCharacterId(nextCharacter.id); setPolicies(makePolicies(nextCharacter, parsed.playerState)); setMustHave(parsed.playerState.lastSolver.mustHaveArts); setNotice('导入成功，数据已自动保存。');
    } catch { setNotice('导入失败：文件不是有效的 Orbment 备份。'); }
    event.target.value = '';
  };

  const resetAll = () => {
    resetLocalData(); const freshGame = JSON.parse(JSON.stringify(DEFAULT_GAME_DATA)) as GameData; const freshPlayer = createDefaultPlayerState(freshGame);
    setGameData(freshGame); setPlayer(freshPlayer); setCharacterId(freshGame.characters[0].id); setPolicies(makePolicies(freshGame.characters[0], freshPlayer)); setMustHave(freshPlayer.lastSolver.mustHaveArts); setSolveResult(null); setNotice('已恢复内置示例数据。');
  };

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('solver')}><span className="brand-orb"><Sparkles size={17} /></span><span>Orbment</span></button>
      <nav aria-label="主导航">
        <button className={`nav-item ${view === 'solver' ? 'active' : ''}`} onClick={() => setView('solver')}><CircleDot size={18} /><span>求解器</span></button>
        <button className={`nav-item ${view === 'inventory' ? 'active' : ''}`} onClick={() => setView('inventory')}><Gem size={18} /><span>库存与商店</span></button>
        <button className={`nav-item ${view === 'characters' ? 'active' : ''}`} onClick={() => setView('characters')}><Users size={18} /><span>角色导力器</span></button>
        <button className={`nav-item ${view === 'data' ? 'active' : ''}`} onClick={() => setView('data')}><Database size={18} /><span>游戏数据</span></button>
      </nav>
      <p className="local-note"><span />数据仅保存在此设备</p>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div><p className="eyebrow">{VIEW_META[view].eyebrow}</p><h1>{VIEW_META[view].title}</h1></div>
        <div className="top-actions"><span className="save-state"><ShieldCheck size={14} />{hydrated ? '已自动保存' : '正在读取'}</span>{view !== 'data' && <button className="ghost-button" onClick={() => setView('data')}><Settings2 size={16} />数据设置</button>}</div>
      </header>

      {view === 'solver' && <>
        <div className="solver-grid">
          <section className="panel orbment-panel">
            <div className="panel-heading"><div><p className="step">01 · 选择角色</p><h2>{character.name}</h2></div><NativeSelect value={character.id} onChange={(event) => switchCharacter(event.target.value)} className="character-select" aria-label="选择角色">{gameData.characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></div>
            <OrbmentGraph character={character} policies={policies} activeSlot={activeSlot} onSlot={setActiveSlot} />
            {activePolicy && <div className="slot-policy">
              <div><p className="step">槽位 {activeSlot + 1} 策略</p><b>当前 Lv{activePolicy.currentLevel}</b></div>
              <div className="toggle-row"><button type="button" role="switch" aria-label={`槽位${activeSlot + 1}允许升级`} aria-checked={activePolicy.allowUpgrade} className={`switch-control ${activePolicy.allowUpgrade ? 'on' : ''}`} onClick={() => patchPolicy(activeSlot, { allowUpgrade: !activePolicy.allowUpgrade, maxLevel: !activePolicy.allowUpgrade ? Math.max(activePolicy.currentLevel + 1, activePolicy.maxLevel) : activePolicy.currentLevel })}><span /></button>允许升级</div>
              <label className="inline-field">最高等级 <NativeSelect disabled={!activePolicy.allowUpgrade} value={activePolicy.maxLevel} onChange={(event) => patchPolicy(activeSlot, { maxLevel: Number(event.target.value) })}>{Array.from({ length: character.slots.find((slot) => slot.id === activeSlot)?.maxGameLevel ?? 3 }, (_, index) => index + 1).filter((level) => level >= activePolicy.currentLevel).map((level) => <option key={level} value={level}>Lv{level}</option>)}</NativeSelect></label>
            </div>}
            <div className="legend"><span><i className="legend-dot shared" />共享节点</span><span><i className="legend-dot upgrade" />可升级范围</span><span>点击槽位单独设置</span></div>
          </section>

          <aside className="controls-column">
            <section className="panel compact-panel"><p className="step">02 · 回路来源</p><button className={`radio-row ${resourceMode === 'owned_only' ? 'selected' : ''}`} onClick={() => setResourceMode('owned_only')}><i />只使用已拥有<span>{Object.values(player.resources).filter((item) => item.ownedCount > 0).length} 种可用</span></button><button className={`radio-row ${resourceMode === 'owned_plus_shop' ? 'selected' : ''}`} onClick={() => setResourceMode('owned_plus_shop')}><i />已拥有 + 商店<span>{Object.values(player.resources).filter((item) => item.ownedCount > 0 || item.shopAvailable).length} 种可用</span></button></section>
            <section className="panel compact-panel arts-picker"><div className="panel-heading tight"><div><p className="step">03 · 必须魔法</p><h3>已选择 {mustHave.length} 项</h3></div>{mustHave.length > 0 && <button className="text-button" onClick={() => setMustHave([])}>清空</button>}</div><div className="search-box"><Search size={14} /><input value={artSearch} onChange={(event) => setArtSearch(event.target.value)} placeholder="搜索魔法名称或类型" /></div><div className="arts-list">{gameData.arts.filter((art) => `${art.name}${art.category}`.toLowerCase().includes(artSearch.toLowerCase())).map((art) => <button key={art.id} className={`art-option ${mustHave.includes(art.id) ? 'selected' : ''}`} onClick={() => toggleArt(art.id)}><span className="check-box">{mustHave.includes(art.id) && <Check size={12} />}</span><span><b>{art.name}</b><small>{art.category} · <ElementSummary values={art.requirements} /></small></span></button>)}</div></section>
            <section className="panel compact-panel"><p className="step">04 · 优化目标</p><NativeSelect className="wide-select" value={ranking} onChange={(event) => setRanking(event.target.value as RankingPreset)}>{Object.entries(RANKING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect><p className="helper">使用稳定字典序排序，优先级清晰可解释。</p></section>
            <button className="solve-button" disabled={solving || mustHave.length === 0} onClick={runSolver}><Sparkles size={18} />{solving ? '正在搜索合法配置…' : '开始求解'}<span>最多 20 组</span></button>
          </aside>
        </div>
        <ResultsSection result={solveResult} expanded={expandedBuild} setExpanded={setExpandedBuild} character={character} policies={policies} quartzNames={quartzNames} artById={artById} mustHave={mustHave} />
      </>}

      {view === 'inventory' && <InventoryView gameData={gameData} player={player} search={inventorySearch} setSearch={setInventorySearch} updateResource={updateResource} setPlayer={setPlayer} />}
      {view === 'characters' && <CharactersView gameData={gameData} character={character} player={player} switchCharacter={switchCharacter} updateSlotLevel={updateSlotLevel} patchCharacter={patchCharacter} />}
      {view === 'data' && <GameDataView gameData={gameData} setGameData={setGameData} setPlayer={setPlayer} exportAll={exportAll} importAll={importAll} resetAll={resetAll} />}
    </section>
    {notice && <output className="toast"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={14} /></button></output>}
  </main>;
}

function ResultsSection({ result, expanded, setExpanded, character, policies, quartzNames, artById, mustHave }: { result: SolveResult | null; expanded: number; setExpanded: (index: number) => void; character: Character; policies: Record<number, SlotPolicy>; quartzNames: Record<string, string>; artById: Record<string, GameData['arts'][number]>; mustHave: string[] }) {
  return <section id="results" className="results-section">
    {!result && <div className="results-preview"><div><p className="step">求解结果</p><h2>准备就绪</h2><p>选择目标魔法后，系统会同时搜索槽位升级、回路配装与必要购买。</p></div><div className="preview-metrics"><Metric value="7" label="物理槽位" /><Metric value={character.lines.length} label="条连线" /><Metric value="20" label="最多方案" /></div></div>}
    {result && result.status !== 'solved' && <div className="empty-result"><span><X size={22} /></span><div><p className="step">没有合法方案</p><h2>{result.message}</h2><p>建议允许更多槽位升级、切换到商店模式，或减少必须魔法。</p></div></div>}
    {result?.status === 'solved' && <><div className="results-title"><div><p className="step">求解结果</p><h2>{result.message}</h2></div><span>{result.nodesVisited.toLocaleString()} 个搜索节点</span></div><div className="build-list">{result.builds.map((build, index) => <article key={index} className={`build-card ${expanded === index ? 'expanded' : ''}`}>
      <button className="build-summary" onClick={() => setExpanded(index)}><span className="build-rank">#{index + 1}</span><div><b>{build.metrics.upgradeSteps === 0 && build.metrics.purchasedCount === 0 ? '无需额外资源' : `${build.metrics.upgradeSteps} 步升级 · ${build.metrics.purchasedCount} 颗购买`}</b><small>{build.metrics.extraArtsCount} 个额外魔法 · ATS +{build.metrics.ats} · SPD +{build.metrics.spd}</small></div><div className="summary-metrics"><Metric value={build.metrics.purchaseCost.toLocaleString()} label="购买成本" /><ChevronDown size={18} /></div></button>
      {expanded === index && <BuildDetails build={build} character={character} policies={policies} quartzNames={quartzNames} artById={artById} mustHave={mustHave} />}
    </article>)}</div></>}
  </section>;
}

function BuildDetails({ build, character, policies, quartzNames, artById, mustHave }: { build: Build; character: Character; policies: Record<number, SlotPolicy>; quartzNames: Record<string, string>; artById: Record<string, GameData['arts'][number]>; mustHave: string[] }) {
  const finalPolicies = Object.fromEntries(character.slots.map((slot) => [slot.id, { ...policies[slot.id], currentLevel: build.slotFinalLevels[slot.id], allowUpgrade: false, maxLevel: build.slotFinalLevels[slot.id] }]));
  return <div className="build-details"><div className="build-graph"><OrbmentGraph character={character} policies={finalPolicies} assignments={build.assignments} quartzNames={quartzNames} /></div><div className="build-columns">
    <section><p className="step">配装清单</p>{character.slots.map((slot) => <div key={slot.id} className="detail-row"><span>槽位 {slot.id + 1}</span><b>{build.assignments[slot.id] ? quartzNames[build.assignments[slot.id]!] : '留空'}</b><small>Lv{build.slotFinalLevels[slot.id]}</small></div>)}</section>
    <section><p className="step">需要执行</p>{Object.keys(build.purchases).length ? Object.entries(build.purchases).map(([id, count]) => <div className="action-line" key={id}><Gem size={13} />购买 {quartzNames[id]} ×{count}</div>) : <div className="success-line"><Check size={13} />无需购买</div>}{build.metrics.upgradeSteps > 0 ? character.slots.filter((slot) => build.slotFinalLevels[slot.id] > policies[slot.id].currentLevel).map((slot) => <div className="action-line" key={slot.id}><Settings2 size={13} />槽位 {slot.id + 1}：Lv{policies[slot.id].currentLevel} → Lv{build.slotFinalLevels[slot.id]}</div>) : <div className="success-line"><Check size={13} />无需升级</div>}
      <p className="step witness-heading">必须魔法为何满足</p>{mustHave.map((id) => { const art = artById[id]; const lineId = build.artWitness[id]; return art ? <div className="witness" key={id}><div><Check size={13} /><b>{art.name}</b><span>{lineId}</span></div><ElementSummary values={build.lineTotals[lineId]} compare={art.requirements} /></div> : null; })}
    </section>
  </div><div className="line-totals"><p className="step">各线路元素值</p>{character.lines.map((line) => <div key={line.id}><b>{line.name}</b><ElementSummary values={build.lineTotals[line.id]} /></div>)}</div></div>;
}

function InventoryView({ gameData, player, search, setSearch, updateResource, setPlayer }: { gameData: GameData; player: PlayerState; search: string; setSearch: (value: string) => void; updateResource: (id: string, patch: Partial<PlayerState['resources'][string]>) => void; setPlayer: React.Dispatch<React.SetStateAction<PlayerState>> }) {
  const shown = gameData.quartz.filter((quartz) => `${quartz.name}${quartz.family ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const totalOwned = Object.values(player.resources).reduce((sum, item) => sum + item.ownedCount, 0);
  const setAllShop = (value: boolean) => setPlayer((current) => ({ ...current, resources: Object.fromEntries(Object.entries(current.resources).map(([id, item]) => [id, { ...item, shopAvailable: value }])) }));
  return <><div className="stats-row"><Metric value={totalOwned} label="已拥有回路" /><Metric value={Object.values(player.resources).filter((item) => item.shopAvailable).length} label="商店可购种类" /><Metric value={gameData.quartz.length} label="基础数据库" /></div><section className="panel data-panel"><div className="data-toolbar"><div className="search-box large"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索回路名称或系列" /></div><div><Button variant="outline" onClick={() => setAllShop(true)}>全部设为可购</Button><Button variant="ghost" onClick={() => setAllShop(false)}>清空商店</Button></div></div><Table className="resource-table"><TableHeader><TableRow><TableHead>回路</TableHead><TableHead>元素值</TableHead><TableHead>拥有</TableHead><TableHead>商店</TableHead><TableHead>价格</TableHead><TableHead>购买上限</TableHead></TableRow></TableHeader><TableBody>{shown.map((quartz) => { const resource = player.resources[quartz.id] ?? { quartzId: quartz.id, ownedCount: 0, shopAvailable: false, shopPrice: null, shopPurchaseLimit: null }; return <TableRow key={quartz.id}><TableCell><b>{quartz.name}</b><small className="cell-note">Lv{quartz.quartzLevel} · {quartz.family ?? '无系列'}</small></TableCell><TableCell><ElementSummary values={quartz.elements} /></TableCell><TableCell><Input className="number-input" type="number" min={0} value={resource.ownedCount} onChange={(event) => updateResource(quartz.id, { ownedCount: Math.max(0, Number(event.target.value)) })} aria-label={`${quartz.name}拥有数量`} /></TableCell><TableCell><button role="switch" aria-label={`${quartz.name}商店可购`} aria-checked={resource.shopAvailable} className={`switch-control ${resource.shopAvailable ? 'on' : ''}`} onClick={() => updateResource(quartz.id, { shopAvailable: !resource.shopAvailable })}><span /></button></TableCell><TableCell><Input aria-label={`${quartz.name}商店价格`} className="price-input" type="number" min={0} disabled={!resource.shopAvailable} value={resource.shopPrice ?? ''} placeholder="未录入" onChange={(event) => updateResource(quartz.id, { shopPrice: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></TableCell><TableCell><Input aria-label={`${quartz.name}购买上限`} className="number-input" type="number" min={0} disabled={!resource.shopAvailable} value={resource.shopPurchaseLimit ?? ''} placeholder="∞" onChange={(event) => updateResource(quartz.id, { shopPurchaseLimit: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></TableCell></TableRow>; })}</TableBody></Table></section></>;
}

function CharactersView({ gameData, character, player, switchCharacter, updateSlotLevel, patchCharacter }: { gameData: GameData; character: Character; player: PlayerState; switchCharacter: (id: string) => void; updateSlotLevel: (slotId: number, level: number) => void; patchCharacter: (character: Character) => void }) {
  const policies = makePolicies(character, player);
  const patchSlot = (slotId: number, patch: Partial<Character['slots'][number]>) => patchCharacter({ ...character, slots: character.slots.map((slot) => slot.id === slotId ? { ...slot, ...patch } : slot) });
  const toggleLineSlot = (lineId: string, slotId: number) => patchCharacter({ ...character, lines: character.lines.map((line) => line.id === lineId ? { ...line, slots: line.slots.includes(slotId) ? line.slots.filter((id) => id !== slotId) : [...line.slots, slotId] } : line) });
  return <><div className="view-toolbar"><div><p className="step">正在编辑</p><NativeSelect value={character.id} onChange={(event) => switchCharacter(event.target.value)}>{gameData.characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></div><p>日常等级与静态导力器模板分开保存；线路直接引用物理槽位。</p></div><div className="character-grid"><section className="panel orbment-panel character-graph"><div className="panel-heading"><div><p className="step">导力器拓扑</p><h2>{character.name}</h2></div><span className="badge">{character.lines.length} 条线路</span></div><OrbmentGraph character={character} policies={policies} /><div className="legend"><span><i className="legend-dot shared" />被多条线路引用即为共享</span></div></section><section className="panel data-panel slots-panel"><p className="step">物理槽位</p><Table><TableHeader><TableRow><TableHead>槽位</TableHead><TableHead>当前等级</TableHead><TableHead>最高等级</TableHead><TableHead>属性限制</TableHead></TableRow></TableHeader><TableBody>{character.slots.map((slot) => <TableRow key={slot.id}><TableCell><b>Slot {slot.id + 1}</b></TableCell><TableCell><NativeSelect value={player.slotLevels[character.id]?.[String(slot.id)] ?? slot.currentLevel} onChange={(event) => updateSlotLevel(slot.id, Number(event.target.value))}>{Array.from({ length: slot.maxGameLevel }, (_, index) => <option key={index + 1} value={index + 1}>Lv{index + 1}</option>)}</NativeSelect></TableCell><TableCell><NativeSelect value={slot.maxGameLevel} onChange={(event) => patchSlot(slot.id, { maxGameLevel: Number(event.target.value) })}>{[1, 2, 3].map((level) => <option key={level} value={level}>Lv{level}</option>)}</NativeSelect></TableCell><TableCell><NativeSelect value={slot.restriction ?? ''} onChange={(event) => patchSlot(slot.id, { restriction: (event.target.value || null) as ElementKey | null })}><option value="">无限制</option>{ELEMENTS.map((element) => <option key={element} value={element}>{ELEMENT_LABELS[element]}属性</option>)}</NativeSelect></TableCell></TableRow>)}</TableBody></Table></section></div><section className="panel data-panel lines-editor"><div className="panel-heading"><div><p className="step">线路成员</p><h2>物理槽引用</h2></div><span className="helper">同一 Slot 可出现在任意多条 Line 中</span></div>{character.lines.map((line) => <div className="line-editor" key={line.id}><b>{line.name}</b><div>{character.slots.map((slot) => <button key={slot.id} className={line.slots.includes(slot.id) ? 'selected' : ''} onClick={() => toggleLineSlot(line.id, slot.id)}>Slot {slot.id + 1}</button>)}</div></div>)}</section></>;
}

function GameDataView({ gameData, setGameData, setPlayer, exportAll, importAll, resetAll }: { gameData: GameData; setGameData: React.Dispatch<React.SetStateAction<GameData>>; setPlayer: React.Dispatch<React.SetStateAction<PlayerState>>; exportAll: () => void; importAll: (event: ChangeEvent<HTMLInputElement>) => void; resetAll: () => void }) {
  const patchQuartz = (id: string, patch: Partial<GameData['quartz'][number]>) => setGameData((current) => ({ ...current, quartz: current.quartz.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const patchArt = (id: string, patch: Partial<GameData['arts'][number]>) => setGameData((current) => ({ ...current, arts: current.arts.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const addQuartz = () => {
    const id = `quartz_${Date.now()}`; const item = { id, name: '新回路', family: null, quartzLevel: 1, elements: emptyElements(), stats: {}, tags: [], uniqueEquip: false };
    setGameData((current) => ({ ...current, quartz: [...current.quartz, item] })); setPlayer((current) => ({ ...current, resources: { ...current.resources, [id]: { quartzId: id, ownedCount: 0, shopAvailable: false, shopPrice: null, shopPurchaseLimit: null } } }));
  };
  const addArt = () => setGameData((current) => ({ ...current, arts: [...current.arts, { id: `art_${Date.now()}`, name: '新魔法', requirements: emptyElements(), epCost: 0, category: '未分类' }] }));
  return <><section className="panel backup-panel"><div><span className="backup-icon"><Database size={20} /></span><div><p className="step">本地数据安全</p><h2>基础数据与玩家状态分开存储</h2><p>备份文件会同时包含两类数据，导入时不会依赖网络。</p></div></div><div className="backup-actions"><Button onClick={exportAll}><Download />导出 JSON</Button><label className="button-label"><Upload size={15} />导入 JSON<input type="file" accept="application/json" onChange={importAll} /></label><Button variant="destructive" onClick={resetAll}><RotateCcw />恢复示例</Button></div></section><div className="stats-row"><Metric value={gameData.characters.length} label="角色" /><Metric value={gameData.quartz.length} label="回路定义" /><Metric value={gameData.arts.length} label="魔法定义" /><Metric value={gameData.version} label="数据版本" /></div><section className="panel data-panel"><div className="panel-heading"><div><p className="step">回路数据库</p><h2>Quartz 定义</h2></div><Button onClick={addQuartz}><Plus />添加回路</Button></div><Table className="edit-table"><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>等级</TableHead><TableHead>系列</TableHead>{ELEMENTS.map((element) => <TableHead key={element}>{ELEMENT_LABELS[element]}</TableHead>)}</TableRow></TableHeader><TableBody>{gameData.quartz.map((quartz) => <TableRow key={quartz.id}><TableCell><Input value={quartz.name} onChange={(event) => patchQuartz(quartz.id, { name: event.target.value })} /><small className="cell-note">{quartz.id}</small></TableCell><TableCell><Input className="tiny-input" type="number" min={1} max={3} value={quartz.quartzLevel} onChange={(event) => patchQuartz(quartz.id, { quartzLevel: Number(event.target.value) })} /></TableCell><TableCell><Input value={quartz.family ?? ''} placeholder="无" onChange={(event) => patchQuartz(quartz.id, { family: event.target.value || null })} /></TableCell>{ELEMENTS.map((element) => <TableCell key={element}><Input className="tiny-input" type="number" min={0} value={quartz.elements[element]} onChange={(event) => patchQuartz(quartz.id, { elements: { ...quartz.elements, [element]: Math.max(0, Number(event.target.value)) } })} /></TableCell>)}</TableRow>)}</TableBody></Table></section><section className="panel data-panel"><div className="panel-heading"><div><p className="step">魔法数据库</p><h2>Arts 条件</h2></div><Button onClick={addArt}><Plus />添加魔法</Button></div><Table className="edit-table"><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>类型</TableHead><TableHead>EP</TableHead>{ELEMENTS.map((element) => <TableHead key={element}>{ELEMENT_LABELS[element]}</TableHead>)}</TableRow></TableHeader><TableBody>{gameData.arts.map((art) => <TableRow key={art.id}><TableCell><Input value={art.name} onChange={(event) => patchArt(art.id, { name: event.target.value })} /><small className="cell-note">{art.id}</small></TableCell><TableCell><Input value={art.category} onChange={(event) => patchArt(art.id, { category: event.target.value })} /></TableCell><TableCell><Input className="tiny-input" type="number" min={0} value={art.epCost} onChange={(event) => patchArt(art.id, { epCost: Number(event.target.value) })} /></TableCell>{ELEMENTS.map((element) => <TableCell key={element}><Input className="tiny-input" type="number" min={0} value={art.requirements[element]} onChange={(event) => patchArt(art.id, { requirements: { ...art.requirements, [element]: Math.max(0, Number(event.target.value)) } })} /></TableCell>)}</TableRow>)}</TableBody></Table></section></>;
}
