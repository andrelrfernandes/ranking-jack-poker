import { Player, PlayerSession, Table, FinancialConfig, FinancialResult, RoundResult } from '../types';

// --- 1. Math Specialist: Exact Point Formula ---

/**
 * Calculates points based on the formula: (N + 1) - P + (N / P)
 * N = Total Players
 * P = Position
 */
export const calculatePoints = (n: number, p: number): number => {
  if (p <= 0) return 0;
  // Using native JS float division which satisfies the high precision requirement
  return (n + 1) - p + (n / p);
};

// --- 2. Table Draw Algorithm with Constraints ---

// Helper to shuffle array (Fisher-Yates)
const shuffle = <T>(array: T[]): T[] => {
  let currentIndex = array.length,  randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
  return array;
};

export const drawTables = (players: Player[], numberOfTables: number): Table[] => {
  if (players.length === 0) return [];

  const dealers = players.filter(p => p.isDealer);
  const nonDealers = players.filter(p => !p.isDealer);

  // Use the admin-specified number of tables (clamped between 1 and 3 just in case)
  const safeNumTables = Math.max(1, Math.min(3, numberOfTables));

  const tables: Table[] = Array.from({ length: safeNumTables }, (_, i) => ({
    id: i + 1,
    players: []
  }));

  // Critical Constraint: Distribute Dealers first (at least 1 per table if possible)
  // They are pushed FIRST, meaning they get index 0 (Position 1)
  dealers.forEach((dealer, index) => {
    const tableIndex = index % safeNumTables;
    tables[tableIndex].players.push(dealer.id);
  });

  // Distribute Non-Dealers
  // We shuffle them first to ensure random seating for positions 2+
  const shuffledNonDealers = shuffle([...nonDealers]);
  
  // Distribute to balance table sizes
  shuffledNonDealers.forEach((player) => {
     // Find table with fewest players to keep balance
     tables.sort((a, b) => a.players.length - b.players.length);
     tables[0].players.push(player.id);
  });

  // Sort tables by ID for display
  return tables.sort((a, b) => a.id - b.id);
};

// --- 3. Financial Engineering & Smart Rounding ---

export const calculateFinancials = (
  sessions: PlayerSession[],
  config: FinancialConfig
): FinancialResult => {
  // 1. Calculate Gross
  let grossTotal = 0;
  sessions.forEach(s => {
    grossTotal += (s.buyIns * config.buyInCost);
    grossTotal += (s.rebuys * config.rebuyCost);
    grossTotal += (s.addOns * config.addOnCost);
  });

  // 2. Deductions
  const adminTax = grossTotal * 0.15;
  const mainEventPot = grossTotal * 0.05;
  const netPrizePool = grossTotal - adminTax - mainEventPot;

  // 3. Raw Prizes (50%, 30%, 20%)
  const rawPrizes = {
    first: netPrizePool * 0.50,
    second: netPrizePool * 0.30,
    third: netPrizePool * 0.20
  };

  // 4. Smart Rounding (Mutilples of 10)
  // Function to round to nearest 10
  const smartRound = (val: number): number => {
    return Math.round(val / 10) * 10;
  };

  const finalPrizes = {
    first: smartRound(rawPrizes.first),
    second: smartRound(rawPrizes.second),
    third: smartRound(rawPrizes.third)
  };

  // 5. Calculate Difference (The "Quebrado")
  // If we pay MORE than calculated, we take from Admin.
  // If we pay LESS, we give to Admin.
  // Actually, usually "Adjust automatically in Admin Tax".
  // Balance Equation: NetAvailable - PaidOut = Diff. 
  // If Diff is positive (we rounded down), add to Admin. If negative (rounded up), subtract from Admin.
  
  const totalPaidOut = finalPrizes.first + finalPrizes.second + finalPrizes.third;
  const roundingAdjustment = netPrizePool - totalPaidOut; 

  const finalAdminTax = adminTax + roundingAdjustment;

  // 6. Player Wallets (including BBQ)
  const activePlayerCount = sessions.length;
  const bbqPerPerson = activePlayerCount > 0 ? config.bbqCost / activePlayerCount : 0;

  const playerBalances = sessions.map(s => {
    const totalCost = (s.buyIns * config.buyInCost) + 
                      (s.rebuys * config.rebuyCost) + 
                      (s.addOns * config.addOnCost);
    
    let prize = 0;
    if (s.rank === 1) prize = finalPrizes.first;
    if (s.rank === 2) prize = finalPrizes.second;
    if (s.rank === 3) prize = finalPrizes.third;

    // Wallet = Prize - (GameCost + BBQ)
    // Note: The user prompt says "Mostra saldo liquido (A Pagar ou A Receber)"
    // Typically: Prize - Invested - BBQ share
    const netBalance = prize - totalCost - bbqPerPerson;

    return {
      playerId: s.playerId,
      totalPaid: totalCost,
      prizeReceived: prize,
      bbqShare: bbqPerPerson,
      netBalance
    };
  });

  return {
    grossTotal,
    adminTax: finalAdminTax,
    mainEventPot,
    netPrizePool,
    prizes: finalPrizes,
    roundingAdjustment,
    playerBalances
  };
};

// --- Generator for the Technical Specs View ---

export const getSqlSchema = () => `-- Tabela: Users (Usuários)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_dealer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: Rounds (Rodadas)
CREATE TABLE rounds (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    admin_id INT REFERENCES users(id),
    gross_total DECIMAL(10, 2),
    admin_tax DECIMAL(10, 2), -- Inclui ajustes de arredondamento
    main_event_pot DECIMAL(10, 2),
    bbq_cost DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'OPEN' -- OPEN, CLOSED
);

-- Tabela: RoundResults (Resultados)
-- Armazena o cálculo exato dos pontos
CREATE TABLE round_results (
    id SERIAL PRIMARY KEY,
    round_id INT REFERENCES rounds(id),
    user_id INT REFERENCES users(id),
    position INT, -- Classificação final
    points FLOAT, -- DOUBLE PRECISION para dízimas (ex: 31.33333)
    buy_ins INT DEFAULT 1,
    rebuys INT DEFAULT 0,
    add_ons INT DEFAULT 0,
    prize_money DECIMAL(10, 2) DEFAULT 0.00
);

-- Tabela: FinancialTransactions (Transações)
-- Histórico de auditoria para todos os movimentos
CREATE TABLE financial_transactions (
    id SERIAL PRIMARY KEY,
    round_id INT REFERENCES rounds(id),
    user_id INT REFERENCES users(id),
    type VARCHAR(50), -- BUYIN, REBUY, ADDON, PAYOUT, BBQ_SHARE
    amount DECIMAL(10, 2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

export const getPythonMathCode = () => `def calculate_points(n: int, p: int) -> float:
    """
    Calcula os pontos com base na fórmula exata:
    Pontos = (N + 1) - P + (N / P)
    
    Args:
        n: Número total de jogadores
        p: Posição final (1º, 2º, etc.)
        
    Returns:
        float: Valor preciso dos pontos (preservando casas decimais)
    """
    if p <= 0:
        return 0.0
    
    # Forçar divisão float para N/P
    return float((n + 1) - p + (n / p))

# Caso de Teste de Validação
if __name__ == "__main__":
    n = 25
    p1 = 1
    p3 = 3
    
    score_1st = calculate_points(n, p1)
    score_3rd = calculate_points(n, p3)
    
    print(f"1º Lugar (N={n}): {score_1st}") # Deve ser 50.0
    print(f"3º Lugar (N={n}): {score_3rd}") # Deve ser 31.3333...
`;

export const getPythonFinanceCode = () => `def calculate_payouts(gross_total, admin_pct=0.15, pot_pct=0.05):
    """
    Calcula as premiações com arredondamento inteligente (múltiplos de 10).
    Ajusta a diferença (quebrado) na Taxa Administrativa.
    """
    # 1. Deduções Automáticas
    initial_admin_tax = gross_total * admin_pct
    main_event_pot = gross_total * pot_pct
    net_prize_pool = gross_total - initial_admin_tax - main_event_pot
    
    # 2. Divisões Brutas
    raw_prizes = {
        1: net_prize_pool * 0.50,
        2: net_prize_pool * 0.30,
        3: net_prize_pool * 0.20
    }
    
    # 3. Arredondamento Inteligente & Ajuste
    final_prizes = {}
    total_payout = 0
    
    for pos, amount in raw_prizes.items():
        # Arredondar para o múltiplo de 10 mais próximo
        rounded = round(amount / 10) * 10
        final_prizes[pos] = rounded
        total_payout += rounded
        
    # 4. Calcular o 'Quebrado' (Diferença)
    # Se o Pote Líquido era 100 e pagamos 102, diferença é -2.
    # Lógica: Taxa Admin absorve a diferença para zerar o balanço.
    diff = net_prize_pool - total_payout
    final_admin_tax = initial_admin_tax + diff
    
    return {
        "prizes": final_prizes,
        "admin_tax_final": final_admin_tax,
        "main_event_pot": main_event_pot,
        "balance_check": final_admin_tax + main_event_pot + total_payout # Deve ser igual ao bruto
    }
`;