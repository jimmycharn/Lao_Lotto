import { buildBetItems, calculateScenarios, greedyRecommendations } from './layoffCalculator.js';

// Mock user settings map
const userSettingsMap = {
  'user_1': {
    'thai': {
      '2_top': { payout: 65, commission: 15 },
      '3_top': { payout: 550, commission: 30 }
    }
  }
};

// Submissions:
// Total bets:
// user_1: 2_top '12' amount 5000 (potential payout = 5000 * 65 = 325,000)
// user_1: 3_top '123' amount 1000 (potential payout = 1000 * 550 = 550,000)
const submissions = [
  { id: 'sub_1', bet_type: '2_top', numbers: '12', amount: 5000, user_id: 'user_1' },
  { id: 'sub_2', bet_type: '3_top', numbers: '123', amount: 1000, user_id: 'user_1' }
];

// Transfers: none initially
const transfers = [];

const lotteryType = 'thai';
const budget = 100000;
const setPrice = 120;

console.log('--- RUNNING TEST ---');

// 1. Build bet items
const betItems = buildBetItems(submissions, transfers, userSettingsMap, lotteryType, setPrice);
console.log('Bet Items:', JSON.stringify(betItems, null, 2));

// 2. Calculate scenarios
const scenarios = calculateScenarios(betItems, lotteryType, setPrice);
console.log(`Calculated ${scenarios.length} scenarios.`);
console.log('Top scenarios:');
scenarios.slice(0, 5).forEach(s => {
  console.log(`Winning: ${s.winning_number}, Payout: ฿${s.total_payout.toLocaleString()}`);
});

// 3. Run greedy recommendations
const recommendations = greedyRecommendations(scenarios, betItems, budget, setPrice, lotteryType);
console.log('Recommendations:');
console.log(JSON.stringify(recommendations, null, 2));
