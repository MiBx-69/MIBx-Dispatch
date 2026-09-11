/**
 * Risk Analytics Engine
 * Evaluates customer delivery history and fraud indicators using proportional analytics.
 * Avoids false positives (e.g., customers with 100 deliveries and 8 returns have a 92.6%
 * success rate and should be considered highly reliable, not "High Return Risk").
 */

export interface CustomerRiskAnalysis {
  riskLevel: "safe" | "risky" | "fraud" | "unchecked";
  riskScore: number; // 0 to 100
  isHighRisk: boolean;
  isMediumRisk: boolean;
  isSafe: boolean;
  total: number;
  delivered: number;
  returned: number;
  successRatio: number; // 0 to 100 (%)
  returnRatio: number; // 0 to 100 (%)
  fraudReportsCount: number;
  ratingLabel: string;
  badgeText: string;
  recommendation: string;
  reasons: string[];
}

export interface RiskInputData {
  fraud_data?: any;
  fraud_status?: string | null;
  fraud_score?: number | null;
  delivered?: number;
  returned?: number;
  total?: number;
}

export function analyzeCustomerRisk(input: RiskInputData | any): CustomerRiskAnalysis {
  // 1. Extract fraud_data if nested or passed directly
  const data = input?.fraud_data || input || {};
  const overall = data?.overall || {};
  const fraudReports = data?.fraud_reports || {};

  // 2. Extract metrics
  const fraudReportsCount = Number(fraudReports?.count || 0);
  const delivered = Number(
    overall.delivered ?? input?.delivered ?? 0
  );
  const returned = Number(
    overall.returned ?? input?.returned ?? 0
  );
  
  let total = Number(overall.total ?? input?.total ?? 0);
  if (total <= 0 && delivered + returned > 0) {
    total = delivered + returned;
  }

  // Pre-calculated success_ratio or computed on the fly
  let successRatio = 0;
  if (typeof overall.success_ratio === "number" && overall.success_ratio >= 0) {
    successRatio = Math.round(overall.success_ratio);
  } else if (total > 0) {
    successRatio = Math.round((delivered / total) * 100);
  }

  const returnRatio = total > 0 ? Math.round((returned / total) * 100) : 0;

  // Check if we have any historical courier/delivery data
  const hasDeliveryData = total > 0 || delivered > 0 || returned > 0;

  // 3. Evaluate Risk Tiers using proportional analytics
  let riskLevel: "safe" | "risky" | "fraud" | "unchecked" = "unchecked";
  let riskScore = 0;
  let ratingLabel = "Unchecked Customer";
  let badgeText = "Unchecked";
  let recommendation = "No courier history found yet. Phone confirmation recommended for new customers.";
  const reasons: string[] = [];

  // A. Explicit Fraud Reports from merchants (highest priority)
  if (fraudReportsCount > 0) {
    riskLevel = "fraud";
    riskScore = 100;
    ratingLabel = "Reported Fraud Risk";
    badgeText = `Reported Fraud (${fraudReportsCount})`;
    recommendation = `Customer has ${fraudReportsCount} complaint report(s) filed by other merchants on FraudSpy. High risk of refusal or scam.`;
    reasons.push(`${fraudReportsCount} merchant report(s) filed against this number on FraudSpy`);
  } 
  // B. Delivery courier analytics available
  else if (hasDeliveryData) {
    // Case 1: High volume, high delivery success rate (e.g., 100 deliveries, 8 returns = 92.6% success)
    if (delivered >= 10 && successRatio >= 80) {
      riskLevel = "safe";
      // Low risk score proportional to return rate (capped at 20)
      riskScore = Math.max(0, Math.min(20, Math.round(returnRatio * 1.5)));
      ratingLabel = "Highly Reliable Customer";
      badgeText = `${successRatio}% DLV (${delivered} Del)`;
      recommendation = `Safe to dispatch. Outstanding track record with ${delivered} successful deliveries (${successRatio}% delivery rate).`;
      reasons.push(`${delivered} successful deliveries across courier networks`);
      reasons.push(`High delivery success rate of ${successRatio}% (return rate is only ${returnRatio}%)`);
    }
    // Case 2: Good delivery history (total >= 4 and successRatio >= 75%)
    else if (total >= 4 && successRatio >= 75) {
      riskLevel = "safe";
      riskScore = Math.max(0, Math.min(25, Math.round(returnRatio * 1.5)));
      ratingLabel = "Safe Customer";
      badgeText = `${successRatio}% DLV (${delivered} Del)`;
      recommendation = `Safe to dispatch. Customer has a proven ${successRatio}% courier delivery rate.`;
      reasons.push(`${delivered} deliveries out of ${total} orders (${successRatio}% success)`);
      if (returned > 0) {
        reasons.push(`Low return rate of ${returnRatio}% (${returned} returns)`);
      }
    }
    // Case 3: Genuine High Return Risk
    // - Total >= 3 and return rate >= 50% (success rate < 50%), OR
    // - Serial returner with 0 deliveries (returned >= 2 and delivered === 0)
    else if ((total >= 3 && successRatio < 50) || (returned >= 2 && delivered === 0)) {
      riskLevel = "fraud";
      riskScore = Math.min(95, Math.max(80, Math.round(100 - successRatio + 10)));
      ratingLabel = "High Return Risk";
      badgeText = `High Return Risk (${returnRatio}% Ret)`;
      recommendation = `High return risk! Customer returns ${returnRatio}% of orders (${returned} of ${total} returned). Require advance delivery charge before dispatching.`;
      reasons.push(`Critical return rate of ${returnRatio}% (${returned} returned out of ${total} parcels)`);
      reasons.push(`Courier delivery success rate is only ${successRatio}%`);
    }
    // Case 4: Medium Return Risk
    // - Total >= 4 and return rate between 25% and 50% (success rate between 50% and 74%)
    // - Low volume: 2-3 total orders with 1 return and delivered === 0 or successRatio < 65%
    else if (
      (total >= 4 && successRatio >= 50 && successRatio < 75) ||
      (total <= 3 && returned >= 1 && successRatio < 65)
    ) {
      riskLevel = "risky";
      riskScore = Math.min(75, Math.max(45, Math.round(100 - successRatio)));
      ratingLabel = "Medium Return Risk";
      badgeText = `Medium Risk (${returnRatio}% Ret)`;
      recommendation = `Customer has a ${returnRatio}% return rate (${returned} returns). Recommended to call customer and confirm delivery commitment before dispatching.`;
      reasons.push(`Moderate return rate of ${returnRatio}% (${returned} returned, ${delivered} delivered)`);
      reasons.push(`Courier delivery success rate is ${successRatio}%`);
    }
    // Case 5: Low volume, clean record (1-3 orders, 0 returns)
    else if (returned === 0) {
      riskLevel = "safe";
      riskScore = 0;
      ratingLabel = delivered > 0 ? "Verified Customer" : "New Customer";
      badgeText = delivered > 0 ? `${delivered} Delivered` : "Clean Record";
      recommendation = delivered > 0 
        ? `Clean delivery record with ${delivered} successful delivery(ies) and 0 returns.`
        : "New customer with 0 courier returns recorded.";
      if (delivered > 0) reasons.push(`${delivered} successful delivery(ies) with 0 returns`);
      else reasons.push("No courier returns on record");
    }
    // Case 6: Fallback for any other small edge cases
    else {
      riskLevel = "safe";
      riskScore = 15;
      ratingLabel = "Acceptable Risk";
      badgeText = `${successRatio}% DLV`;
      recommendation = `Courier success rate is ${successRatio}%. Normal order.`;
      reasons.push(`${delivered} delivered, ${returned} returned (${successRatio}% success)`);
    }
  } 
  // C. No courier data, but existing fraud_status/fraud_score from DB
  else if (input?.fraud_status && input.fraud_status !== "unchecked") {
    riskLevel = input.fraud_status as any;
    riskScore = Number(input.fraud_score || 0);
    if (riskLevel === "fraud") {
      ratingLabel = "High Risk";
      badgeText = `High Risk (${riskScore})`;
      recommendation = "Marked as high risk. Please verify with customer before shipping.";
      reasons.push("Marked as high risk in database");
    } else if (riskLevel === "risky") {
      ratingLabel = "Medium Risk";
      badgeText = `Medium Risk (${riskScore})`;
      recommendation = "Marked as medium risk. Call customer to confirm delivery address.";
      reasons.push("Marked as medium risk in database");
    } else {
      riskLevel = "safe";
      ratingLabel = "Safe";
      badgeText = "Safe";
      recommendation = "Customer is marked safe.";
      reasons.push("Customer is marked safe");
    }
  }

  return {
    riskLevel,
    riskScore,
    isHighRisk: riskLevel === "fraud",
    isMediumRisk: riskLevel === "risky",
    isSafe: riskLevel === "safe",
    total,
    delivered,
    returned,
    successRatio,
    returnRatio,
    fraudReportsCount,
    ratingLabel,
    badgeText,
    recommendation,
    reasons,
  };
}
