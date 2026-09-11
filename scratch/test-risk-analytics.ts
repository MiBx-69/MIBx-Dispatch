import { analyzeCustomerRisk } from "../src/lib/risk-analytics";

const testCases = [
  {
    name: "User case: 100 delivered, 8 returned",
    input: { overall: { total: 108, delivered: 100, returned: 8, success_ratio: 93 } },
    expectedRisk: "safe",
    expectedIsHighRisk: false,
  },
  {
    name: "Genuine High Return Risk: 2 delivered, 10 returned",
    input: { overall: { total: 12, delivered: 2, returned: 10, success_ratio: 17 } },
    expectedRisk: "fraud",
    expectedIsHighRisk: true,
  },
  {
    name: "Medium Return Risk: 6 delivered, 3 returned",
    input: { overall: { total: 9, delivered: 6, returned: 3, success_ratio: 67 } },
    expectedRisk: "risky",
    expectedIsHighRisk: false,
  },
  {
    name: "Serial returner: 0 delivered, 3 returned",
    input: { overall: { total: 3, delivered: 0, returned: 3, success_ratio: 0 } },
    expectedRisk: "fraud",
    expectedIsHighRisk: true,
  },
  {
    name: "Reported Fraud: 1 fraud report",
    input: { fraud_reports: { count: 1, reports: [{}] }, overall: { total: 10, delivered: 8, returned: 2 } },
    expectedRisk: "fraud",
    expectedIsHighRisk: true,
  },
  {
    name: "Clean customer: 1 delivered, 0 returned",
    input: { overall: { total: 1, delivered: 1, returned: 0, success_ratio: 100 } },
    expectedRisk: "safe",
    expectedIsHighRisk: false,
  }
];

let allPassed = true;
for (const tc of testCases) {
  const result = analyzeCustomerRisk(tc.input);
  const passed = result.riskLevel === tc.expectedRisk && result.isHighRisk === tc.expectedIsHighRisk;
  console.log(`[${passed ? "PASS" : "FAIL"}] ${tc.name}`);
  console.log(`  -> riskLevel: ${result.riskLevel}, score: ${result.riskScore}, label: "${result.ratingLabel}", badge: "${result.badgeText}"`);
  console.log(`  -> recommendation: "${result.recommendation}"`);
  if (!passed) {
    allPassed = false;
    console.error(`  Expected: riskLevel=${tc.expectedRisk}, isHighRisk=${tc.expectedIsHighRisk}`);
  }
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log("\nALL RISK ANALYTICS TESTS PASSED!");
}
