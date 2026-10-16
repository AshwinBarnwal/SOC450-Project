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
  startGame("Test Player", 4);

  function playCurrentRound(preferredEventId, preferredHouseholdId) {
    const human = getHuman();
    const event = LIFE_EVENTS[state.round];
    const preferred = event.choices.find((choice) => choice.id === preferredEventId && choiceAvailable(human, choice));
    const choice = preferred || event.choices.find((item) => choiceAvailable(human, item));
    if (choice) chooseEvent(choice.id);
    else forceEventFallback();

    if (state.phase === "household") {
      const householdChoices = getHouseholdChoices(getHuman()).filter((item) => choiceAvailable(getHuman(), item));
      const householdChoice = householdChoices.find((item) => item.id === preferredHouseholdId) || householdChoices[0];
      chooseHousehold(householdChoice.id);
    }

    if (isBareCoping(getHuman())) choosePriority("bare-coping");
    else choosePriority(getPriorityChoices(getHuman())[0].id);
    nextRound();
  }

  playCurrentRound("stay-job", "form-partnership");
  playCurrentRound("rent-mobile", "have-child");
  playCurrentRound("lower-status-job");
  playCurrentRound("manage-aggressively");
  playCurrentRound("part-time");

  if (!state || state.players.length !== 4) throw new Error("Cohort was not created.");
  if (state.players.some((player) => player.history.length !== 6)) {
    throw new Error("A participant is missing a round history entry.");
  }
  if (!state.players.every((player) => Number.isFinite(totalCapital(player)))) {
    throw new Error("A participant has an invalid total.");
  }
  if (state.players.some((player) => !Number.isInteger(player.wb))) {
    throw new Error("A displayed wellbeing value is not an integer.");
  }
  if (state.players.some((player) => player.journey.length < 20)) {
    throw new Error("A participant is missing life-course history.");
  }
  if (!getHuman().family.hasChildren || getHuman().family.dependentChild) {
    throw new Error("The tested child did not progress from dependency to adulthood.");
  }
  if (els.finalScreen.hidden) {
    throw new Error("Final screen did not become visible.");
  }
  const finalNarrative = buildLifeNarrative(
    getHuman(),
    Math.round(state.players.reduce((sum, player) => sum + totalCapital(player), 0) / state.players.length),
    1,
    state.players.length
  );
  for (const value of [getHuman().ec, getHuman().hc, getHuman().sc, getHuman().wb]) {
    if (!finalNarrative.includes(String(value))) throw new Error("The final narrative omitted a metric score.");
  }
  if (!finalNarrative.includes("chance")) throw new Error("The final narrative omitted chance-event interpretation.");
  if (!els.finalNarratives.innerHTML.includes("life-summary")) {
    throw new Error("The cohort narrative summaries were not rendered.");
  }
  const completedRun = {
    participants: state.players.length,
    rounds: state.players[0].history.length - 1,
    humanTotal: totalCapital(getHuman()),
    finalTableRows: state.players.length,
  };

  startGame("Constraint Test", 3);
  getHuman().ec = 0;
  getHuman().hc = 0;
  getHuman().sc = 0;
  getHuman().wb = 0;
  render();
  forceEventFallback();
  if (getHuman().fallback !== 1) throw new Error("Forced fallback was not recorded.");
  if (!['household', 'priority'].includes(state.phase)) throw new Error("Forced fallback did not advance the game.");
  completedRun.forcedFallback = "passed";

  startGame("Late Parent Test", 3);
  state.round = 3;
  getHuman().family.partnered = true;
  state.selectedEventChoice = { label: "Test fixture decision" };
  chooseHousehold("have-child");
  if (!getHuman().family.lateParenthood || !getHuman().family.dependentChild) {
    throw new Error("Late parenthood did not preserve dependent care into retirement.");
  }
  if (getHouseholdPriorityChoices(getHuman()).filter((choice) => choice.id.startsWith("household-dependent")).length < 2) {
    throw new Error("Late parenthood did not produce a child-conditioned priority.");
  }
  state.round = 4;
  applyStartOfRoundEffects();
  if (!getHuman().seenHouseholdDevelopments.at(-1).startsWith("child")) {
    throw new Error("A child added in the 50s did not produce a 60s development.");
  }
  completedRun.lateParenthood = "passed";

  startGame("Late Partnership Test", 3);
  state.round = 3;
  state.selectedEventChoice = { label: "Test fixture decision" };
  chooseHousehold("form-partnership");
  if (getHouseholdPriorityChoices(getHuman()).filter((choice) => choice.id.startsWith("household-partner")).length < 2) {
    throw new Error("A partnership did not produce a partner-conditioned priority.");
  }
  state.round = 4;
  applyStartOfRoundEffects();
  if (!getHuman().seenHouseholdDevelopments.at(-1).startsWith("partner")) {
    throw new Error("A partnership formed in the 50s did not produce a 60s development.");
  }
  completedRun.latePartnership = "passed";

  startGame("Independent Test", 3);
  state.round = 1;
  state.selectedEventChoice = { label: "Test fixture decision" };
  chooseHousehold("commit-independent");
  if (!getHuman().family.independentCommitted || getHouseholdChoices(getHuman()).length !== 0) {
    throw new Error("The independent household path did not persist.");
  }
  if (getHouseholdPriorityChoices(getHuman()).filter((choice) => choice.id.startsWith("household-independent")).length < 2) {
    throw new Error("The independent path did not produce a network-conditioned priority.");
  }
  completedRun.independentPath = "passed";

  startGame(["Asha", "Dev", "Inez"], 3, "multiplayer");
  if (state.mode !== "multiplayer" || state.players.some((player) => !player.isHuman)) {
    throw new Error("Local multiplayer did not create a fully player-controlled cohort.");
  }
  for (const expectedName of ["Asha", "Dev", "Inez"]) {
    if (getHuman().name !== expectedName || state.phase !== "event") {
      throw new Error("The event phase did not move through players in round-robin order.");
    }
    const eventChoice = LIFE_EVENTS[state.round].choices.find((choice) => choiceAvailable(getHuman(), choice));
    chooseEvent(eventChoice.id);
  }
  for (const expectedName of ["Asha", "Dev", "Inez"]) {
    if (getHuman().name !== expectedName || state.phase !== "household") {
      throw new Error("The household phase did not move through players in round-robin order.");
    }
    chooseHousehold("remain-independent");
  }
  for (const expectedName of ["Asha", "Dev", "Inez"]) {
    if (getHuman().name !== expectedName || state.phase !== "priority") {
      throw new Error("The priority phase did not move through players in round-robin order.");
    }
    if (isBareCoping(getHuman())) choosePriority("bare-coping");
    else choosePriority(getPriorityChoices(getHuman())[0].id);
  }
  if (state.phase !== "resolved" || state.players.some((player) => player.history.length !== 2)) {
    throw new Error("Local multiplayer did not resolve the decade for every player.");
  }
  while (state.round < ROUND_LABELS.length - 1) {
    nextRound();
    let guard = 0;
    while (state.phase !== "resolved") {
      guard += 1;
      if (guard > 30) throw new Error("Local multiplayer stopped advancing.");
      if (state.phase === "event") {
        const available = LIFE_EVENTS[state.round].choices.find((choice) => choiceAvailable(getHuman(), choice));
        if (available) chooseEvent(available.id);
        else forceEventFallback();
      } else if (state.phase === "household") {
        const available = getHouseholdChoices(getHuman()).find((choice) => choiceAvailable(getHuman(), choice));
        chooseHousehold(available.id);
      } else if (state.phase === "priority") {
        if (isBareCoping(getHuman())) choosePriority("bare-coping");
        else choosePriority(getPriorityChoices(getHuman())[0].id);
      }
    }
  }
  nextRound();
  if (els.finalScreen.hidden || state.players.some((player) => player.history.length !== 6)) {
    throw new Error("Local multiplayer did not complete all five decades.");
  }
  completedRun.multiplayerRoundRobin = "passed";

  const adult = state.players[0];
  adult.family.partnered = true;
  adult.family.hasChildren = true;
  adult.family.dependentChild = false;
  const supportChoice = HOUSEHOLD_PRIORITY_CHOICES.find((choice) => choice.id === "household-adult-support");
  applyChoice(adult, supportChoice);
  const reciprocalEvent = HOUSEHOLD_DEVELOPMENTS.find((event) => event.id === "adult-child-support").outcome(adult);
  if (!hasTrait(adult, "intergenerationalTrust") || (reciprocalEvent.delta.hc || 0) < 2) {
    throw new Error("Supporting an adult child did not create a later reciprocal-care benefit.");
  }
  if (renderChoices.toString().includes("choice.effect")) {
    throw new Error("Decision point values are still exposed before a choice is made.");
  }
  completedRun.adultChildTradeoff = "passed";
  completedRun.hiddenChoiceOutcomes = "passed";

  return completedRun;
`;

const run = new Function("document", "FormData", `${source}\n${scenario}`);
const result = run(documentStub, class FormDataStub {});
console.log(JSON.stringify(result));
