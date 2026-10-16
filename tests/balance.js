"use strict";

const fs = require("node:fs");
const path = require("node:path");

function makeElement() {
  return {
    hidden: false,
    innerHTML: "",
    textContent: "",
    className: "",
    disabled: false,
    addEventListener() {},
    appendChild() {},
  };
}

const elements = new Map();
const documentStub = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  },
  createElement() {
    return makeElement();
  },
};

const appPath = path.join(__dirname, "..", "app.js");
const source = fs.readFileSync(appPath, "utf8");
const scenario = `
  const gameCount = 600;
  const results = [];
  const spreads = [];

  for (let game = 0; game < gameCount; game += 1) {
    startGame("Simulated Player", 6);
    for (let round = 0; round < ROUND_LABELS.length; round += 1) {
      const human = getHuman();
      const eventChoices = LIFE_EVENTS[state.round].choices.filter((choice) => choiceAvailable(human, choice));
      if (eventChoices.length) chooseEvent(eventChoices[Math.floor(Math.random() * eventChoices.length)].id);
      else forceEventFallback();

      if (state.phase === "household") {
        const householdChoices = getHouseholdChoices(getHuman()).filter((choice) => choiceAvailable(getHuman(), choice));
        chooseHousehold(householdChoices[Math.floor(Math.random() * householdChoices.length)].id);
      }

      if (isBareCoping(getHuman())) choosePriority("bare-coping");
      else {
        const priorities = getPriorityChoices(getHuman());
        choosePriority(priorities[Math.floor(Math.random() * priorities.length)].id);
      }
      nextRound();
    }

    results.push(...state.players.map((player) => ({
      ec: player.ec,
      hc: player.hc,
      sc: player.sc,
      wb: player.wb,
      total: totalCapital(player),
      fallback: player.fallback,
      family: familyLabel(player),
    })));
    spreads.push(cohortSpread());
  }

  const summary = {};
  for (const metric of [...METRICS, "total"]) {
    const values = results.map((result) => result[metric]);
    summary[metric] = {
      average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      zeroPercent: Math.round((values.filter((value) => value === 0).length / values.length) * 100),
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    };
  }

  return {
    games: gameCount,
    lives: results.length,
    metrics: summary,
    averageCohortSpread: Math.round(spreads.reduce((sum, value) => sum + value, 0) / spreads.length),
    fallbackPercent: Math.round((results.filter((result) => result.fallback > 0).length / results.length) * 100),
    householdDistribution: Object.fromEntries(
      [...new Set(results.map((result) => result.family))].map((family) => [
        family,
        Math.round((results.filter((result) => result.family === family).length / results.length) * 100),
      ])
    ),
  };
`;

const run = new Function("document", "FormData", `${source}\n${scenario}`);
const result = run(documentStub, class FormDataStub {});
console.log(JSON.stringify(result, null, 2));
