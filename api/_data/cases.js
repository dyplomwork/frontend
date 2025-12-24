const CASES = [
  {
    id: 'starter',
    name: 'Starter Case',
    price: 25,
    modelEmoji: '🧰',
    loot: [
      { id: 'c1', label: '+5 credits',   amount: 5,   chance: 0.315 },
      { id: 'c2', label: '+10 credits',  amount: 10,  chance: 0.405 },
      { id: 'c3', label: '+25 credits',  amount: 25,  chance: 0.230 },
      { id: 'c4', label: '+80 credits',  amount: 80,  chance: 0.014 },
      { id: 'c5', label: '+200 credits', amount: 200, chance: 0.035 },
      { id: 'c6', label: '+500 credits', amount: 500, chance: 0.001 }
    ]
    // EV payout ≈ 19.995 (цель 20.000) => ~ -20%
  },

  {
    id: 'lucky',
    name: 'Lucky Case',
    price: 100,
    modelEmoji: '🍀',
    loot: [
      { id: 'l1', label: '+20 credits',   amount: 20,   chance: 0.527 },
      { id: 'l2', label: '+50 credits',   amount: 50,   chance: 0.310 },
      { id: 'l3', label: '+120 credits',  amount: 120,  chance: 0.125 },
      { id: 'l4', label: '+400 credits',  amount: 400,  chance: 0.024 },
      { id: 'l5', label: '+1200 credits', amount: 1200, chance: 0.012 },
      { id: 'l6', label: '+2500 credits', amount: 2500, chance: 0.002 }
    ]
    // EV payout ≈ 70.040 (цель 70.000) => ~ -30%
  },

  {
    id: 'diamond',
    name: 'Diamond Case',
    price: 350,
    modelEmoji: '💎',
    loot: [
      { id: 'd1', label: '+60 credits',    amount: 60,    chance: 0.572 },
      { id: 'd2', label: '+150 credits',   amount: 150,   chance: 0.340 },
      { id: 'd3', label: '+350 credits',   amount: 350,   chance: 0.049 },
      { id: 'd4', label: '+1200 credits',  amount: 1200,  chance: 0.025 },
      { id: 'd5', label: '+5000 credits',  amount: 5000,  chance: 0.009 },
      { id: 'd6', label: '+10000 credits', amount: 10000, chance: 0.005 }
    ]
    // EV payout ≈ 227.470 (цель 227.500) => ~ -35%
  }
]

module.exports = { CASES }
