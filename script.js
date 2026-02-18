(() => {
  const $ = (id) => document.getElementById(id);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const money0 = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    });

  const money2 = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const annualToMonthly = (r) => (1 + r) ** (1 / 12) - 1;

  function sumSeries(month0, annualR, years) {
    const m0 = clamp(num(month0, 0), 0, 1e9);
    const Y = clamp(parseInt(years || 25, 10), 1, 30);
    const rm = annualR ? annualToMonthly(num(annualR, 0)) : 0;

    let total = 0;
    let m = m0;

    for (let i = 0; i < Y * 12; i++) {
      total += m;
      m *= 1 + rm;
    }
    return total;
  }

  function monthAtYear(month0, annualR, year) {
    const m0 = clamp(num(month0, 0), 0, 1e9);
    const y = clamp(parseInt(year || 1, 10), 1, 30);
    const rm = annualR ? annualToMonthly(num(annualR, 0)) : 0;
    const months = y * 12 - 1;
    return m0 * (1 + rm) ** months;
  }

  function wireMainCalc() {
    const billEl = $("bill");
    const yearsEl = $("yearsRange");
    const yearsDisplayEl = $("yearsDisplay");
    const utilEscEl = $("utilityEsc");
    const runBtn = $("runBtn");

    if (!billEl || !yearsEl || !yearsDisplayEl || !utilEscEl || !runBtn) return;

    const utilTotalEl = $("utilTotal");
    const savingsEl = $("savings");

    const snapYearEl = $("snapYear");
    const selMonthlyUtilityEl = $("selMonthlyUtility");
    const selMonthlySavingsEl = $("selMonthlySavings");
    const selAnnualSavingsEl = $("selAnnualSavings");

    function recalc() {
      const bill = num(billEl.value, 0);
      const years = clamp(parseInt(yearsEl.value || "25", 10), 1, 30);
      const utilEsc = num(utilEscEl.value, 0.09);

      yearsDisplayEl.textContent = String(years);

      const utilTotal = sumSeries(bill, utilEsc, years);

      // No solar payment shown anywhere — savings equals projected utility cost
      if (utilTotalEl) utilTotalEl.textContent = money0(utilTotal);
      if (savingsEl) savingsEl.textContent = money0(utilTotal);

      if (snapYearEl) snapYearEl.textContent = String(years);

      const uM = monthAtYear(bill, utilEsc, years);

      if (selMonthlyUtilityEl) selMonthlyUtilityEl.textContent = money2(uM);
      if (selMonthlySavingsEl) selMonthlySavingsEl.textContent = money2(uM);
      if (selAnnualSavingsEl) selAnnualSavingsEl.textContent = money2(uM * 12);
    }

    billEl.addEventListener("input", recalc);
    yearsEl.addEventListener("input", recalc);
    runBtn.addEventListener("click", recalc);

    recalc();
  }

  // battery models (editable)
  const BATTERIES = [
    { id: "PW3", label: "Tesla Powerwall 3", usableKwh: 13.5, powerKw: 11.5 },
    { id: "PW2", label: "Tesla Powerwall 2", usableKwh: 13.5, powerKw: 5.0 },
    { id: "FRANKLIN", label: "FranklinWH (aPower)", usableKwh: 13.6, powerKw: 5.0 }
  ];

  // Programs:
  // APS Tesla VPP: marketed as "up to ~$600 per battery per year" -> paid 2x/yr, but still $600/yr total.
  // We model a $600/battery/year cap.
  // SRP Battery Partner: $55 per kW per season, 2 seasons/yr = $110 per kW-year.
  const PROGRAMS = {
    APS_TESLA_VPP: {
      label: "APS Tesla VPP",
      capPerBatteryYear: 600,
      note:
        "APS Tesla VPP is commonly described as up to about $600 per battery per year (often paid twice per year). This estimator scales toward that annual cap based on avg event kW and performance."
    },
    SRP_BATTERY_PARTNER: {
      label: "SRP Battery Partner",
      ratePerKwSeason: 55,
      seasonsPerYear: 2,
      note:
        "SRP Battery Partner is $55 per kW per season, 2 seasons per year (annualized here). Actual payouts depend on measured event performance vs baseline."
    }
  };

  function wireBatteryCalc() {
    const programEl = $("program");
    const modelEl = $("batteryModel");
    const qtyEl = $("batteryQty");
    const peakDemandEl = $("peakDemandKw");
    const autoFromDemandEl = $("autoFromDemand");
    const commitEl = $("commitKw");
    const perfEl = $("perf");

    const usableEl = $("usableKwh");
    const powerEl = $("powerKw");
    const creditedEl = $("creditedKw");

    const btn = $("calcBatteryBtn");
    const monthlyOut = $("monthlyCredit");
    const annualOut = $("annualCredit");
    const noteOut = $("creditNote");

    if (
      !programEl || !modelEl || !qtyEl || !peakDemandEl || !autoFromDemandEl || !commitEl || !perfEl ||
      !usableEl || !powerEl || !creditedEl ||
      !btn || !monthlyOut || !annualOut || !noteOut
    ) return;

    modelEl.innerHTML = BATTERIES.map(b => `<option value="${b.id}">${b.label}</option>`).join("");
    if (!modelEl.value) modelEl.value = BATTERIES[0].id;

    const getBattery = () => BATTERIES.find(b => b.id === modelEl.value) || BATTERIES[0];

    function suggestCommitKwPerBattery(batteryPowerKw, qty) {
      const peakDemand = num(peakDemandEl.value, 0);
      if (!(peakDemand > 0)) return null;

      // conservative “avg event” conversion from peak demand
      const eventAvgFactor = 0.60;

      const suggestedTotal = peakDemand * eventAvgFactor;
      const suggestedPerBattery = suggestedTotal / qty;

      return clamp(suggestedPerBattery, 0, batteryPowerKw);
    }

    function updateDerived() {
      const b = getBattery();
      const qty = clamp(parseInt(qtyEl.value || "1", 10), 1, 99);

      const perfDefault = 0.85;
      let perf = clamp(num(perfEl.value, perfDefault), 0, 1);
      if (!(perf > 0)) perf = perfDefault;
      perfEl.value = String(perf);

      const maxPower = b.powerKw * qty;
      const usable = b.usableKwh * qty * perf;

      usableEl.value = usable.toFixed(1);
      powerEl.value = maxPower.toFixed(1);

      const autoOn = String(autoFromDemandEl.value) === "1";
      if (autoOn) {
        const suggestion = suggestCommitKwPerBattery(b.powerKw, qty);
        if (suggestion != null) {
          commitEl.value = suggestion.toFixed(1);
        }
      }

      // Default commit kW per battery if user doesn't know what to enter
      const commitPerBattery = clamp(num(commitEl.value, 4.5), 0, 1e6);

      // credited kW includes perf and cannot exceed max deliverable
      const creditedRaw = commitPerBattery * qty * perf;
      const credited = Math.min(creditedRaw, maxPower * perf);

      creditedEl.value = credited.toFixed(2);

      return { b, qty, perf, maxPower, commitPerBattery, credited };
    }

    function calcCredit() {
      const { b, qty, perf, maxPower, commitPerBattery, credited } = updateDerived();
      const programKey = programEl.value || "APS_TESLA_VPP";

      let annual = 0;
      let monthly = 0;

      if (programKey === "SRP_BATTERY_PARTNER") {
        const p = PROGRAMS.SRP_BATTERY_PARTNER;
        const ratePerKwYear = p.ratePerKwSeason * p.seasonsPerYear;
        annual = credited * ratePerKwYear;
        monthly = annual / 12;

        annualOut.textContent = money0(annual);
        monthlyOut.textContent = money0(monthly);

        noteOut.textContent =
          `${p.note} Battery: ${b.label}. Qty: ${qty}. Perf: ${Math.round(perf * 100)}%. Avg event kW per battery: ${commitPerBattery.toFixed(1)}. Credited kW: ${credited.toFixed(2)}.`;
        return;
      }

      // APS Tesla VPP (cap model)
      const p = PROGRAMS.APS_TESLA_VPP;

      const cap = p.capPerBatteryYear * qty;

      // utilization scales credited vs max deliverable (keeps it under cap)
      const maxCreditable = maxPower * perf;
      const utilization = maxCreditable > 0 ? clamp(credited / maxCreditable, 0, 1) : 0;

      annual = cap * utilization;
      monthly = annual / 12;

      annualOut.textContent = money0(annual);
      monthlyOut.textContent = money0(monthly);

      noteOut.textContent =
        `${p.note} Battery: ${b.label}. Qty: ${qty}. Perf: ${Math.round(perf * 100)}%. Avg event kW per battery: ${commitPerBattery.toFixed(1)}. Credited kW: ${credited.toFixed(2)}. Annual cap: ${money0(cap)}.`;
    }

    programEl.addEventListener("change", calcCredit);
    modelEl.addEventListener("change", calcCredit);
    qtyEl.addEventListener("input", calcCredit);
    peakDemandEl.addEventListener("input", calcCredit);
    autoFromDemandEl.addEventListener("change", calcCredit);
    commitEl.addEventListener("input", calcCredit);
    perfEl.addEventListener("input", calcCredit);
    btn.addEventListener("click", calcCredit);

    calcCredit();
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireMainCalc();
    wireBatteryCalc();
  });
})();
