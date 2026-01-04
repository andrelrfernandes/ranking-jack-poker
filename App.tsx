import React, { useState, useMemo } from 'react';
import { Player, PlayerSession, Table, FinancialConfig, HistoricalRound } from './types';
import { calculatePoints, drawTables, calculateFinancials, getSqlSchema, getPythonMathCode, getPythonFinanceCode } from './services/pokerLogic';
import { Users, LayoutGrid, DollarSign, Award, FileCode, CheckCircle, Trophy, UserPlus, RefreshCw, XCircle, Spade, Plus, User, Calendar, Lock, Unlock, ArrowRight, Copy, RotateCcw, ClipboardList, BarChart3, TrendingUp, Save } from 'lucide-react';

const INITIAL_CONFIG: FinancialConfig = {
  buyInCost: 50,
  rebuyCost: 50,
  addOnCost: 50,
  bbqCost: 300,
};

enum Tab {
  SETUP = 'setup',
  GAME = 'game',
  FINANCE = 'finance',
  RANKING = 'ranking',
  SPECS = 'specs'
}

type GamePhase = 'REBUYS_OPEN' | 'ADDONS_OPEN' | 'FREEZEOUT';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.SETUP);
  
  // App starts zeroed out as requested
  const [players, setPlayers] = useState<Player[]>([]);
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());
  
  // Historical State (For Season Ranking)
  const [roundHistory, setRoundHistory] = useState<HistoricalRound[]>([]);
  
  // Setup State
  const [numTables, setNumTables] = useState<number>(1);
  const [roundDate, setRoundDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newPlayerName, setNewPlayerName] = useState('');

  // Game State
  const [gameSessions, setGameSessions] = useState<PlayerSession[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [config, setConfig] = useState<FinancialConfig>(INITIAL_CONFIG);
  const [gamePhase, setGamePhase] = useState<GamePhase>('REBUYS_OPEN');

  // --- Handlers ---

  const handleAddPlayer = () => {
    if (!newPlayerName.trim()) return;
    const newId = (players.length + 1).toString();
    const newPlayer: Player = {
      id: newId,
      name: newPlayerName,
      isDealer: false // Default false, admin sets it in the list
    };
    setPlayers([...players, newPlayer]);
    setCheckedInIds(new Set(checkedInIds).add(newId)); // Auto check-in new players
    setNewPlayerName('');
  };

  const handleCheckInToggle = (id: string) => {
    const next = new Set(checkedInIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedInIds(next);
  };

  const toggleDealer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent check-in toggle when clicking dealer button
    setPlayers(prev => prev.map(p => 
      p.id === id ? { ...p, isDealer: !p.isDealer } : p
    ));
  };

  const startRound = () => {
    const activePlayers = players.filter(p => checkedInIds.has(p.id));
    
    // 1. Draw Tables with explicit number of tables
    const drawnTables = drawTables(activePlayers, numTables);
    setTables(drawnTables);

    // 2. Initialize Sessions
    // Everyone starts with 1 Buy-in automatically
    const sessions: PlayerSession[] = activePlayers.map(p => ({
      playerId: p.id,
      buyIns: 1, 
      rebuys: 0,
      addOns: 0,
      rank: null
    }));
    setGameSessions(sessions);
    setGamePhase('REBUYS_OPEN');
    
    setActiveTab(Tab.GAME);
  };

  const resetRound = () => {
    if (window.confirm("Isso apagará a rodada atual sem salvar no histórico. Deseja continuar?")) {
      setGameSessions([]);
      setTables([]);
      setGamePhase('REBUYS_OPEN');
      setActiveTab(Tab.SETUP);
    }
  };

  const saveAndFinishRound = () => {
     if (!window.confirm("Deseja finalizar esta rodada e salvar os pontos no Ranking Geral?")) return;

     const activePlayerCount = checkedInIds.size;
     const financials = calculateFinancials(gameSessions, config);
     
     const historyEntry: HistoricalRound = {
        id: roundHistory.length + 1,
        date: roundDate,
        totalPot: financials.grossTotal,
        playerResults: gameSessions.map(session => {
           const balance = financials.playerBalances.find(b => b.playerId === session.playerId);
           const points = session.rank ? calculatePoints(activePlayerCount, session.rank) : 0;
           return {
              playerId: session.playerId,
              points: points,
              netBalance: balance ? balance.netBalance : 0,
              rank: session.rank
           };
        })
     };

     setRoundHistory([...roundHistory, historyEntry]);
     setGameSessions([]);
     setTables([]);
     setGamePhase('REBUYS_OPEN');
     // Keep checkedInIds for convenience, or clear if preferred
     setActiveTab(Tab.RANKING);
     alert("Rodada salva com sucesso! Ranking atualizado.");
  };

  const updateSession = (playerId: string, field: keyof PlayerSession, delta: number) => {
    setGameSessions(prev => prev.map(s => {
      if (s.playerId !== playerId) return s;
      
      const val = s[field];
      if (typeof val === 'number') {
        let newVal = val + delta;
        // Logic constraint: Add-ons are boolean (0 or 1) in UI terms, but stored as number for flexibility
        if (field === 'addOns') {
          newVal = Math.max(0, Math.min(1, newVal));
        } else {
           newVal = Math.max(0, newVal);
        }
        return { ...s, [field]: newVal };
      }
      return s;
    }));
  };

  const handleAddonAll = () => {
    if (window.confirm("Aplicar Add-on para TODOS os jogadores ATIVOS (não eliminados)?")) {
      setGameSessions(prev => {
        const updated = prev.map(s => {
          // Only apply if rank is null (player is still active/not eliminated)
          if (s.rank === null) {
            return { ...s, addOns: 1 };
          }
          return s;
        });
        return updated;
      });
      alert("Add-ons aplicados para jogadores ativos!");
    }
  };

  const handleElimination = (playerId: string) => {
    const activeCount = checkedInIds.size;
    const assignedRanks = gameSessions
      .map(s => s.rank)
      .filter((r): r is number => r !== null);
    
    let nextRank = activeCount;
    while (assignedRanks.includes(nextRank) && nextRank > 0) {
      nextRank--;
    }
    
    if (nextRank > 0) {
      setRank(playerId, nextRank);
    }
  };

  const setRank = (playerId: string, rank: number) => {
    setGameSessions(prev => prev.map(s => {
      if (s.playerId === playerId) return { ...s, rank };
      if (s.rank === rank) return { ...s, rank: null };
      return s;
    }));
  };

  const advancePhase = () => {
     if (gamePhase === 'REBUYS_OPEN') setGamePhase('ADDONS_OPEN');
     else if (gamePhase === 'ADDONS_OPEN') setGamePhase('FREEZEOUT');
  };

  // --- Derived State ---
  
  const activePlayerCount = checkedInIds.size;
  const financials = useMemo(() => calculateFinancials(gameSessions, config), [gameSessions, config]);

  const seasonStats = useMemo(() => {
     const stats: Record<string, { name: string, points: number, rounds: number, wins: number, netBalance: number }> = {};

     // Initialize stats for all known players (even if they haven't played yet)
     players.forEach(p => {
        stats[p.id] = { name: p.name, points: 0, rounds: 0, wins: 0, netBalance: 0 };
     });

     roundHistory.forEach(round => {
        round.playerResults.forEach(res => {
           if (!stats[res.playerId]) return; // Should not happen
           stats[res.playerId].points += res.points;
           stats[res.playerId].netBalance += res.netBalance;
           stats[res.playerId].rounds += 1;
           if (res.rank === 1) stats[res.playerId].wins += 1;
        });
     });

     return Object.values(stats).sort((a, b) => b.points - a.points);
  }, [roundHistory, players]);

  // --- Helpers ---
  const generatePlayerSummaryText = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    const session = gameSessions.find(s => s.playerId === playerId);
    const balance = financials.playerBalances.find(b => b.playerId === playerId);
    
    if (!player || !session || !balance) return '';

    const dateStr = new Date(roundDate).toLocaleDateString('pt-BR');
    const isPay = balance.netBalance < 0;
    const absBalance = Math.abs(balance.netBalance).toFixed(2);

    return [
      `🃏 *Jack Poker Manager* - ${dateStr}`,
      `👤 *${player.name}*`,
      `------------------------------`,
      `💸 *GASTOS*`,
      `   🔴 Buy-in: R$ ${(session.buyIns * config.buyInCost).toFixed(2)}`,
      session.rebuys > 0 ? `   🔴 Rebuys (${session.rebuys}): R$ ${(session.rebuys * config.rebuyCost).toFixed(2)}` : null,
      session.addOns > 0 ? `   🔴 Add-on: R$ ${(session.addOns * config.addOnCost).toFixed(2)}` : null,
      `   🥩 Cota Churras: R$ ${balance.bbqShare.toFixed(2)}`,
      `------------------------------`,
      `🏆 *GANHOS*`,
      balance.prizeReceived > 0 ? `   🟢 Premiação (${session.rank}º): R$ ${balance.prizeReceived.toFixed(2)}` : `   ⚪ Premiação: R$ 0,00`,
      `------------------------------`,
      `📊 *BALANÇO FINAL*`,
      isPay ? `❌ *VOCÊ DEVE: R$ ${absBalance}*` : `✅ *VOCÊ RECEBE: R$ ${absBalance}*`,
      `------------------------------`
    ].filter(Boolean).join('\n');
  };

  const copyPlayerSummary = (playerId: string) => {
    const text = generatePlayerSummaryText(playerId);
    if (text) {
      navigator.clipboard.writeText(text);
      alert(`Resumo copiado para a área de transferência!`);
    }
  };

  const copyGeneralReport = () => {
    const dateStr = new Date(roundDate).toLocaleDateString('pt-BR');
    const header = `📋 *RESUMO GERAL DA RODADA - ${dateStr}*\n------------------------------\n`;
    
    const lines = financials.playerBalances.map(pb => {
       const player = players.find(p => p.id === pb.playerId);
       const isPay = pb.netBalance < 0;
       const absBalance = Math.abs(pb.netBalance).toFixed(2);
       return `${isPay ? '🔴' : '🟢'} *${player?.name}*: ${isPay ? 'PAGA' : 'RECEBE'} R$ ${absBalance}`;
    });

    const footer = `\n------------------------------\n💰 *Total no Pote:* R$ ${financials.grossTotal.toFixed(2)}`;

    navigator.clipboard.writeText(header + lines.join('\n') + footer);
    alert('Relatório geral copiado!');
  };

  return (
    // Theme: Slate-950 (Dark Navy) Background, Slate-900 Cards, Orange Primary, Sky Blue Accents
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center space-x-3">
          {/* Logo Section */}
          <div className="flex items-center">
             <img 
               src="/logo.png" 
               alt="Jack Poker" 
               className="h-12 w-auto object-contain mr-3"
               onError={(e) => {
                 e.currentTarget.style.display = 'none';
                 const fallback = document.getElementById('logo-fallback');
                 if(fallback) fallback.style.display = 'flex';
               }}
             />
             <div id="logo-fallback" className="hidden flex-col justify-center items-start">
                <h1 className="text-2xl font-black tracking-tighter uppercase font-serif leading-none text-slate-100" style={{ fontFamily: 'Georgia, serif' }}>
                  Jack
                </h1>
                <h1 className="text-lg font-black tracking-widest uppercase leading-none text-orange-500" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Poker
                </h1>
             </div>
             <div className="hidden md:block ml-2 border-l border-slate-700 pl-3">
               <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Manager</p>
             </div>
          </div>
        </div>
        
        <nav className="flex space-x-1 bg-slate-950 p-1 rounded-lg overflow-x-auto border border-slate-800">
          <NavButton active={activeTab === Tab.SETUP} onClick={() => setActiveTab(Tab.SETUP)} icon={<Users size={18}/>} label="Cadastro" disabled={gamePhase !== 'REBUYS_OPEN' && activeTab !== Tab.SETUP && gameSessions.length > 0} />
          <NavButton active={activeTab === Tab.GAME} onClick={() => setActiveTab(Tab.GAME)} icon={<LayoutGrid size={18}/>} label="Rodada" disabled={gameSessions.length === 0} />
          <NavButton active={activeTab === Tab.FINANCE} onClick={() => setActiveTab(Tab.FINANCE)} icon={<Award size={18}/>} label="Resultados" disabled={gameSessions.length === 0} />
          <NavButton active={activeTab === Tab.RANKING} onClick={() => setActiveTab(Tab.RANKING)} icon={<Trophy size={18}/>} label="Ranking" />
          <NavButton active={activeTab === Tab.SPECS} onClick={() => setActiveTab(Tab.SPECS)} icon={<FileCode size={18}/>} label="Specs" />
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6 relative">
        
        {/* SETUP TAB */}
        {activeTab === Tab.SETUP && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            {gameSessions.length > 0 && (
               <div className="bg-orange-900/20 border border-orange-600/50 p-4 rounded-xl flex items-center justify-between">
                  <span className="text-orange-200">Há uma rodada em andamento.</span>
                  <button 
                    onClick={resetRound}
                    className="flex items-center bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                  >
                    <RotateCcw className="mr-2 w-4 h-4" /> Resetar (Sem Salvar)
                  </button>
               </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${gameSessions.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-lg">
                <h2 className="text-lg font-semibold text-orange-400 mb-4 flex items-center">
                  <DollarSign className="mr-2" size={20}/> Configurações da Rodada
                </h2>
                <div className="mb-4">
                  <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1 block">Data da Rodada</label>
                  <div className="relative">
                     <Calendar className="absolute left-3 top-2.5 text-slate-500 w-4 h-4" />
                     <input 
                       type="date"
                       value={roundDate}
                       onChange={(e) => setRoundDate(e.target.value)}
                       className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                     />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                   <div className="col-span-2">
                      <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1 block">Quantidade de Mesas</label>
                      <div className="flex space-x-2">
                         {[1, 2, 3].map(n => (
                           <button 
                              key={n}
                              onClick={() => setNumTables(n)}
                              className={`flex-1 py-2 rounded-lg border font-bold transition-all ${numTables === n ? 'bg-orange-600 border-orange-500 text-white shadow' : 'bg-slate-950 border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                           >
                             {n} {n === 1 ? 'Mesa' : 'Mesas'}
                           </button>
                         ))}
                      </div>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputNumber label="Valor do Buy-In" value={config.buyInCost} onChange={v => setConfig({...config, buyInCost: v})} />
                  <InputNumber label="Valor do Rebuy" value={config.rebuyCost} onChange={v => setConfig({...config, rebuyCost: v})} />
                  <InputNumber label="Valor do Add-On" value={config.addOnCost} onChange={v => setConfig({...config, addOnCost: v})} />
                  <InputNumber label="Custo Churrasco" value={config.bbqCost} onChange={v => setConfig({...config, bbqCost: v})} />
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-lg flex flex-col justify-center items-center text-center">
                <h2 className="text-xl font-bold text-white mb-2">Iniciar Rodada</h2>
                <p className="text-slate-400 mb-6">
                  {checkedInIds.size} jogadores confirmados.
                  <br/>
                  Buy-in automático de R$ {config.buyInCost} para todos.
                  <br/>
                  O sistema sorteará {numTables} {numTables === 1 ? 'mesa' : 'mesas'}, posicionando Dealers na Posição 1.
                </p>
                <button 
                  onClick={startRound}
                  disabled={checkedInIds.size < 2}
                  className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-full transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-900/50"
                >
                  Sortear e Iniciar
                </button>
              </div>
            </div>
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-lg">
              <div className="p-4 bg-slate-800 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center">
                   <h2 className="font-semibold text-slate-200 mr-4">Jogadores</h2>
                   <span className="text-xs font-mono bg-slate-950 px-2 py-1 rounded text-slate-400">{checkedInIds.size}/{players.length} Check-in</span>
                </div>
                <div className="flex w-full sm:w-auto">
                   <input 
                      type="text" 
                      placeholder="Nome do Novo Jogador"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                      className="bg-slate-950 border border-slate-600 rounded-l-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-orange-500 w-full"
                   />
                   <button 
                      onClick={handleAddPlayer}
                      className="bg-orange-700 hover:bg-orange-600 text-white px-4 py-2 rounded-r-lg border border-l-0 border-orange-700 transition-colors"
                   >
                     <Plus size={18} />
                   </button>
                </div>
              </div>
              {players.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                   <UserPlus className="mx-auto h-12 w-12 text-slate-600 mb-3" />
                   <p>Nenhum jogador cadastrado.</p>
                   <p className="text-sm">Adicione jogadores acima para começar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 p-2">
                  {players.map(player => (
                    <div 
                      key={player.id} 
                      onClick={() => handleCheckInToggle(player.id)}
                      className={`
                        cursor-pointer p-3 rounded-lg flex items-center justify-between transition-colors border group select-none
                        ${checkedInIds.has(player.id) 
                          ? 'bg-orange-900/30 border-orange-600/40' 
                          : 'bg-slate-950/50 border-transparent hover:bg-slate-800'}
                      `}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${checkedInIds.has(player.id) ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                           <User size={14} />
                        </div>
                        <div className="truncate">
                          <p className={`font-medium truncate ${checkedInIds.has(player.id) ? 'text-white' : 'text-slate-400'}`}>{player.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                         <button
                            onClick={(e) => toggleDealer(player.id, e)}
                            title="Definir como Dealer"
                            className={`
                               px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase border transition-all
                               ${player.isDealer 
                                  ? 'bg-amber-500 text-black border-amber-600 hover:bg-amber-400' 
                                  : 'bg-slate-800 text-slate-500 border-slate-600 hover:border-slate-400 hover:text-slate-300'}
                            `}
                         >
                            Dealer
                         </button>
                         <div className={`w-5 h-5 flex items-center justify-center ${checkedInIds.has(player.id) ? 'text-orange-500' : 'text-transparent'}`}>
                            <CheckCircle size={20} />
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GAME TAB */}
        {activeTab === Tab.GAME && (
          <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
             <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 shadow flex flex-col md:flex-row justify-between items-center gap-4">
                 <div className="flex items-center space-x-4">
                    <div className="bg-slate-950 px-3 py-1 rounded border border-slate-700 text-sm text-slate-400 flex items-center">
                       <Calendar className="w-4 h-4 mr-2" /> {new Date(roundDate).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="flex items-center space-x-2">
                       <PhaseBadge active={gamePhase === 'REBUYS_OPEN'} label="1. Rebuys" />
                       <ArrowRight size={14} className="text-slate-600" />
                       <PhaseBadge active={gamePhase === 'ADDONS_OPEN'} label="2. Add-ons" />
                       <ArrowRight size={14} className="text-slate-600" />
                       <PhaseBadge active={gamePhase === 'FREEZEOUT'} label="3. Freezeout" />
                    </div>
                 </div>
                 <div className="flex space-x-2">
                   {gamePhase === 'ADDONS_OPEN' && (
                     <button 
                       onClick={handleAddonAll}
                       className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase shadow flex items-center"
                     >
                       <Plus className="mr-1 w-4 h-4" /> Add-on Para Todos
                     </button>
                   )}
                   {gamePhase !== 'FREEZEOUT' && (
                     <button 
                       onClick={advancePhase}
                       className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2 rounded-lg font-bold text-sm shadow flex items-center"
                     >
                       {gamePhase === 'REBUYS_OPEN' ? (
                          <>Encerrar Rebuys e Abrir Add-ons <ArrowRight className="ml-2 w-4 h-4" /></>
                       ) : (
                          <>Encerrar Add-ons e Fechar Caixa <Lock className="ml-2 w-4 h-4" /></>
                       )}
                     </button>
                   )}
                 </div>
                 {gamePhase === 'FREEZEOUT' && (
                    <div className="text-orange-400 font-bold flex items-center text-sm">
                       <Lock className="mr-2 w-4 h-4" /> Caixa Fechado. Premiação Definida.
                    </div>
                 )}
             </div>

             {tables.length > 0 && (
                <div className={`grid grid-cols-1 ${tables.length > 1 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-1'} gap-6`}>
                  {tables.map(table => (
                    <div key={table.id} className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-600 to-amber-500"></div>
                      <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <LayoutGrid className="mr-2 text-orange-500" size={20}/> Mesa {table.id}
                      </h3>
                      <ul className="space-y-2">
                        {table.players.map((pid, idx) => {
                          const p = players.find(x => x.id === pid);
                          const seat = idx + 1;
                          return (
                            <li key={pid} className="flex items-center justify-between p-2 bg-slate-950/50 rounded border border-slate-800">
                              <div className="flex items-center">
                                 <span className="w-6 h-6 rounded bg-slate-800 text-slate-500 text-xs font-mono flex items-center justify-center mr-3 border border-slate-700">
                                   {seat}
                                 </span>
                                 <span className="text-slate-200">{p?.name}</span>
                              </div>
                              {seat === 1 && <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase">Dealer</span>}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
             )}

             <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-lg overflow-hidden">
                <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-lg text-white">Gerenciador da Sessão</h2>
                    <p className="text-sm text-slate-400">
                       {gamePhase === 'REBUYS_OPEN' && 'Fase de Rebuys. Adicione rebuys livremente.'}
                       {gamePhase === 'ADDONS_OPEN' && 'Fase de Add-ons. Rebuys encerrados.'}
                       {gamePhase === 'FREEZEOUT' && 'Torneio em andamento. Gerencie eliminações.'}
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="p-4">Jogador</th>
                        <th className="p-4 text-center">Buy-In</th>
                        <th className="p-4 text-center">Rebuys (R$ {config.rebuyCost})</th>
                        <th className="p-4 text-center">Add-on (R$ {config.addOnCost})</th>
                        <th className="p-4 text-center">Posição</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {gameSessions.map(session => {
                        const player = players.find(p => p.id === session.playerId);
                        return (
                          <tr key={session.playerId} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-4 font-medium text-white flex items-center gap-2">
                               {player?.isDealer && <span className="text-amber-500 text-[10px] border border-amber-500/50 px-1 rounded">D</span>}
                               {player?.name}
                            </td>
                             <td className="p-4 text-center">
                                <CheckCircle className="w-5 h-5 text-sky-500 mx-auto" />
                             </td>
                            <td className="p-4 text-center">
                              {gamePhase === 'REBUYS_OPEN' ? (
                                <div className="inline-flex items-center bg-slate-950 rounded-lg p-1 space-x-2 border border-slate-800">
                                  <button onClick={() => updateSession(session.playerId, 'rebuys', -1)} className="w-6 h-6 flex items-center justify-center hover:bg-red-500/20 text-red-400 rounded">-</button>
                                  <span className="w-6 text-center font-mono">{session.rebuys}</span>
                                  <button onClick={() => updateSession(session.playerId, 'rebuys', 1)} className="w-6 h-6 flex items-center justify-center hover:bg-sky-500/20 text-sky-400 rounded">+</button>
                                </div>
                              ) : (
                                <span className="font-mono text-slate-400">{session.rebuys}</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {gamePhase === 'ADDONS_OPEN' ? (
                                 <button 
                                   onClick={() => updateSession(session.playerId, 'addOns', session.addOns === 1 ? -1 : 1)}
                                   className={`px-3 py-1 rounded text-xs font-bold border ${session.addOns === 1 ? 'bg-purple-600 text-white border-purple-500' : 'bg-slate-950 text-slate-500 border-slate-700'}`}
                                 >
                                    {session.addOns === 1 ? 'SIM' : 'NÃO'}
                                 </button>
                              ) : (
                                 <span className={`text-xs font-bold ${session.addOns ? 'text-purple-400' : 'text-slate-600'}`}>
                                    {session.addOns === 1 ? 'SIM' : '-'}
                                 </span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {session.rank ? (
                                <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
                                  session.rank === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 
                                  session.rank === 2 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/50' :
                                  session.rank === 3 ? 'bg-orange-700/20 text-orange-400 border border-orange-700/50' :
                                  'bg-slate-800 text-slate-500'
                                }`}>
                                  #{session.rank}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="p-4 text-right flex justify-end space-x-2">
                                {[1, 2, 3].map(rank => (
                                  <button 
                                    key={rank}
                                    onClick={() => setRank(session.playerId, rank)}
                                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                                      session.rank === rank ? 'bg-orange-600 text-white border-orange-500' : 'bg-transparent text-slate-500 border-slate-600 hover:border-slate-400'
                                    }`}
                                  >
                                    {rank === 1 ? '1º' : rank === 2 ? '2º' : '3º'}
                                  </button>
                                ))}
                                <button
                                   onClick={() => handleElimination(session.playerId)}
                                   disabled={!!session.rank}
                                   className="text-xs px-2 py-1 rounded border border-red-900/50 text-red-500 hover:bg-red-900/20 disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                  Eliminar
                                </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        )}

        {/* FINANCIALS TAB */}
        {activeTab === Tab.FINANCE && (
          <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Resultados Financeiros</h2>
              <div className="flex space-x-2">
                <button 
                  onClick={copyGeneralReport}
                  className="flex items-center bg-slate-800 hover:bg-slate-700 text-sky-400 px-4 py-2 rounded-lg font-medium text-sm border border-slate-700 transition-colors"
                >
                  <ClipboardList className="mr-2 w-4 h-4" /> Relatório Geral
                </button>
                <button 
                  onClick={saveAndFinishRound}
                  className="flex items-center bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-emerald-900/50 border border-emerald-500"
                >
                  <Save className="mr-2 w-4 h-4" /> Finalizar e Salvar Rodada
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Total Bruto" value={financials.grossTotal} color="text-white" />
              <StatCard label="Premiação Líquida" value={financials.netPrizePool} color="text-sky-400" />
              <StatCard label="Taxa Admin (15%)" value={financials.adminTax} sub={`Inclui Arredondamento: ${financials.roundingAdjustment > 0 ? '+' : ''}${financials.roundingAdjustment}`} color="text-amber-400" />
              <StatCard label="Pote Main Event (5%)" value={financials.mainEventPot} color="text-purple-400" />
            </div>

            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-xl flex justify-around items-end text-center">
              <div className="order-2 transform -translate-y-4">
                 <div className="text-6xl mb-2">🥇</div>
                 <div className="text-2xl font-bold text-amber-400">R$ {financials.prizes.first}</div>
                 <div className="text-xs text-slate-500">Campeão (50%)</div>
              </div>
              <div className="order-1">
                 <div className="text-4xl mb-2">🥈</div>
                 <div className="text-xl font-bold text-slate-300">R$ {financials.prizes.second}</div>
                 <div className="text-xs text-slate-500">Vice (30%)</div>
              </div>
              <div className="order-3">
                 <div className="text-4xl mb-2">🥉</div>
                 <div className="text-xl font-bold text-orange-400">R$ {financials.prizes.third}</div>
                 <div className="text-xs text-slate-500">Terceiro (20%)</div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-lg">
              <div className="p-4 bg-slate-800 border-b border-slate-700">
                <h3 className="font-bold text-white">Carteira Final e Pontos</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                     <tr className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider">
                       <th className="p-4">Pos</th>
                       <th className="p-4">Jogador</th>
                       <th className="p-4 text-right">Pontos (Math)</th>
                       <th className="p-4 text-right">Investido</th>
                       <th className="p-4 text-right">Cota Churras</th>
                       <th className="p-4 text-right">Prêmio</th>
                       <th className="p-4 text-right">Saldo Líquido</th>
                       <th className="p-4 text-right">Status</th>
                       <th className="p-4 text-right">Resumo</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-sm">
                    {financials.playerBalances.map((pb) => {
                       const player = players.find(p => p.id === pb.playerId);
                       const session = gameSessions.find(s => s.playerId === pb.playerId);
                       const points = session && session.rank ? calculatePoints(activePlayerCount, session.rank) : 0;
                       
                       return (
                         <tr key={pb.playerId} className="hover:bg-slate-800/30">
                           <td className="p-4 text-slate-400 font-mono">
                              {session?.rank ? `#${session.rank}` : '-'}
                           </td>
                           <td className="p-4 font-medium text-white">{player?.name}</td>
                           <td className="p-4 text-right font-mono text-sky-300">
                             {points.toFixed(4)}
                           </td>
                           <td className="p-4 text-right text-slate-400">- {pb.totalPaid.toFixed(2)}</td>
                           <td className="p-4 text-right text-slate-400">- {pb.bbqShare.toFixed(2)}</td>
                           <td className="p-4 text-right text-sky-400 font-bold">
                             {pb.prizeReceived > 0 ? `+ ${pb.prizeReceived.toFixed(2)}` : '-'}
                           </td>
                           <td className={`p-4 text-right font-bold text-base ${pb.netBalance >= 0 ? 'text-sky-400' : 'text-red-400'}`}>
                              R$ {Math.abs(pb.netBalance).toFixed(2)}
                           </td>
                           <td className={`p-4 text-right font-bold text-xs uppercase ${pb.netBalance >= 0 ? 'text-sky-500' : 'text-red-500'}`}>
                             {pb.netBalance >= 0 ? 'Recebe' : 'Paga'}
                           </td>
                           <td className="p-4 text-right">
                              <button 
                                onClick={() => copyPlayerSummary(pb.playerId)}
                                title="Copiar Cobrança (WhatsApp)"
                                className="bg-slate-800 hover:bg-green-600/20 text-green-400 hover:text-green-300 p-2 rounded transition-colors border border-slate-700 hover:border-green-500/50 flex items-center justify-center mx-auto"
                              >
                                <Copy size={16} />
                              </button>
                           </td>
                         </tr>
                       )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* RANKING TAB */}
        {activeTab === Tab.RANKING && (
          <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
             <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-6">
                   <h2 className="text-2xl font-bold text-white flex items-center">
                     <Trophy className="mr-3 text-amber-400" size={32} /> Ranking Semestral
                   </h2>
                   <div className="text-right">
                     <p className="text-sm text-slate-400">Total de Rodadas</p>
                     <p className="text-2xl font-bold text-white">{roundHistory.length}</p>
                   </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="p-4">Rank</th>
                        <th className="p-4">Jogador</th>
                        <th className="p-4 text-center">Rodadas</th>
                        <th className="p-4 text-center">Vitórias</th>
                        <th className="p-4 text-right">Lucro Acumulado</th>
                        <th className="p-4 text-right">Pontos Totais</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                       {seasonStats.map((stat, idx) => {
                          const isLeader = idx === 0 && stat.points > 0;
                          return (
                             <tr key={idx} className={`hover:bg-slate-800/30 ${isLeader ? 'bg-amber-900/10' : ''}`}>
                               <td className="p-4">
                                  {isLeader ? (
                                     <span className="w-8 h-8 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center shadow-lg shadow-amber-500/50">1</span>
                                  ) : (
                                     <span className="text-slate-500 font-mono">#{idx + 1}</span>
                                  )}
                               </td>
                               <td className={`p-4 font-bold text-base ${isLeader ? 'text-amber-400' : 'text-white'}`}>
                                  {stat.name}
                               </td>
                               <td className="p-4 text-center text-slate-300">{stat.rounds}</td>
                               <td className="p-4 text-center text-slate-300">{stat.wins}</td>
                               <td className={`p-4 text-right font-mono ${stat.netBalance >= 0 ? 'text-sky-400' : 'text-red-400'}`}>
                                  R$ {stat.netBalance.toFixed(2)}
                               </td>
                               <td className="p-4 text-right">
                                  <span className="bg-slate-800 px-3 py-1 rounded-full text-white font-mono border border-slate-700">
                                    {stat.points.toFixed(2)}
                                  </span>
                               </td>
                             </tr>
                          )
                       })}
                       {seasonStats.length === 0 && (
                          <tr>
                             <td colSpan={6} className="p-8 text-center text-slate-500">
                                Nenhum dado de temporada disponível. Finalize uma rodada para ver o ranking.
                             </td>
                          </tr>
                       )}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        )}

        {/* SPECS TAB */}
        {activeTab === Tab.SPECS && (
           <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                <h2 className="text-2xl font-bold text-white mb-4">Especificações Técnicas</h2>
                <div className="space-y-6">
                  <CodeBlock title="1. Schema SQL (PostgreSQL)" code={getSqlSchema()} lang="sql" />
                  <CodeBlock title="2. Python: Fórmula Exata de Pontos" code={getPythonMathCode()} lang="python" />
                  <CodeBlock title="3. Python: Lógica Financeira e Arredondamento" code={getPythonFinanceCode()} lang="python" />
                  <div className="bg-slate-950 rounded p-4 border border-slate-800">
                    <h3 className="text-orange-400 font-bold mb-2">Endpoints da API (Especificação)</h3>
                    <ul className="space-y-2 font-mono text-sm text-slate-300">
                      <li><span className="text-amber-500">POST</span> /api/rounds/start <span className="text-slate-500">-> Check-in jogadores, Sorteio de mesas</span></li>
                      <li><span className="text-sky-500">GET</span> /api/rounds/:id/tables <span className="text-slate-500">-> Ver assentos atuais</span></li>
                      <li><span className="text-amber-500">POST</span> /api/rounds/:id/transaction <span className="text-slate-500">-> Add Buyin/Rebuy/Addon</span></li>
                      <li><span className="text-amber-500">POST</span> /api/rounds/:id/eliminate <span className="text-slate-500">-> Definir posição (calcula pontos)</span></li>
                      <li><span className="text-sky-500">GET</span> /api/rounds/:id/financials <span className="text-slate-500">-> Ver carteira e premiação calculada</span></li>
                    </ul>
                  </div>
                </div>
              </div>
           </div>
        )}
      </main>
    </div>
  );
};

// --- Sub-components ---

const NavButton = ({ active, onClick, icon, label, disabled }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap
      ${active ? 'bg-slate-800 text-orange-400 shadow-sm border border-slate-700' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const PhaseBadge = ({ active, label }: { active: boolean, label: string }) => (
  <div className={`text-xs px-2 py-1 rounded font-bold ${active ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
     {label}
  </div>
);

const InputNumber = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <div className="flex flex-col">
    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">{label}</label>
    <div className="relative">
      <span className="absolute left-3 top-2.5 text-slate-500">R$</span>
      <input 
        type="number" 
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-8 pr-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
      />
    </div>
  </div>
);

const StatCard = ({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) => (
  <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-md">
    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${color}`}>R$ {value.toFixed(2)}</p>
    {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
  </div>
);

const CodeBlock = ({ title, code, lang }: { title: string; code: string; lang: string }) => (
  <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
    <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
      <span className="text-sm font-bold text-slate-300">{title}</span>
      <span className="text-xs text-slate-500 uppercase">{lang}</span>
    </div>
    <pre className="p-4 overflow-x-auto text-sm text-sky-200 font-mono leading-relaxed">
      {code}
    </pre>
  </div>
);

export default App;
