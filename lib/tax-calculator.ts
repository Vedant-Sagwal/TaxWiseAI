export type TaxRegime = "new" | "old";
export type TaxEstimateInput = {
  income: number;
  deductions: number;
  isSalaried: boolean;
  ageBand: "under60" | "senior" | "superSenior";
  regime: TaxRegime;
  resident: boolean;
};

export type TaxEstimate = {
  standardDeduction: number;
  taxableIncome: number;
  incomeTax: number;
  rebate: number;
  cess: number;
  totalTax: number;
  notes: string[];
};

const NEW_SLABS: Array<[number, number]> = [[400_000, 0], [800_000, 0.05], [1_200_000, 0.1], [1_600_000, 0.15], [2_000_000, 0.2], [2_400_000, 0.25], [Infinity, 0.3]];

function slabTax(income: number, slabs: Array<[number, number]>) {
  let previousLimit = 0;
  let tax = 0;
  for (const [limit, rate] of slabs) {
    const portion = Math.max(0, Math.min(income, limit) - previousLimit);
    tax += portion * rate;
    previousLimit = limit;
    if (income <= limit) break;
  }
  return tax;
}

function oldSlabs(ageBand: TaxEstimateInput["ageBand"]): Array<[number, number]> {
  const exemption = ageBand === "superSenior" ? 500_000 : ageBand === "senior" ? 300_000 : 250_000;
  return [[exemption, 0], [500_000, 0.05], [1_000_000, 0.2], [Infinity, 0.3]];
}

/** Educational estimate for ordinary slab income for FY 2026–27 (Tax Year 2026–27). */
export function estimateIncomeTax(input: TaxEstimateInput): TaxEstimate {
  const income = Math.max(0, input.income);
  const deductions = Math.max(0, input.deductions);
  const standardDeduction = input.isSalaried ? (input.regime === "new" ? 75_000 : 50_000) : 0;
  const taxableIncome = Math.max(0, income - deductions - standardDeduction);
  const incomeTax = slabTax(taxableIncome, input.regime === "new" ? NEW_SLABS : oldSlabs(input.ageBand));
  const rebateLimit = input.regime === "new" ? 1_200_000 : 500_000;
  const maximumRebate = input.regime === "new" ? 60_000 : 12_500;
  const rebate = input.resident && taxableIncome <= rebateLimit ? Math.min(incomeTax, maximumRebate) : 0;
  const taxAfterRebate = Math.max(0, incomeTax - rebate);
  const cess = taxAfterRebate * 0.04;
  const totalTax = taxAfterRebate + cess;
  const notes = ["Includes 4% health and education cess."];
  if (income > 5_000_000) notes.push("Surcharge and marginal relief are not included; use the portal or a professional for high-income calculations.");
  if (!input.resident) notes.push("The resident-only section 87A rebate has not been applied.");
  notes.push("This estimate excludes special-rate income (for example, many capital gains), interest, penalties, TDS already paid, and advance tax.");
  return { standardDeduction, taxableIncome, incomeTax, rebate, cess, totalTax, notes };
}
