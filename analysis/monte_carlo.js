"use strict";

const fs = require("node:fs");
const path = require("node:path");

const GAME_COUNT = Number(process.argv[2] || 10000);
const OUTPUT_DIR = path.join(__dirname, "..", "output", "analysis");
const DECADES = ["20s", "30s", "40s", "50s", "60s+"];
const GROUPS = ["Disadvantaged", "Middle", "Advantaged"];
const STRATEGIES = ["Planner", "Balanced", "Myopic"];

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleSd(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function meanCi(values) {
  const average = mean(values);
  const se = sampleSd(values) / Math.sqrt(values.length);
  return { mean: average, sd: sampleSd(values), low: average - 1.96 * se, high: average + 1.96 * se };
}

function wilson(successes, total) {
  if (!total) return { proportion: 0, low: 0, high: 0 };
  const z = 1.96;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const half =
    (z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / total + (z * z) / (4 * total * total));
  return { proportion, low: center - half, high: center + half };
}

function gini(values) {
  const nonnegative = values.map((value) => Math.max(0, value)).sort((a, b) => a - b);
  const total = nonnegative.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  let weighted = 0;
  for (let index = 0; index < nonnegative.length; index += 1) weighted += (index + 1) * nonnegative[index];
  return (2 * weighted) / (nonnegative.length * total) - (nonnegative.length + 1) / nonnegative.length;
}

function ageingClass(health) {
  if (health >= 15) return "Optimal";
  if (health >= 8) return "Usual";
  return "Pathological";
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function startingPlayers(startType, random) {
  const groupPattern = startType === "equal"
    ? Array(6).fill("Middle")
    : ["Disadvantaged", "Disadvantaged", "Middle", "Middle", "Advantaged", "Advantaged"];
  const strategyPattern = shuffle(["Planner", "Planner", "Balanced", "Balanced", "Myopic", "Myopic"], random);
  return groupPattern.map((group, index) => {
    const perMetric = group === "Disadvantaged" ? 8 : group === "Advantaged" ? 12 : 10;
    return { group, strategy: strategyPattern[index], ec: perMetric, hc: perMetric, sc: perMetric, wb: 10 };
  });
}

const STRATEGY_PROFILE = {
  Planner: { ec: 0.9, hc: 1.0, sc: 0.9, wb: 0.9, future: 2.4, noise: 2.0 },
  Balanced: { ec: 1.0, hc: 1.0, sc: 1.0, wb: 1.0, future: 1.0, noise: 3.5 },
  Myopic: { ec: 1.4, hc: 1.0, sc: 0.7, wb: 0.5, future: 0.1, noise: 4.5 },
};

function selectChoice(player, choices, strategy, random, metrics) {
  const profile = STRATEGY_PROFILE[strategy];
  const scored = choices.map((choice) => {
    const delta = choice.delta || {};
    let score = (choice.future || 0) * profile.future;
    for (const metric of metrics) score += (delta[metric] || 0) * (profile[metric] || 1);
    score += (random() - 0.5) * profile.noise;
    return { choice, score };
  });
  const maximum = Math.max(...scored.map((item) => item.score));
  const weights = scored.map((item) => Math.exp((item.score - maximum) / 2));
  let roll = random() * weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < scored.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return scored[index].choice;
  }
  return scored.at(-1).choice;
}

function createTunedRunner() {
  const makeElement = () => ({
    hidden: false,
    innerHTML: "",
    textContent: "",
    className: "",
    disabled: false,
    value: "bots",
    addEventListener() {},
    appendChild() {},
  });
  const elements = new Map();
  const documentStub = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
    createElement: makeElement,
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const scenario = `
    return function simulate(config, starts, strategyNames) {
      PRIORITY_CHOICES.find((choice) => choice.id === "recover").delta.hc = config.calibrated ? 1 : 2;
      PRIORITY_CHOICES.find((choice) => choice.id === "request-assistance").delta.ec = config.calibrated ? 1 : 2;
      for (const id of ["household-dependent-reserve", "household-partner-reserve", "household-independent-reserve"]) {
        HOUSEHOLD_PRIORITY_CHOICES.find((choice) => choice.id === id).delta.ec = config.calibrated ? 2 : 4;
      }
      RANDOM_EVENTS.find((event) => event.id === "treatment-grant").outcome = () => ({
        delta: { hc: config.calibrated ? 1 : 2 },
        text: "Institutional support contained part of the loss but did not erase the earlier shortfall.",
      });
      RANDOM_EVENTS.find((event) => event.id === "targeted-subsidy").outcome = () => ({
        delta: { ec: config.calibrated ? 1 : 3 },
        text: "Eligibility contained immediate hardship without creating durable economic protection.",
      });
      const experimentalBackground = { id: "controlled", label: "Controlled start", description: "Experimental condition.", delta: {} };
      const players = starts.map((start, index) => {
        const player = makePlayer("P" + (index + 1), index === 0, index, experimentalBackground);
        player.ec = start.ec; player.hc = start.hc; player.sc = start.sc; player.wb = start.wb;
        player.experimentalGroup = start.group;
        player.experimentalStrategy = strategyNames[index];
        player.history = [snapshot(player)];
        player.journey = [];
        return player;
      });
      state = {
        mode: "bots", round: 0, phase: "event", players, activePlayerId: players[0].id,
        phaseQueue: [], turnPosition: 0, log: [], shockMessage: "", selectedEventChoice: null,
        selectedPriorityChoice: null, householdQuestionThisRound: false,
        feedbackEnabled: config.feedbackEnabled,
      };
      const trajectories = players.map((player) => [{ ec: player.ec, hc: player.hc, sc: player.sc, wb: player.wb }]);
      for (let round = 0; round < ROUND_LABELS.length; round += 1) {
        state.round = round;
        applyStartOfRoundEffects();
        const event = LIFE_EVENTS[round];
        for (let index = 0; index < players.length; index += 1) {
          const player = players[index];
          const strategy = strategyNames[index];
          const viable = event.choices.filter((choice) => choiceAvailable(player, choice));
          const eventChoice = viable.length
            ? config.select(player, viable, strategy, METRICS)
            : selectForcedChoice(player, event.choices);
          if (!viable.length) player.fallback += 1;
          applyChoice(player, eventChoice);
          const household = getHouseholdChoices(player).filter((choice) => choiceAvailable(player, choice));
          if (household.length) applyChoice(player, config.select(player, household, strategy, METRICS));
          if (!isBareCoping(player)) {
            const priorities = getPriorityChoices(player);
            if (priorities.length) applyChoice(player, config.select(player, priorities, strategy, METRICS));
          }
        }
        for (const player of players) {
          applyMaintenance(player);
          clampCapital(player);
          trajectories[players.indexOf(player)].push({ ec: player.ec, hc: player.hc, sc: player.sc, wb: player.wb });
        }
      }
      return { players, trajectories };
    };
  `;
  const factory = new Function("document", "FormData", `${source}\n${scenario}`);
  return factory(documentStub, class FormDataStub {});
}

const ORIGINAL_EVENTS = [
  [
    { id: "school", delta: { ec: -4, hc: -2 }, traits: ["careerSecurity"], pending: { ec: 5 }, future: 3 },
    { id: "job", delta: { ec: 2, sc: 1 }, future: 1, special: (p, r) => { if (p.ec >= 12 && r() < 0.6) p.traits.add("careerSecurity"); } },
    { id: "hours", delta: { ec: -2, sc: 3, hc: 1 }, traits: ["careDuty"], future: 0.5 },
  ],
  [
    { id: "buy", delta: { ec: -5, sc: 2 }, traits: ["homeEquity"], future: 2 },
    { id: "rent", delta: { ec: -1, hc: 1 }, traits: ["mobility"], future: 1 },
    { id: "borrow", delta: { ec: 1 }, traits: ["debt", "homeEquity"], future: 0.2 },
  ],
  [
    { id: "security", delta: { ec: -2 }, requires: ["careerSecurity"], future: 2 },
    { id: "lower-job", delta: { ec: -3, hc: -1, sc: 1 }, future: 0.5 },
    { id: "exit", delta: { ec: -5, hc: 3, sc: 2 }, future: 0, special: (p) => { if (p.traits.has("pension")) p.ec += 2; } },
  ],
  [
    { id: "treatment", delta: { ec: -1, hc: -2 }, traits: ["chronicCondition"], future: 2 },
    { id: "ration", delta: { ec: 1, hc: -5 }, traits: ["chronicCondition", "careRisk"], future: -1 },
    { id: "network-care", delta: { ec: -1, sc: -1 }, traits: ["chronicCondition"], future: 1, special: (p) => { if (p.traits.has("kinNetwork")) { p.ec += 1; p.hc += 1; } else p.hc -= 2; } },
  ],
  [
    { id: "retire", delta: { ec: -4, hc: 3, sc: 2 }, future: 1, special: (p) => { if (p.traits.has("pension")) p.ec += 2; } },
    { id: "work", delta: { ec: 4, hc: -3, sc: -1 }, future: 0 },
    { id: "part-time", delta: { ec: 1, hc: 1, sc: 1 }, future: 1.5, special: (p) => { if (p.traits.has("mobility")) p.hc += 1; } },
  ],
];

const ORIGINAL_PRIORITIES = [
  { id: "career", delta: { ec: -4, hc: -1 }, traits: ["careerSecurity"], future: 3, maxRound: 2 },
  { id: "cover", delta: { ec: -3, hc: 3 }, traits: ["healthCover"], future: 2, maxRound: 3 },
  { id: "network", delta: { ec: -2, hc: -1, sc: 4 }, traits: ["kinNetwork"], future: 2, maxRound: 3 },
  { id: "home", delta: { ec: -5, sc: 1 }, traits: ["homeEquity"], future: 2, maxRound: 2 },
  { id: "pension", delta: { ec: -3 }, traits: ["pension"], future: 3, minRound: 1 },
  { id: "assets", delta: { ec: -5 }, traits: ["assetPortfolio"], pending: { ec: 5 }, future: 2, maxRound: 2 },
  { id: "overtime", delta: { ec: 3, hc: -2, sc: -1 }, traits: ["burnout"], future: -1 },
];

function clampOriginal(player) {
  for (const key of ["ec", "hc", "sc"]) player[key] = Math.max(0, Math.min(20, Math.round(player[key])));
}

function originalAvailable(player, choice) {
  if ((choice.requires || []).some((trait) => !player.traits.has(trait))) return false;
  return ["ec", "hc", "sc"].every((key) => player[key] + ((choice.delta || {})[key] || 0) >= 0);
}

function applyOriginalChoice(player, choice, random) {
  for (const key of ["ec", "hc", "sc"]) player[key] += (choice.delta || {})[key] || 0;
  for (const trait of choice.traits || []) player.traits.add(trait);
  for (const key of ["ec", "hc", "sc"]) player.pending[key] = (player.pending[key] || 0) + ((choice.pending || {})[key] || 0);
  if (choice.special) choice.special(player, random);
  clampOriginal(player);
}

function simulateOriginal(config, starts, random) {
  const players = starts.map((start) => ({ ...start, traits: new Set(), pending: {}, fallback: 0 }));
  const trajectories = players.map((player) => [{ ec: player.ec, hc: player.hc, sc: player.sc, wb: 10 }]);
  for (let round = 0; round < DECADES.length; round += 1) {
    for (const player of players) {
      for (const key of ["ec", "hc", "sc"]) {
        player[key] += player.pending[key] || 0;
        player.pending[key] = 0;
      }
      if (round === 2) {
        let loss = player.ec <= 6 ? 5 : 3;
        if (player.traits.has("careerSecurity")) loss -= 1;
        if (player.traits.has("mobility")) loss -= 1;
        if (player.traits.has("debt")) loss += 1;
        if (player.traits.has("assetPortfolio")) loss += 1;
        player.ec -= Math.max(1, loss);
      }
      if (round === 4) {
        if (player.hc <= 7) player.hc += 3;
        if (player.traits.has("chronicCondition")) player.hc += 2;
        if (player.traits.has("healthCover")) player.ec += 1;
      }
      clampOriginal(player);
      const eventChoices = ORIGINAL_EVENTS[round].filter((choice) => originalAvailable(player, choice));
      const eventChoice = eventChoices.length
        ? selectChoice(player, eventChoices, player.strategy, random, ["ec", "hc", "sc"])
        : ORIGINAL_EVENTS[round].slice().sort((a, b) => (b.future || 0) - (a.future || 0))[0];
      if (!eventChoices.length) player.fallback += 1;
      applyOriginalChoice(player, eventChoice, random);
      if (!["ec", "hc", "sc"].some((key) => player[key] <= 4)) {
        const priorities = ORIGINAL_PRIORITIES.filter((choice) => {
          if (choice.minRound != null && round < choice.minRound) return false;
          if (choice.maxRound != null && round > choice.maxRound) return false;
          if ((choice.traits || []).some((trait) => player.traits.has(trait))) return false;
          return originalAvailable(player, choice);
        });
        if (priorities.length) applyOriginalChoice(player, selectChoice(player, priorities, player.strategy, random, ["ec", "hc", "sc"]), random);
      }
      if (player.traits.has("debt")) player.ec -= 1;
      if (player.traits.has("burnout")) player.hc -= 1;
      if (player.traits.has("careDuty") && round >= 2) { player.ec -= 1; player.hc -= 1; }
      if (player.traits.has("healthCover")) player.ec -= 1;
      if (player.traits.has("chronicCondition")) {
        player.hc -= 1;
        if (!player.traits.has("healthCover")) player.ec -= 1;
      }
      clampOriginal(player);
      trajectories[players.indexOf(player)].push({ ec: player.ec, hc: player.hc, sc: player.sc, wb: 10 });
    }
  }
  return { players, trajectories };
}

function analyzeCondition(condition, simulateTuned) {
  const gameRows = [];
  const lives = [];
  const trajectorySample = [];
  for (let game = 0; game < GAME_COUNT; game += 1) {
    const pairedSeed = hashSeed(`${condition.rules}|${condition.starts}|${game}`);
    const random = mulberry32(pairedSeed);
    const starts = startingPlayers(condition.starts, random);
    const strategies = starts.map((start) => start.strategy);
    let result;
    const originalRandom = Math.random;
    Math.random = random;
    try {
      result = simulateTuned(
        {
          calibrated: true,
          feedbackEnabled: condition.feedbackOn,
          select: (player, choices, strategy, metrics) => selectChoice(player, choices, strategy, random, metrics),
        },
        starts,
        strategies
      );
    } finally {
      Math.random = originalRandom;
    }
    const capitalByRound = DECADES.map((_, round) =>
      result.trajectories.map((trajectory) => trajectory[round + 1].ec + trajectory[round + 1].hc + trajectory[round + 1].sc)
    );
    const groupMean = (round, group) => {
      const values = result.trajectories
        .map((trajectory, index) => ({ value: trajectory[round].ec + trajectory[round].hc + trajectory[round].sc, group: starts[index].group }))
        .filter((item) => item.group === group)
        .map((item) => item.value);
      return values.length ? mean(values) : null;
    };
    const finalClasses = result.players.map((player) => ageingClass(player.hc));
    const row = {
      condition: condition.id,
      game: game + 1,
      seed: pairedSeed,
      start_gini: gini(starts.map((start) => start.ec + start.hc + start.sc)),
      gini_20s: gini(capitalByRound[0]),
      gini_30s: gini(capitalByRound[1]),
      gini_40s: gini(capitalByRound[2]),
      gini_50s: gini(capitalByRound[3]),
      gini_60s: gini(capitalByRound[4]),
      start_gap: condition.starts === "unequal" ? groupMean(0, "Advantaged") - groupMean(0, "Disadvantaged") : 0,
      end_gap: condition.starts === "unequal" ? groupMean(5, "Advantaged") - groupMean(5, "Disadvantaged") : 0,
      optimal_rate: finalClasses.filter((value) => value === "Optimal").length / result.players.length,
      usual_rate: finalClasses.filter((value) => value === "Usual").length / result.players.length,
      pathological_rate: finalClasses.filter((value) => value === "Pathological").length / result.players.length,
      mean_final_capital: mean(result.players.map((player) => player.ec + player.hc + player.sc)),
      mean_final_resources: mean(result.players.map((player) => player.ec + player.hc + player.sc + player.wb)),
      fallback_rate: mean(result.players.map((player) => player.fallback > 0 ? 1 : 0)),
    };
    for (const group of GROUPS) {
      const key = group.toLowerCase();
      for (let point = 0; point <= DECADES.length; point += 1) {
        row[`${key}_${point}`] = groupMean(point, group);
      }
    }
    gameRows.push(row);
    result.players.forEach((player, index) => {
      const finalCapital = player.ec + player.hc + player.sc;
      lives.push({
        condition: condition.id,
        group: starts[index].group,
        strategy: starts[index].strategy,
        final_capital: finalCapital,
        final_health: player.hc,
        ageing_class: ageingClass(player.hc),
      });
      if (condition.id === "endogenous_feedback-on_unequal" && game < 15) {
        trajectorySample.push({
          game: game + 1,
          player: index + 1,
          group: starts[index].group,
          strategy: starts[index].strategy,
          values: result.trajectories[index].map((point) => point.ec + point.hc + point.sc),
        });
      }
    });
  }
  return { condition, gameRows, lives, trajectorySample };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(name, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const text = [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, name), text, "utf8");
}

function summarize(allResults) {
  const conditionSummary = [];
  const giniRows = [];
  const groupRows = [];
  const ageingRows = [];
  const strategyRows = [];
  const gameRows = allResults.flatMap((result) => result.gameRows);
  for (const result of allResults) {
    const { condition, lives } = result;
    const finalGini = meanCi(result.gameRows.map((row) => row.gini_60s));
    const endGap = meanCi(result.gameRows.map((row) => row.end_gap));
    const allClasses = ["Optimal", "Usual", "Pathological"].map((className) => ({
      className,
      ...wilson(lives.filter((life) => life.ageing_class === className).length, lives.length),
    }));
    conditionSummary.push({
      condition: condition.id,
      rules: condition.rules,
      feedback: condition.feedbackOn ? "Enabled" : "Disabled",
      starts: condition.starts,
      games: GAME_COUNT,
      lives: lives.length,
      final_gini: finalGini.mean,
      final_gini_ci_low: finalGini.low,
      final_gini_ci_high: finalGini.high,
      start_gap: mean(result.gameRows.map((row) => row.start_gap)),
      end_gap: endGap.mean,
      gap_change: endGap.mean - mean(result.gameRows.map((row) => row.start_gap)),
      optimal_rate: allClasses.find((item) => item.className === "Optimal").proportion,
      usual_rate: allClasses.find((item) => item.className === "Usual").proportion,
      pathological_rate: allClasses.find((item) => item.className === "Pathological").proportion,
      mean_final_capital: mean(result.gameRows.map((row) => row.mean_final_capital)),
      fallback_rate: mean(result.gameRows.map((row) => row.fallback_rate)),
    });
    const giniKeys = ["gini_20s", "gini_30s", "gini_40s", "gini_50s", "gini_60s"];
    giniKeys.forEach((key, index) => {
      const stats = meanCi(result.gameRows.map((row) => row[key]));
      giniRows.push({ condition: condition.id, decade: DECADES[index], ...stats });
    });
    const groups = condition.starts === "equal" ? ["Middle"] : GROUPS;
    for (const group of groups) {
      const groupLives = lives.filter((life) => life.group === group);
      for (const className of ["Optimal", "Usual", "Pathological"]) {
        const stats = wilson(groupLives.filter((life) => life.ageing_class === className).length, groupLives.length);
        ageingRows.push({ condition: condition.id, group, ageing_class: className, count: groupLives.filter((life) => life.ageing_class === className).length, n: groupLives.length, ...stats });
      }
      for (const strategy of STRATEGIES) {
        const subset = groupLives.filter((life) => life.strategy === strategy);
        if (!subset.length) continue;
        const capital = meanCi(subset.map((life) => life.final_capital));
        const health = meanCi(subset.map((life) => life.final_health));
        strategyRows.push({
          condition: condition.id, group, strategy, n: subset.length,
          final_capital: capital.mean, final_capital_ci_low: capital.low, final_capital_ci_high: capital.high,
          final_health: health.mean,
          pathological_rate: subset.filter((life) => life.ageing_class === "Pathological").length / subset.length,
        });
      }
    }
    const groupsForCondition = condition.starts === "equal" ? ["Middle"] : GROUPS;
    for (const group of groupsForCondition) {
      const key = group.toLowerCase();
      for (let point = 0; point <= DECADES.length; point += 1) {
        const values = result.gameRows.map((row) => row[`${key}_${point}`]).filter((value) => value != null);
        const stats = meanCi(values);
        groupRows.push({
          condition: condition.id,
          group,
          point: point === 0 ? "Start" : DECADES[point - 1],
          order: point,
          mean_capital: stats.mean,
          ci_low: stats.low,
          ci_high: stats.high,
        });
      }
    }
  }
  const effects = [];
  for (const starts of ["equal", "unequal"]) {
    const on = gameRows.filter((row) => row.condition === `endogenous_feedback-on_${starts}`);
    const off = gameRows.filter((row) => row.condition === `endogenous_feedback-off_${starts}`);
    for (const metric of ["gini_60s", "end_gap", "pathological_rate", "mean_final_capital"]) {
      const differences = on.map((row, index) => row[metric] - off[index][metric]);
      const stats = meanCi(differences);
      effects.push({
        rules: "endogenous",
        starts,
        metric,
        feedback_enabled_mean: mean(on.map((row) => row[metric])),
        feedback_disabled_mean: mean(off.map((row) => row[metric])),
        difference_enabled_minus_disabled: stats.mean,
        ci_low: stats.low,
        ci_high: stats.high,
      });
    }
  }
  return { conditionSummary, giniRows, groupRows, ageingRows, strategyRows, effects, gameRows };
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const simulateTuned = createTunedRunner();
  const conditions = [];
  for (const feedbackOn of [true, false]) {
    for (const starts of ["equal", "unequal"]) {
      conditions.push({
        id: `endogenous_feedback-${feedbackOn ? "on" : "off"}_${starts}`,
        rules: "endogenous",
        feedbackOn,
        starts,
      });
    }
  }
  const started = Date.now();
  const results = conditions.map((condition) => {
    process.stderr.write(`Running ${condition.id} (${GAME_COUNT.toLocaleString()} games)\n`);
    return analyzeCondition(condition, simulateTuned);
  });
  const summary = summarize(results);
  writeCsv("condition_summary.csv", summary.conditionSummary);
  writeCsv("gini_by_decade.csv", summary.giniRows);
  writeCsv("group_trajectories.csv", summary.groupRows);
  writeCsv("ageing_classification.csv", summary.ageingRows);
  writeCsv("strategy_outcomes.csv", summary.strategyRows);
  writeCsv("feedback_effects.csv", summary.effects);
  writeCsv("game_level_results.csv", summary.gameRows);
  writeCsv("trajectory_sample.csv", results.flatMap((result) => result.trajectorySample).flatMap((sample) =>
    sample.values.map((value, index) => ({
      game: sample.game, player: sample.player, group: sample.group, strategy: sample.strategy,
      point: index === 0 ? "Start" : DECADES[index - 1], order: index, capital: value,
    }))
  ));
  const payload = {
    protocol: {
      gamesPerCondition: GAME_COUNT,
      totalGames: GAME_COUNT * conditions.length,
      playersPerGame: 6,
      totalLives: GAME_COUNT * conditions.length * 6,
      conditions: conditions.map((condition) => condition.id),
      primaryOutcome: "Gini coefficient of EC + HC + SC after each decade",
      unequalStarts: "Two players each at 24, 30, and 36 capital; wellbeing fixed at 10",
      feedbackEnabled: "Resource-conditioned livelihood and investment returns, unequal shock absorption, material-strain exposure, and linked household and health costs",
      feedbackDisabled: "The same choices and random events with the resource-conditioned feedback bundle neutralized; no blanket score bonus or penalty is used in either condition",
      seedDesign: "Common deterministic game seeds pair feedback-enabled and feedback-disabled runs within each start condition",
    },
    summary: summary.conditionSummary,
    feedbackEffects: summary.effects,
    runtimeSeconds: (Date.now() - started) / 1000,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "simulation_summary.json"), JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

main();
