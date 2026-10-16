"use strict";

const ROUND_LABELS = ["20s", "30s", "40s", "50s", "60s+"];
const METRICS = ["ec", "hc", "sc", "wb"];
const CAPITAL_MAX = 30;
const BOT_NAMES = ["Mara", "Dev", "Inez", "Jonah", "Salma"];
const BOT_TENDENCIES = [
  { name: "Security seeking", ec: 1.7, hc: 0.8, sc: 0.5, wb: 0.7, future: 1.2 },
  { name: "Health protective", ec: 0.6, hc: 1.8, sc: 0.6, wb: 1.1, future: 0.8 },
  { name: "Socially anchored", ec: 0.5, hc: 0.7, sc: 1.7, wb: 1.2, future: 0.8 },
  { name: "Short-term pragmatic", ec: 1.6, hc: 1, sc: 0.5, wb: 0.5, future: 0.2 },
  { name: "Life satisfaction focused", ec: 0.5, hc: 0.9, sc: 0.9, wb: 1.9, future: 0.5 },
];

const BACKGROUNDS = [
  {
    id: "affluent-stable",
    label: "Affluent and stable household",
    description: "Money, reliable housing, and adult support absorb early setbacks.",
    delta: { ec: 3, hc: 1, sc: 1, wb: 2 },
  },
  {
    id: "secure-working",
    label: "Secure working household",
    description: "Basic needs are met, but large expenses still require tradeoffs.",
    delta: { ec: 1 },
  },
  {
    id: "cash-poor-connected",
    label: "Cash-poor, closely connected household",
    description: "Money is scarce, while relatives and neighbours provide practical support.",
    delta: { ec: -3, hc: -1, sc: 3 },
  },
  {
    id: "unstable-home",
    label: "Unstable household",
    description: "Income and housing change repeatedly, making planning difficult.",
    delta: { ec: -2, hc: -1, sc: -1, wb: -3 },
  },
  {
    id: "early-health",
    label: "Early health disadvantage",
    description: "Recurring health needs consume time and reduce the protection offered by an otherwise ordinary household.",
    delta: { ec: -1, hc: -3, wb: -2 },
  },
  {
    id: "comfortable-isolated",
    label: "Materially secure, socially isolated household",
    description: "Resources are available, but dependable social ties are limited.",
    delta: { ec: 2, sc: -3, wb: -1 },
  },
];

const TRAIT_LABELS = {
  careerSecurity: "Career security",
  healthCover: "Health cover",
  kinNetwork: "Kin network",
  homeEquity: "Home equity",
  pension: "Pension",
  assetPortfolio: "Asset portfolio",
  burnout: "Burnout",
  debt: "Debt",
  careDuty: "Care duty",
  chronicCondition: "Chronic condition",
  mobility: "Mobility",
  precariousWork: "Precarious work",
  careRisk: "Care risk",
  intergenerationalTrust: "Intergenerational trust",
};

const LIFE_EVENTS = [
  {
    id: "credential",
    title: "Credential decision",
    description:
      "An early working-life decision may alter earnings and security for decades. Present resources determine which investments remain plausible.",
    choices: [
      {
        id: "return-school",
        label: "Return to education",
        effect: "-3 economic, -1 health, -1 wellbeing. Gain career security and a delayed economic return.",
        delta: { ec: -3, hc: -1, wb: -1 },
        addTraits: ["careerSecurity"],
        pending: { ec: 4, wb: 1 },
        condition: (player) => state.feedbackEnabled === false || player.ec >= 12,
        future: 5,
      },
      {
        id: "stay-job",
        label: "Stay in the current job",
        effect: "+2 economic, -1 wellbeing. Career security is possible from a strong position.",
        delta: { ec: 2, wb: -1 },
        special(player) {
          if (player.ec >= 12 && Math.random() < 0.6) addTrait(player, "careerSecurity");
        },
        future: 1,
      },
      {
        id: "reduce-hours",
        label: "Reduce hours for other responsibilities",
        effect: "-1 economic, +1 health, +1 social, +1 wellbeing. Gain care duty.",
        delta: { ec: -1, hc: 1, sc: 1, wb: 1 },
        addTraits: ["careDuty"],
        future: 0.5,
      },
    ],
  },
  {
    id: "housing",
    title: "Housing decision",
    description:
      "Housing may become protection, exposure, or a means of remaining mobile. The immediate price does not reveal every later consequence.",
    choices: [
      {
        id: "buy-home",
        label: "Buy a home",
        effect: "-3 economic, +1 social, +1 wellbeing. Gain home equity and exposure to asset shocks.",
        delta: { ec: -3, sc: 1, wb: 1 },
        addTraits: ["homeEquity"],
        condition: (player) => state.feedbackEnabled === false || player.ec >= 14,
        future: 4,
      },
      {
        id: "rent-mobile",
        label: "Rent and remain mobile",
        effect: "-1 economic, +1 health, +1 wellbeing. Gain mobility.",
        delta: { ec: -1, hc: 1, wb: 1 },
        addTraits: ["mobility"],
        future: 1,
      },
      {
        id: "borrow-deposit",
        label: "Borrow for a deposit",
        effect: "+2 economic now, -1 wellbeing. Gain debt and home equity.",
        delta: { ec: 2, wb: -1 },
        addTraits: ["debt", "homeEquity"],
        future: 0.5,
      },
    ],
  },
  {
    id: "mid-career-layoff",
    title: "Mid-career layoff",
    description:
      "The recession reaches your workplace. Earlier investments may soften the damage, but no response is free.",
    choices: [
      {
        id: "use-security",
        label: "Use professional credentials and contacts",
        effect: "-1 economic, -1 wellbeing. Available only with career security.",
        delta: { ec: -1, wb: -1 },
        requires: ["careerSecurity"],
        future: 2,
      },
      {
        id: "lower-status-job",
        label: "Take a lower-status job",
        effect: "-2 economic, -1 health, +1 social, -1 wellbeing. Maintain labour-market attachment.",
        delta: { ec: -2, hc: -1, sc: 1, wb: -1 },
        future: 0.5,
      },
      {
        id: "exit-labour",
        label: "Leave the labour market",
        effect: "-3 economic, +2 health, +1 social, +1 wellbeing. A pension offsets part of the loss.",
        delta: { ec: -3, hc: 2, sc: 1, wb: 1 },
        special(player) {
          if (hasTrait(player, "pension")) player.ec += 2;
        },
        future: 0,
      },
    ],
  },
  {
    id: "chronic-health",
    title: "Chronic health shock",
    description:
      "A chronic condition becomes part of daily life. Treatment protects future functioning but draws on resources accumulated earlier.",
    choices: [
      {
        id: "manage-aggressively",
        label: "Begin a sustained treatment plan",
        effect: "-1 economic, -1 health, -1 wellbeing. Gain chronic condition with a lower future burden under health cover.",
        delta: { ec: -1, hc: -1, wb: -1 },
        addTraits: ["chronicCondition"],
        future: 2,
      },
      {
        id: "ration-treatment",
        label: "Ration treatment",
        effect: "+1 economic, -4 health, -3 wellbeing. Gain chronic condition and care risk.",
        delta: { ec: 1, hc: -4, wb: -3 },
        addTraits: ["chronicCondition", "careRisk"],
        future: -1,
      },
      {
        id: "draw-on-network",
        label: "Ask your network to coordinate care",
        effect: "-1 social. Kin networks make the response substantially safer.",
        delta: { sc: -1 },
        special(player) {
          if (hasTrait(player, "kinNetwork")) {
            player.hc += 1;
            player.wb += 1;
          } else {
            player.ec -= 1;
            player.hc -= 2;
            player.wb -= 1;
          }
          addTrait(player, "chronicCondition");
        },
        future: 1,
      },
    ],
  },
  {
    id: "retirement",
    title: "Retirement",
    description:
      "Later-life choices remain meaningful, but their range is conditioned by what survived the previous four decades.",
    choices: [
      {
        id: "retire-fully",
        label: "Retire fully",
        effect: "-3 economic, +2 health, +1 social, +1 wellbeing. A pension offsets part of the economic loss.",
        delta: { ec: -3, hc: 2, sc: 1, wb: 1 },
        special(player) {
          if (hasTrait(player, "pension")) player.ec += 2;
        },
        future: 1,
      },
      {
        id: "work-longer",
        label: "Continue working",
        effect: "+3 economic, -2 health, -1 social, -1 wellbeing.",
        delta: { ec: 3, hc: -2, sc: -1, wb: -1 },
        future: 0,
      },
      {
        id: "part-time",
        label: "Work part-time",
        effect: "+1 economic, +1 health, +1 social, +1 wellbeing. Mobility improves the health effect.",
        delta: { ec: 1, hc: 1, sc: 1, wb: 1 },
        special(player) {
          if (hasTrait(player, "mobility")) player.hc += 1;
        },
        future: 1.5,
      },
    ],
  },
];

const HOUSEHOLD_CHOICES = {
  formPartnership: {
    id: "form-partnership",
    label: "Marry or form a long-term partnership",
    effect: "-2 economic, +1 social, +1 wellbeing. Establish a shared household.",
    delta: { ec: -2, sc: 1, wb: 1 },
    special(player) {
      player.family.partnered = true;
      player.family.partnershipRound = state.round;
    },
    future: 1,
  },
  remainIndependent: {
    id: "remain-independent",
    label: "Keep an independent household",
    effect: "+1 wellbeing. Preserve flexibility and avoid new household obligations this decade.",
    delta: { wb: 1 },
    future: 0,
  },
  commitIndependent: {
    id: "commit-independent",
    label: "Commit to an independent household",
    effect: "+1 economic, +1 wellbeing. Make the no-partner, no-children path persistent.",
    delta: { ec: 1, wb: 1 },
    special(player) {
      player.family.independentCommitted = true;
    },
    future: 1,
  },
  haveChild: {
    id: "have-child",
    label: "Have or adopt a child",
    effect: "-2 economic, -1 health, +1 social, +1 wellbeing. Begin two decades of dependent care.",
    delta: { ec: -2, hc: -1, sc: 1, wb: 1 },
    special(player) {
      player.family.hasChildren = true;
      player.family.dependentChild = true;
      player.family.childBirthRound = state.round;
      if (state.round === 2) {
        player.hc -= 1;
        player.family.lateParenthood = true;
      }
      if (state.round >= 3) {
        player.hc -= 2;
        player.wb -= 1;
        player.family.lateParenthood = true;
      }
    },
    future: 0.5,
  },
  delayChildren: {
    id: "delay-children",
    label: "Delay parenthood",
    effect: "+1 economic. Preserve resources while leaving the decision open.",
    delta: { ec: 1 },
    future: 0.5,
  },
  childFree: {
    id: "child-free-household",
    label: "Build a household without children",
    effect: "+1 economic, +1 wellbeing. Make the child-free household path persistent.",
    delta: { ec: 1, wb: 1 },
    special(player) {
      player.family.childFree = true;
    },
    future: 1,
  },
};

const HOUSEHOLD_DEVELOPMENTS = [
  {
    id: "independent-housing-cost",
    title: "The cost of maintaining a household alone increased",
    condition: (player) => !player.family.partnered,
    outcome(player) {
      return player.ec >= 9
        ? { delta: { ec: -1 }, text: "A reserve absorbed the increase without disrupting the rest of your life." }
        : { delta: { ec: -2, wb: -1 }, text: "With no shared household income, the increase consumed money and peace of mind." };
    },
  },
  {
    id: "independent-friend-support",
    title: "A close friend became a dependable source of practical support",
    condition: (player) => !player.family.partnered,
    outcome() {
      return { delta: { sc: 1, wb: 1 }, text: "An independent household still sat inside a network of reciprocal care." };
    },
  },
  {
    id: "independent-community",
    title: "A local group gave your independent life a steadier social rhythm",
    condition: (player) => !player.family.partnered,
    outcome() {
      return { delta: { hc: 1, sc: 1 }, text: "Regular contact supported both everyday functioning and connection." };
    },
  },
  {
    id: "partner-job-gain",
    title: "Your partner moved into more secure work",
    condition: (player) => player.family.partnered && !player.family.dependentChild,
    outcome() {
      return { delta: { ec: 2, wb: 1 }, text: "A second adult's improved position strengthened the shared household." };
    },
  },
  {
    id: "partner-job-loss",
    title: "Your partner lost their main source of income",
    condition: (player) => player.family.partnered && !player.family.dependentChild,
    outcome() {
      return { delta: { ec: -2, wb: -1 }, text: "A shock to one adult became a household-level loss." };
    },
  },
  {
    id: "partner-shared-routine",
    title: "Your shared household settled into a supportive routine",
    condition: (player) => player.family.partnered && !player.family.dependentChild,
    outcome() {
      return { delta: { hc: 1, wb: 1 }, text: "Shared daily work protected health and reduced strain." };
    },
  },
  {
    id: "child-health-crisis",
    title: "Your child required urgent medical care",
    condition: (player) => player.family.dependentChild,
    outcome(player) {
      return hasTrait(player, "healthCover")
        ? { delta: { ec: -1, wb: -1 }, text: "Health cover limited the financial damage, but care still disrupted the household." }
        : { delta: { ec: -2, hc: -1, wb: -2 }, text: "The medical need consumed money, time, and emotional capacity." };
    },
  },
  {
    id: "child-thriving",
    title: "Your child began thriving in a supportive environment",
    condition: (player) => player.family.dependentChild,
    outcome() {
      return { delta: { sc: 1, wb: 2 }, text: "School and community support improved life across the household." };
    },
  },
  {
    id: "childcare-breakdown",
    title: "A dependable care arrangement suddenly fell through",
    condition: (player) => player.family.dependentChild,
    outcome() {
      return { delta: { ec: -1, hc: -1, wb: -1 }, text: "Replacing unpaid time and care demanded resources immediately." };
    },
  },
  {
    id: "adult-child-support",
    title: "Your adult child was able to offer practical support",
    condition: (player) => player.family.hasChildren && !player.family.dependentChild,
    outcome(player) {
      return hasTrait(player, "intergenerationalTrust")
        ? { delta: { hc: 2, sc: 1, wb: 1 }, text: "Earlier support had built enough trust for care to become meaningfully reciprocal." }
        : { delta: { hc: 1, sc: 1 }, text: "Care became more reciprocal after dependency ended." };
    },
  },
  {
    id: "adult-child-setback",
    title: "Your adult child encountered unstable work and needed help",
    condition: (player) => player.family.hasChildren && !player.family.dependentChild,
    outcome(player) {
      if (hasTrait(player, "intergenerationalTrust")) {
        return { delta: { ec: -1, sc: 1 }, text: "An established relationship allowed support to remain limited and coordinated." };
      }
      return player.ec >= 8
        ? { delta: { ec: -1, wb: -1 }, text: "You provided a limited buffer without exhausting your own position." }
        : { delta: { ec: -2, wb: -2 }, text: "Supporting another household strained resources that were already thin." };
    },
  },
];

const HOUSEHOLD_PRIORITY_CHOICES = [
  {
    id: "household-dependent-reserve",
    label: "Take extra paid work to protect the family reserve",
    effect: "+2 economic, -1 health, -1 wellbeing.",
    delta: { ec: 2, hc: -1, wb: -1 },
    condition: (player) => player.family.dependentChild && player.ec <= 8,
    future: 1,
  },
  {
    id: "household-dependent-care",
    label: "Reduce paid work to handle care directly",
    effect: "-1 economic, +1 health, +2 wellbeing.",
    delta: { ec: -1, hc: 1, wb: 2 },
    condition: (player) => player.family.dependentChild,
    future: 0.5,
  },
  {
    id: "household-dependent-support",
    label: "Pay for dependable care and protect family time",
    effect: "-1 economic, +1 health, +1 social, +1 wellbeing.",
    delta: { ec: -1, hc: 1, sc: 1, wb: 1 },
    condition: (player) => player.family.dependentChild,
    future: 1,
  },
  {
    id: "household-partner-reserve",
    label: "Build a shared emergency reserve",
    effect: "+2 economic, -1 wellbeing.",
    delta: { ec: 2, wb: -1 },
    condition: (player) => player.family.partnered && !player.family.dependentChild && player.ec <= 8,
    future: 1.5,
  },
  {
    id: "household-partner-time",
    label: "Protect time for your relationship",
    effect: "+1 social, +1 wellbeing.",
    delta: { sc: 1, wb: 1 },
    condition: (player) => player.family.partnered && !player.family.dependentChild,
    future: 0.5,
  },
  {
    id: "household-partner-autonomy",
    label: "Protect separate routines within the partnership",
    effect: "+1 health, +1 wellbeing, -1 social.",
    delta: { hc: 1, sc: -1, wb: 1 },
    condition: (player) => player.family.partnered && !player.family.dependentChild,
    future: 0.5,
  },
  {
    id: "household-adult-boundary",
    label: "Keep a financial boundary with your adult child",
    effect: "+1 economic, -1 social, +1 wellbeing.",
    delta: { ec: 1, sc: -1, wb: 1 },
    condition: (player) => player.family.hasChildren && !player.family.dependentChild && player.ec <= 8,
    future: 1,
  },
  {
    id: "household-adult-reciprocity",
    label: "Accept practical support from your adult child",
    effect: "+2 health, +1 wellbeing. Prioritise immediate practical care.",
    delta: { hc: 2, wb: 1 },
    condition: (player) => player.family.hasChildren && !player.family.dependentChild,
    future: 0.5,
  },
  {
    id: "household-adult-support",
    label: "Offer limited help to your adult child",
    effect: "-1 economic, +2 social, +2 wellbeing. Build intergenerational trust that can improve later support.",
    delta: { ec: -1, sc: 2, wb: 2 },
    addTraits: ["intergenerationalTrust"],
    condition: (player) => player.family.hasChildren && !player.family.dependentChild,
    future: 0.5,
  },
  {
    id: "household-independent-reserve",
    label: "Protect the reserve that keeps you independent",
    effect: "+2 economic, -1 wellbeing.",
    delta: { ec: 2, wb: -1 },
    condition: (player) => !player.family.partnered && player.ec <= 8,
    future: 1,
  },
  {
    id: "household-independent-network",
    label: "Invest time in your chosen support network",
    effect: "-1 economic, +2 social, +1 wellbeing.",
    delta: { ec: -1, sc: 2, wb: 1 },
    condition: (player) => !player.family.partnered && player.sc <= 10,
    future: 0.5,
  },
  {
    id: "household-independent-routine",
    label: "Protect the routines that make independent life sustainable",
    effect: "+1 health, +1 wellbeing.",
    delta: { hc: 1, wb: 1 },
    condition: (player) => !player.family.partnered,
    future: 0.5,
  },
  {
    id: "household-independent-mutual-aid",
    label: "Exchange practical help with friends and neighbours",
    effect: "+1 social, +1 wellbeing.",
    delta: { sc: 1, wb: 1 },
    condition: (player) => !player.family.partnered,
    future: 0.5,
  },
];

const PRIORITY_CHOICES = [
  {
    id: "stabilize-income",
    label: "Take additional paid work",
    effect: "+3 economic, -2 health, -1 wellbeing.",
    delta: { ec: 3, hc: -2, wb: -1 },
    future: 0,
  },
  {
    id: "request-assistance",
    label: "Apply for emergency assistance",
    effect: "+1 economic. Immediate loss is contained, but no durable protection is created.",
    delta: { ec: 1 },
    condition: (player) => player.ec <= 8,
    future: 0.5,
  },
  {
    id: "recover",
    label: "Reduce obligations and recover",
    effect: "-2 economic, +1 health, +1 wellbeing. Remove burnout if present.",
    delta: { ec: -2, hc: 1, wb: 1 },
    removeTraits: ["burnout"],
    condition: (player) => player.hc <= 10 || player.wb <= 9 || hasTrait(player, "burnout"),
    future: 0.5,
  },
  {
    id: "care-plan",
    label: "Reorganize life around treatment",
    effect: "-1 economic, +2 health, +1 wellbeing. Health cover improves the result.",
    delta: { ec: -1, hc: 2, wb: 1 },
    special(player) {
      if (hasTrait(player, "healthCover")) player.hc += 1;
    },
    condition: (player) => hasTrait(player, "chronicCondition"),
    future: 1,
  },
  {
    id: "reconnect",
    label: "Rebuild neglected relationships",
    effect: "-1 economic, +2 social, +1 wellbeing.",
    delta: { ec: -1, sc: 2, wb: 1 },
    condition: (player) => player.sc <= 10,
    future: 0.5,
  },
  {
    id: "repay-debt",
    label: "Repay outstanding debt",
    effect: "-2 economic, +1 wellbeing. Remove debt and its future maintenance cost.",
    delta: { ec: -2, wb: 1 },
    removeTraits: ["debt"],
    condition: (player) => hasTrait(player, "debt"),
    future: 2,
  },
  {
    id: "career-investment",
    label: "Complete vocational training",
    effect: "-2 economic, -1 wellbeing. Gain career security and a delayed economic return.",
    delta: { ec: -2, wb: -1 },
    addTraits: ["careerSecurity"],
    pending: { ec: 2 },
    condition: (player, round) =>
      round <= 2 &&
      !hasTrait(player, "careerSecurity") &&
      (state.feedbackEnabled === false || player.ec >= 11),
    future: 5,
  },
  {
    id: "health-cover",
    label: "Obtain health cover",
    effect: "-2 economic, +1 health, +1 wellbeing. Gain protection from later health costs.",
    delta: { ec: -2, hc: 1, wb: 1 },
    addTraits: ["healthCover"],
    condition: (player, round) =>
      round <= 3 &&
      !hasTrait(player, "healthCover") &&
      (state.feedbackEnabled === false || player.ec >= 10),
    future: 3,
  },
  {
    id: "kin-network",
    label: "Maintain dependable relationships",
    effect: "-1 economic, +1 social, +1 wellbeing. Gain a kin network.",
    delta: { ec: -1, sc: 1, wb: 1 },
    addTraits: ["kinNetwork"],
    condition: (player, round) => round <= 3 && !hasTrait(player, "kinNetwork"),
    future: 2,
  },
  {
    id: "long-term-home",
    label: "Commit to a long-term home",
    effect: "-3 economic, +1 social, +1 wellbeing. Gain home equity.",
    delta: { ec: -3, sc: 1, wb: 1 },
    addTraits: ["homeEquity"],
    condition: (player, round) =>
      round <= 2 &&
      !hasTrait(player, "homeEquity") &&
      (state.feedbackEnabled === false || player.ec >= 14),
    future: 4,
  },
  {
    id: "pension",
    label: "Contribute to a pension",
    effect: "-2 economic, +1 wellbeing. Gain stronger late-life protection.",
    delta: { ec: -2, wb: 1 },
    addTraits: ["pension"],
    condition: (player, round) =>
      round >= 1 &&
      !hasTrait(player, "pension") &&
      (state.feedbackEnabled === false || player.ec >= 11),
    future: 4,
  },
  {
    id: "asset-portfolio",
    label: "Build a small asset portfolio",
    effect: "-3 economic, -1 wellbeing. Gain a delayed return and greater recession exposure.",
    delta: { ec: -3, wb: -1 },
    addTraits: ["assetPortfolio"],
    pending: { ec: 3 },
    condition: (player, round) =>
      round <= 2 &&
      !hasTrait(player, "assetPortfolio") &&
      (state.feedbackEnabled === false || player.ec >= 16),
    future: 6,
  },
  {
    id: "protect-time",
    label: "Protect personal time",
    effect: "-1 economic, +1 health, +1 wellbeing.",
    delta: { ec: -1, hc: 1, wb: 1 },
    future: 0.5,
  },
  {
    id: "personal-project",
    label: "Pursue a personally meaningful project",
    effect: "-1 economic, +1 social, +1 wellbeing.",
    delta: { ec: -1, sc: 1, wb: 1 },
    future: 0.5,
  },
  {
    id: "no-commitment",
    label: "Avoid another major commitment",
    effect: "+1 wellbeing. Preserve flexibility for the next decade.",
    delta: { wb: 1 },
    future: 0,
  },
];

const RANDOM_EVENTS = [
  {
    id: "workplace-closure",
    title: "Your workplace closed without much warning",
    rounds: [1, 2, 3],
    outcome(player) {
      return hasTrait(player, "careerSecurity")
        ? { delta: { ec: -1, wb: -1 }, text: "Credentials and contacts shortened the disruption." }
        : { delta: { ec: -4, wb: -2 }, text: "Without career protection, income and confidence both fell." };
    },
  },
  {
    id: "rent-increase",
    title: "Housing costs rose unexpectedly",
    rounds: [0, 1, 2, 3],
    outcome(player) {
      return hasTrait(player, "homeEquity")
        ? { delta: { ec: -1, wb: -1 }, text: "Ownership prevented displacement, but repairs still cost money." }
        : { delta: { ec: -3, wb: -1 }, text: "The increase immediately reduced disposable income." };
    },
  },
  {
    id: "inheritance",
    title: "A distant relative left you an inheritance",
    outcome() {
      return { delta: { ec: 4, wb: 1 }, text: "The transfer arrived independently of anything you did." };
    },
  },
  {
    id: "short-illness",
    title: "An illness interrupted ordinary life",
    outcome(player) {
      return hasTrait(player, "healthCover")
        ? { delta: { hc: -1, wb: -1 }, text: "Health cover absorbed the financial cost, but not the disruption." }
        : { delta: { ec: -2, hc: -3, wb: -2 }, text: "Treatment and missed work compounded the health shock." };
    },
  },
  {
    id: "supportive-friendship",
    title: "A friendship became unexpectedly dependable",
    outcome() {
      return { delta: { sc: 2, wb: 2 }, text: "Regular practical and emotional support made daily life easier." };
    },
  },
  {
    id: "bureaucratic-error",
    title: "An administrative error froze money you were owed",
    outcome() {
      return { delta: { ec: -2, wb: -1 }, text: "The mistake was not yours, but resolving it consumed time and money." };
    },
  },
  {
    id: "promotion",
    title: "A better-paid position opened at the right moment",
    rounds: [1, 2, 3],
    outcome(player) {
      return hasTrait(player, "careerSecurity")
        ? { delta: { ec: 3, wb: 2 }, text: "Earlier credentials made you an obvious candidate." }
        : { delta: { ec: 2, wb: 1 }, text: "Timing and a favourable decision moved you upward." };
    },
  },
  {
    id: "care-crisis",
    title: "A relative suddenly needed sustained care",
    rounds: [1, 2, 3],
    outcome(player) {
      return hasTrait(player, "kinNetwork")
        ? { delta: { ec: -1, wb: -1 }, text: "A wider network shared some of the burden.", addTraits: ["careDuty"] }
        : { delta: { ec: -1, hc: -1, wb: -2 }, text: "Most of the responsibility fell directly on you.", addTraits: ["careDuty"] };
    },
  },
  {
    id: "community-role",
    title: "A local group asked you to take on a meaningful role",
    outcome() {
      return { delta: { sc: 1, wb: 2 }, text: "The role created belonging and a sense of usefulness." };
    },
  },
  {
    id: "treatment-grant",
    title: "You qualified for a limited treatment grant",
    condition: (player) => player.hc <= 10,
    outcome() {
      return { delta: { hc: 1 }, text: "Institutional support contained part of the loss but did not erase the earlier shortfall." };
    },
  },
  {
    id: "debt-collection",
    title: "A creditor demanded immediate repayment",
    condition: (player) => hasTrait(player, "debt"),
    outcome() {
      return { delta: { ec: -2, wb: -2 }, text: "The earlier loan reduced present choices again." };
    },
  },
  {
    id: "market-windfall",
    title: "Your investments rose sharply",
    condition: (player) => hasTrait(player, "assetPortfolio"),
    outcome() {
      return { delta: { ec: 3, wb: 1 }, text: "Existing assets converted a general market rise into personal gain." };
    },
  },
  {
    id: "market-loss",
    title: "A market correction erased part of your assets",
    condition: (player) => hasTrait(player, "assetPortfolio"),
    outcome() {
      return { delta: { ec: -3, wb: -2 }, text: "The same exposure that offered growth also transmitted the loss." };
    },
  },
  {
    id: "relationship-rupture",
    title: "An important relationship ended badly",
    condition: (player) => player.sc >= 8,
    outcome() {
      return { delta: { sc: -2, wb: -2 }, text: "A previously protective tie disappeared." };
    },
  },
  {
    id: "stable-period",
    title: "Nothing went seriously wrong for a while",
    outcome() {
      return { delta: { hc: 1, wb: 1 }, text: "Ordinary stability created room to recover." };
    },
  },
  {
    id: "institutional-exclusion",
    title: "An institution treated you as less credible than your peers",
    rounds: [0, 1, 2, 3],
    outcome() {
      return { delta: { ec: -1, sc: -1, wb: -2 }, text: "The decision restricted access and weakened trust." };
    },
  },
  {
    id: "targeted-subsidy",
    title: "A new support program reached you",
    condition: (player) => player.ec <= 8,
    outcome() {
      return { delta: { ec: 1 }, text: "Eligibility contained immediate hardship without creating durable economic protection." };
    },
  },
  {
    id: "creative-recognition",
    title: "A personal interest received unexpected recognition",
    outcome() {
      return { delta: { sc: 1, wb: 2 }, text: "An activity pursued for its own sake opened a new social world." };
    },
  },
  {
    id: "bereavement",
    title: "Someone important to you died",
    rounds: [2, 3, 4],
    outcome(player) {
      return hasTrait(player, "kinNetwork")
        ? { delta: { sc: -1, wb: -2 }, text: "Grief remained, while a wider network prevented complete isolation." }
        : { delta: { sc: -2, wb: -3 }, text: "The loss also removed a major source of everyday support." };
    },
  },
  {
    id: "public-health-improvement",
    title: "A local public-health service expanded",
    outcome() {
      return { delta: { hc: 1, wb: 1 }, text: "A collective provision improved life without requiring an individual investment." };
    },
  },
  {
    id: "unexpected-expense",
    title: "An ordinary appliance failed at the worst time",
    outcome(player) {
      return player.ec >= 11
        ? { delta: { ec: -1 }, text: "Savings turned the failure into an inconvenience." }
        : { delta: { ec: -2, wb: -1 }, text: "Without a buffer, a mundane expense became a meaningful setback." };
    },
  },
  {
    id: "partner-health-scare",
    title: "Your partner developed a worrying health problem",
    rounds: [2, 3, 4],
    householdRelated: true,
    condition: (player) => player.family.partnered,
    outcome(player) {
      return hasTrait(player, "healthCover")
        ? { delta: { ec: -1, wb: -1 }, text: "Access to care limited the disruption, but anxiety entered the household." }
        : { delta: { ec: -2, hc: -1, wb: -2 }, text: "Care work and uncertain access placed strain on both adults." };
    },
  },
  {
    id: "partner-network-help",
    title: "Your partner's network helped during a difficult month",
    householdRelated: true,
    condition: (player) => player.family.partnered,
    outcome() {
      return { delta: { sc: 1, wb: 1 }, text: "The relationship connected the household to support neither adult held alone." };
    },
  },
  {
    id: "child-school-exclusion",
    title: "Your child was pushed to the margins at school",
    householdRelated: true,
    condition: (player) => player.family.dependentChild,
    outcome() {
      return { delta: { sc: -1, wb: -2 }, text: "Their exclusion became a source of stress and social withdrawal across the household." };
    },
  },
  {
    id: "adult-child-job-loss",
    title: "Your adult child lost work and asked for help",
    rounds: [3, 4],
    householdRelated: true,
    condition: (player) => player.family.hasChildren && !player.family.dependentChild,
    outcome(player) {
      if (hasTrait(player, "intergenerationalTrust")) {
        return { delta: { ec: -1, sc: 1 }, text: "Earlier mutual support made the response coordinated rather than open-ended." };
      }
      return player.ec >= 9
        ? { delta: { ec: -1, sc: 1 }, text: "You could offer support without destabilising your own retirement." }
        : { delta: { ec: -2, wb: -1 }, text: "Intergenerational support drew down resources you could barely spare." };
    },
  },
];

const els = {
  startScreen: document.querySelector("#start-screen"),
  gameScreen: document.querySelector("#game-screen"),
  finalScreen: document.querySelector("#final-screen"),
  startForm: document.querySelector("#start-form"),
  gameMode: document.querySelector("#game-mode"),
  singlePlayerFields: document.querySelector("#single-player-fields"),
  multiplayerFields: document.querySelector("#multiplayer-fields"),
  resetButton: document.querySelector("#reset-button"),
  replayButton: document.querySelector("#replay-button"),
  copyJourneysButton: document.querySelector("#copy-journeys-button"),
  copyStatus: document.querySelector("#copy-status"),
  journeyRecords: document.querySelector("#journey-records"),
  roundTrack: document.querySelector("#round-track"),
  roundKicker: document.querySelector("#round-kicker"),
  eventTitle: document.querySelector("#event-title"),
  eventDescription: document.querySelector("#event-description"),
  shockNote: document.querySelector("#shock-note"),
  choiceArea: document.querySelector("#choice-area"),
  resolutionArea: document.querySelector("#resolution-area"),
  humanStats: document.querySelector("#human-stats"),
  humanTraits: document.querySelector("#human-traits"),
  positionKicker: document.querySelector("#position-kicker"),
  cohortList: document.querySelector("#cohort-list"),
  eventLog: document.querySelector("#event-log"),
  finalSummary: document.querySelector("#final-summary"),
  finalNarratives: document.querySelector("#final-narratives"),
  finalTable: document.querySelector("#final-table"),
  trajectoryChart: document.querySelector("#trajectory-chart"),
  closingNote: document.querySelector("#closing-note"),
};

let state = null;

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function makePlayer(name, isHuman, index, background) {
  const player = {
    id: `player-${index}`,
    name,
    isHuman,
    isPrimary: index === 0,
    tendency: isHuman ? null : BOT_TENDENCIES[index % BOT_TENDENCIES.length],
    background,
    ec: 10,
    hc: 10,
    sc: 10,
    wb: 10,
    traits: [],
    pending: {},
    fallback: 0,
    lastChoice: "Waiting to begin",
    lastEvent: "No decade event yet",
    lastHouseholdDevelopment: "No household development yet",
    seenRandomEvents: [],
    seenHouseholdDevelopments: [],
    chanceHistory: [],
    householdHistory: [],
    currentEventChoice: null,
    currentPriorityChoice: null,
    householdQuestionThisRound: false,
    roundStartNotes: [],
    family: {
      partnered: false,
      partnershipRound: null,
      hasChildren: false,
      childFree: false,
      independentCommitted: false,
      dependentChild: false,
      childBirthRound: null,
      lateParenthood: false,
      emptyNest: false,
    },
    journey: [],
    history: [],
  };
  applyDelta(player, background.delta);
  clampCapital(player);
  player.history.push(snapshot(player));
  player.journey.push(
    `Birth - ${background.label}. ${background.description} Starting position: ${positionText(player)}.`
  );
  return player;
}

function startGame(nameOrNames, cohortSize, mode = "bots") {
  const backgroundDeck = shuffled(BACKGROUNDS);
  const suppliedNames = Array.isArray(nameOrNames) ? nameOrNames : [String(nameOrNames || "Player")];
  const players = [];
  for (let index = 0; index < cohortSize; index += 1) {
    const controlled = mode === "multiplayer" || index === 0;
    const fallbackName = mode === "multiplayer" ? `Player ${index + 1}` : BOT_NAMES[Math.max(0, index - 1)];
    const name = controlled ? String(suppliedNames[index] || fallbackName).trim() || fallbackName : fallbackName;
    players.push(makePlayer(name, controlled, index, backgroundDeck[index]));
  }

  state = {
    mode,
    feedbackEnabled: true,
    round: 0,
    phase: "event",
    players,
    activePlayerId: players.find((player) => player.isHuman).id,
    phaseQueue: [],
    turnPosition: 0,
    log: [
      {
        period: "Birth",
        text: `The cohort enters adulthood from ${cohortSize} different household positions. No participant chose their starting conditions.`,
      },
    ],
    shockMessage: "",
    selectedEventChoice: null,
    selectedPriorityChoice: null,
    householdQuestionThisRound: false,
  };

  els.startScreen.hidden = true;
  els.finalScreen.hidden = true;
  els.gameScreen.hidden = false;
  els.resetButton.hidden = false;
  startRound();
}

function startRound() {
  state.selectedEventChoice = null;
  state.selectedPriorityChoice = null;
  state.householdQuestionThisRound = false;
  for (const player of state.players) {
    player.currentEventChoice = null;
    player.currentPriorityChoice = null;
    player.householdQuestionThisRound = false;
  }
  state.shockMessage = applyStartOfRoundEffects();
  beginPhase("event");
}

function getControlledPlayers() {
  return state.players.filter((player) => player.isHuman);
}

function beginPhase(phase) {
  state.phase = phase;
  let participants = getControlledPlayers();
  if (phase === "household") {
    participants = participants.filter((player) =>
      getHouseholdChoices(player).some((choice) => choiceAvailable(player, choice))
    );
    if (!participants.length) {
      beginPhase("priority");
      return;
    }
  }
  state.phaseQueue = participants.map((player) => player.id);
  state.turnPosition = 0;
  state.activePlayerId = state.phaseQueue[0];
  render();
}

function advanceTurnOrPhase() {
  state.turnPosition += 1;
  if (state.turnPosition < state.phaseQueue.length) {
    state.activePlayerId = state.phaseQueue[state.turnPosition];
    render();
    return;
  }
  if (state.phase === "event") {
    beginPhase("household");
    return;
  }
  if (state.phase === "household") {
    beginPhase("priority");
    return;
  }
  resolveBots();
  resolveRound();
}

function applyStartOfRoundEffects() {
  const firstControlled = getControlledPlayers()[0];
  const priorEconomicCapital = new Map();
  const feedbackEnabled = state.feedbackEnabled !== false;

  for (const player of state.players) {
    priorEconomicCapital.set(player.id, player.ec);
    player.roundStartNotes = [];
    updateFamilyStage(player);

    if (state.round > 0) {
      let livelihood = feedbackEnabled ? 1 : 2;
      if (feedbackEnabled && player.family.partnered && !player.family.dependentChild) livelihood += 1;
      if (feedbackEnabled && hasTrait(player, "careerSecurity")) livelihood += 5;
      if (feedbackEnabled && state.round >= 2 && hasTrait(player, "homeEquity") && !hasTrait(player, "debt")) livelihood += 5;
      if (feedbackEnabled && state.round >= 2 && hasTrait(player, "assetPortfolio")) livelihood += 6;
      if (feedbackEnabled && state.round >= 3 && hasTrait(player, "pension")) livelihood += 3;
      if (feedbackEnabled && hasTrait(player, "precariousWork")) livelihood -= 1;
      if (feedbackEnabled && hasTrait(player, "chronicCondition") && !hasTrait(player, "healthCover")) livelihood -= 1;
      livelihood = Math.max(0, livelihood);
      if (livelihood > 0) {
        player.ec += livelihood;
        clampCapital(player);
        player.journey.push(
          `${ROUND_LABELS[state.round]} - Ordinary livelihood replenished ${livelihood} economic capital${hasTrait(player, "careerSecurity") ? "; career security improved the return" : ""}.`
        );
        if (player.isHuman) player.roundStartNotes.push(`Ordinary livelihood restored ${livelihood} economic capital.`);
      }
    }

    if (feedbackEnabled && state.round > 0 && hasTrait(player, "kinNetwork")) {
      player.sc += 2;
      player.wb += 1;
      clampCapital(player);
      player.journey.push(`${ROUND_LABELS[state.round]} - A maintained support network provided continuing social and emotional protection.`);
      if (player.isHuman) player.roundStartNotes.push("Your maintained support network restored 2 social capital and 1 wellbeing.");
    }

    if (METRICS.some((key) => player.pending[key])) {
      const pending = { ...player.pending };
      const realized = { ...pending };
      if (feedbackEnabled) {
        if ((realized.ec || 0) > 0 && hasTrait(player, "careerSecurity")) realized.ec += 1;
        if ((realized.ec || 0) > 0 && hasTrait(player, "assetPortfolio")) realized.ec += 2;
        if ((realized.hc || 0) > 0 && hasTrait(player, "healthCover")) realized.hc += 1;
        if ((realized.sc || 0) > 0 && hasTrait(player, "kinNetwork")) realized.sc += 1;
        if (player.ec <= 5 && METRICS.some((key) => (realized[key] || 0) > 0)) realized.wb = (realized.wb || 0) - 1;
      }
      applyDelta(player, realized);
      clampCapital(player);
      player.pending = {};
      player.journey.push(`${ROUND_LABELS[state.round]} - A delayed investment returned ${describeDelta(realized)}.`);
      if (player.isHuman) player.roundStartNotes.push(`A delayed investment returned ${describeDelta(realized)}.`);
    }

    if (state.round > 0) {
      const householdDevelopment = applyHouseholdDevelopment(player);
      player.lastHouseholdDevelopment = householdDevelopment.title;
      player.householdHistory.push({
        round: state.round,
        title: householdDevelopment.title,
        text: householdDevelopment.text,
        delta: { ...householdDevelopment.delta },
      });
      player.journey.push(
        `${ROUND_LABELS[state.round]} - Household and network development: ${householdDevelopment.title}. ${householdDevelopment.text} Effect: ${describeDelta(householdDevelopment.delta)}.`
      );
      if (player.isHuman) {
        player.roundStartNotes.push(
          `Household development: ${householdDevelopment.title}. ${householdDevelopment.text} Effect: ${describeDelta(householdDevelopment.delta)}.`
        );
      }
    }

    const chance = applyRandomEvent(player);
    player.lastEvent = chance.title;
    player.chanceHistory.push({
      round: state.round,
      title: chance.title,
      text: chance.text,
      delta: { ...chance.delta },
    });
    player.journey.push(
      `${ROUND_LABELS[state.round]} - Chance: ${chance.title}. ${chance.text} Effect: ${describeDelta(chance.delta)}.`
    );
    if (player.isHuman) {
      player.roundStartNotes.push(
        `Chance event: ${chance.title}. ${chance.text} Effect: ${describeDelta(chance.delta)}.`
      );
    }
  }

  state.log.unshift({ period: ROUND_LABELS[state.round], text: firstControlled.journey.at(-1) });
  if (state.round > 0) {
    state.log.unshift({
      period: "Cohort households",
      text: state.players.map((player) => `${player.name}: ${player.lastHouseholdDevelopment}`).join("; "),
    });
  }
  state.log.unshift({
    period: "Cohort chance",
    text: state.players.map((player) => `${player.name}: ${player.lastEvent}`).join("; "),
  });

  if (state.round === 2) {
    for (const player of state.players) {
      let loss = 2;
      if (feedbackEnabled && player.ec <= 8) loss += 1;
      if (feedbackEnabled && player.ec <= 5) loss += 1;
      if (feedbackEnabled && hasTrait(player, "careerSecurity")) loss -= 1;
      if (feedbackEnabled && hasTrait(player, "mobility")) loss -= 1;
      if (feedbackEnabled && hasTrait(player, "debt")) loss += 1;
      if (feedbackEnabled && hasTrait(player, "assetPortfolio")) loss += 1;
      loss = Math.max(1, loss);
      player.ec -= loss;
      if (loss >= 3) player.wb -= 1;
      clampCapital(player);
      player.journey.push(
        `${ROUND_LABELS[state.round]} - Historical shock: recession. Economic capital fell by ${loss}${loss >= 3 ? " and wellbeing fell by 1" : ""}.`
      );
      if (player.isHuman) {
        player.roundStartNotes.push(
          `Historical shock: recession. Economic capital fell by ${loss}${loss >= 3 ? " and wellbeing fell by 1" : ""}.`
        );
      }
    }
  }

  if (state.round === 4) {
    for (const player of state.players) {
      const before = snapshot(player);
      if (feedbackEnabled) {
        if (player.hc <= 7) player.hc += 1;
        if (hasTrait(player, "chronicCondition")) player.hc += 1;
        if (hasTrait(player, "healthCover")) player.ec += 1;
      } else {
        player.hc += 1;
      }
      clampCapital(player);
      const delta = difference(before, player);
      player.journey.push(
        `${ROUND_LABELS[state.round]} - Historical shock: healthcare expansion. Effect: ${describeDelta(delta)}.`
      );
      if (player.isHuman) {
        player.roundStartNotes.push(`Historical shock: healthcare expansion. Effect: ${describeDelta(delta)}.`);
      }
    }
  }

  if (feedbackEnabled) {
    for (const player of state.players) {
      const priorEc = priorEconomicCapital.get(player.id);
      let strainRisk = priorEc <= 8 ? 0.4 : 0;
      if (priorEc <= 5) strainRisk += 0.2;
      if (hasTrait(player, "chronicCondition")) strainRisk += 0.2;
      if (hasTrait(player, "careDuty")) strainRisk += 0.1;
      if (hasTrait(player, "precariousWork")) strainRisk += 0.1;
      if (hasTrait(player, "healthCover")) strainRisk -= 0.15;
      strainRisk = Math.max(0, Math.min(0.8, strainRisk));

      if (Math.random() < strainRisk) {
        const healthLoss = priorEc <= 4 ? 2 : 1;
        player.hc -= healthLoss;
        player.wb -= 1;
        clampCapital(player);
        const note = `Accumulated material strain reduced health by ${healthLoss} and wellbeing by 1; low reserves and ongoing obligations increased exposure, while health cover reduced it.`;
        player.journey.push(`${ROUND_LABELS[state.round]} - Structural exposure: ${note}`);
        if (player.isHuman) player.roundStartNotes.push(note);
      }
    }
  }

  for (const player of state.players) clampCapital(player);
  return firstControlled.roundStartNotes.join(" ");
}

function applyHouseholdDevelopment(player) {
  let eligible = HOUSEHOLD_DEVELOPMENTS.filter(
    (event) => event.condition(player) && !player.seenHouseholdDevelopments.includes(event.id)
  );
  if (!eligible.length) {
    eligible = HOUSEHOLD_DEVELOPMENTS.filter((event) => event.condition(player));
  }
  const event = eligible[Math.floor(Math.random() * eligible.length)];
  const outcome = event.outcome(player);
  applyDelta(player, outcome.delta || {});
  clampCapital(player);
  player.seenHouseholdDevelopments.push(event.id);
  return { title: event.title, text: outcome.text, delta: outcome.delta || {} };
}

function applyRandomEvent(player) {
  let eligible = RANDOM_EVENTS.filter((event) => {
    const rightRound = !event.rounds || event.rounds.includes(state.round);
    const meetsCondition = !event.condition || event.condition(player);
    const unseen = !player.seenRandomEvents.includes(event.id);
    return rightRound && meetsCondition && unseen;
  });
  if (!eligible.length) {
    eligible = RANDOM_EVENTS.filter(
      (event) => (!event.rounds || event.rounds.includes(state.round)) && (!event.condition || event.condition(player))
    );
  }
  const householdEligible = eligible.filter((event) => event.householdRelated);
  const pool = householdEligible.length && Math.random() < 0.35 ? householdEligible : eligible;
  const event = pool[Math.floor(Math.random() * pool.length)];
  const outcome = event.outcome(player);
  applyDelta(player, outcome.delta || {});
  for (const trait of outcome.addTraits || []) addTrait(player, trait);
  for (const trait of outcome.removeTraits || []) removeTrait(player, trait);
  clampCapital(player);
  player.seenRandomEvents.push(event.id);
  return { title: event.title, text: outcome.text, delta: outcome.delta || {} };
}

function chooseEvent(choiceId) {
  const event = LIFE_EVENTS[state.round];
  const choice = event.choices.find((item) => item.id === choiceId);
  const human = getHuman();
  if (!choice || !choiceAvailable(human, choice)) return;

  const before = snapshot(human);
  applyChoice(human, choice);
  human.lastChoice = choice.label;
  human.journey.push(
    `${ROUND_LABELS[state.round]} - Life decision: ${choice.label}. Effect: ${describeDelta(difference(before, human))}.`
  );
  human.currentEventChoice = choice;
  human.householdQuestionThisRound = getHouseholdChoices(human).length > 0;
  state.selectedEventChoice = choice;
  state.householdQuestionThisRound = human.householdQuestionThisRound;
  advanceTurnOrPhase();
}

function forceEventFallback() {
  const event = LIFE_EVENTS[state.round];
  const human = getHuman();
  const choice = selectForcedChoice(human, event.choices);
  if (!choice) return;

  const before = snapshot(human);
  applyChoice(human, choice);
  human.fallback += 1;
  human.lastChoice = `Forced fallback: ${choice.label}`;
  human.journey.push(
    `${ROUND_LABELS[state.round]} - Agency exhausted. The simulation imposed ${choice.label}. Effect: ${describeDelta(difference(before, human))}.`
  );
  human.currentEventChoice = choice;
  human.householdQuestionThisRound = getHouseholdChoices(human).length > 0;
  state.selectedEventChoice = choice;
  state.log.unshift({
    period: ROUND_LABELS[state.round],
    text: `${human.name} had no affordable response. The simulation imposed "${choice.label}" and recorded a fallback.`,
  });
  state.householdQuestionThisRound = human.householdQuestionThisRound;
  advanceTurnOrPhase();
}

function chooseHousehold(choiceId) {
  const human = getHuman();
  const choice = getHouseholdChoices(human).find((item) => item.id === choiceId);
  if (!choice || !choiceAvailable(human, choice)) return;

  const before = snapshot(human);
  applyChoice(human, choice);
  human.lastChoice += `; ${choice.label.toLowerCase()}`;
  human.journey.push(
    `${ROUND_LABELS[state.round]} - Household decision: ${choice.label}. Effect: ${describeDelta(difference(before, human))}. Household status: ${familyLabel(human)}.`
  );
  advanceTurnOrPhase();
}

function getHouseholdChoices(player) {
  if (!player.family.partnered && !player.family.independentCommitted && state.round <= 3) {
    return state.round === 0
      ? [HOUSEHOLD_CHOICES.formPartnership, HOUSEHOLD_CHOICES.remainIndependent]
      : [HOUSEHOLD_CHOICES.formPartnership, HOUSEHOLD_CHOICES.commitIndependent];
  }
  if (
    player.family.partnered &&
    !player.family.hasChildren &&
    !player.family.childFree &&
    state.round <= 3
  ) {
    return state.round <= 2
      ? [HOUSEHOLD_CHOICES.haveChild, HOUSEHOLD_CHOICES.delayChildren, HOUSEHOLD_CHOICES.childFree]
      : [HOUSEHOLD_CHOICES.haveChild, HOUSEHOLD_CHOICES.childFree];
  }
  return [];
}

function choosePriority(choiceId) {
  const human = getHuman();
  const forcedCoping = isBareCoping(human);
  const choices = getPriorityChoices(human);
  const choice = choices.find((item) => item.id === choiceId);
  if (!choice && !forcedCoping) return;

  if (forcedCoping) {
    human.lastChoice += "; bare coping";
    human.journey.push(
      `${ROUND_LABELS[state.round]} - Priority decision: bare coping. Severe scarcity removed the possibility of a further investment.`
    );
  } else {
    const before = snapshot(human);
    applyChoice(human, choice);
    human.lastChoice += `; ${choice.label.toLowerCase()}`;
    human.journey.push(
      `${ROUND_LABELS[state.round]} - Personal priority: ${choice.label}. Effect: ${describeDelta(difference(before, human))}.`
    );
    human.currentPriorityChoice = choice;
    state.selectedPriorityChoice = choice;
  }

  advanceTurnOrPhase();
}

function resolveBots() {
  const event = LIFE_EVENTS[state.round];
  for (const bot of state.players.filter((player) => !player.isHuman)) {
    const viableEventChoices = event.choices.filter((choice) => choiceAvailable(bot, choice));
    const eventChoice = viableEventChoices.length
      ? chooseForBot(bot, viableEventChoices)
      : selectForcedChoice(bot, event.choices);
    const beforeEvent = snapshot(bot);
    if (!viableEventChoices.length) bot.fallback += 1;
    applyChoice(bot, eventChoice);
    bot.lastChoice = viableEventChoices.length ? eventChoice.label : `Forced fallback: ${eventChoice.label}`;
    bot.journey.push(
      `${ROUND_LABELS[state.round]} - Life decision: ${bot.lastChoice}. Effect: ${describeDelta(difference(beforeEvent, bot))}.`
    );

    const householdChoices = getHouseholdChoices(bot).filter((choice) => choiceAvailable(bot, choice));
    if (householdChoices.length) {
      const householdChoice = chooseForBot(bot, householdChoices);
      const beforeHousehold = snapshot(bot);
      applyChoice(bot, householdChoice);
      bot.lastChoice += `; ${householdChoice.label.toLowerCase()}`;
      bot.journey.push(
        `${ROUND_LABELS[state.round]} - Household decision: ${householdChoice.label}. Effect: ${describeDelta(difference(beforeHousehold, bot))}. Household status: ${familyLabel(bot)}.`
      );
    }

    if (isBareCoping(bot)) {
      bot.lastChoice += "; bare coping";
      bot.journey.push(
        `${ROUND_LABELS[state.round]} - Priority decision: bare coping. Severe scarcity removed further investment.`
      );
      continue;
    }

    const priorityChoices = getPriorityChoices(bot);
    const priorityChoice = chooseForBot(bot, priorityChoices);
    const beforePriority = snapshot(bot);
    applyChoice(bot, priorityChoice);
    bot.lastChoice += `; ${priorityChoice.label.toLowerCase()}`;
    bot.journey.push(
      `${ROUND_LABELS[state.round]} - Personal priority: ${priorityChoice.label}. Effect: ${describeDelta(difference(beforePriority, bot))}.`
    );
  }
}

function chooseForBot(bot, choices) {
  if (!choices.length) return PRIORITY_CHOICES.find((choice) => choice.id === "no-commitment");
  const weighted = choices.map((choice) => {
    const delta = choice.delta || {};
    const tendency = bot.tendency;
    let utility =
      (delta.ec || 0) * tendency.ec +
      (delta.hc || 0) * tendency.hc +
      (delta.sc || 0) * tendency.sc +
      (delta.wb || 0) * tendency.wb +
      (choice.future || 0) * tendency.future;
    utility += Math.random() * 6 - 2;
    return { choice, weight: Math.max(0.25, utility + 7) };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.choice;
  }
  return weighted.at(-1).choice;
}

function getPriorityChoices(player) {
  const available = PRIORITY_CHOICES.filter((choice) => {
    const meetsCondition = !choice.condition || choice.condition(player, state.round);
    const addsExistingTrait = (choice.addTraits || []).some((trait) => hasTrait(player, trait));
    return meetsCondition && !addsExistingTrait && choiceAvailable(player, choice);
  });

  const selected = [];
  const add = (choice) => {
    if (choice && !selected.some((item) => item.id === choice.id)) selected.push(choice);
  };
  const byId = (id) => available.find((choice) => choice.id === id);

  for (const choice of getHouseholdPriorityChoices(player)) add(choice);

  if (hasTrait(player, "debt")) add(byId("repay-debt"));
  if (hasTrait(player, "chronicCondition")) add(byId("care-plan"));
  if (hasTrait(player, "burnout") || player.hc <= 7 || player.wb <= 7) add(byId("recover"));

  const lowestMetric = [...METRICS].sort((a, b) => player[a] - player[b])[0];
  if (lowestMetric === "ec") add(byId(player.ec <= 8 ? "request-assistance" : "stabilize-income"));
  if (lowestMetric === "hc") add(byId("recover"));
  if (lowestMetric === "sc") add(byId("reconnect"));
  if (lowestMetric === "wb") add(byId(player.hc <= 10 ? "recover" : "personal-project"));

  const futureOrder =
    state.round <= 1
      ? player.ec >= 16
        ? ["asset-portfolio", "long-term-home", "career-investment", "health-cover", "kin-network"]
        : player.ec >= 14
          ? ["long-term-home", "career-investment", "health-cover", "kin-network", "asset-portfolio"]
          : ["career-investment", "health-cover", "kin-network", "long-term-home", "asset-portfolio"]
      : state.round <= 3
        ? ["pension", "health-cover", "kin-network", "career-investment"]
        : ["pension", "kin-network", "health-cover"];
  add(futureOrder.map(byId).find(Boolean));

  if (player.ec <= 8) add(byId("stabilize-income"));
  else if (player.wb <= 10) add(byId("protect-time"));
  else add(byId("personal-project"));

  const rankedRemainder = available
    .filter((choice) => !selected.some((item) => item.id === choice.id))
    .sort((a, b) => priorityScore(b, player) - priorityScore(a, player));
  for (const choice of rankedRemainder) add(choice);
  return selected.slice(0, 3);
}

function getHouseholdPriorityChoices(player) {
  let prefix = "household-independent";
  if (player.family.dependentChild) prefix = "household-dependent";
  else if (player.family.hasChildren) prefix = "household-adult";
  else if (player.family.partnered) prefix = "household-partner";

  return HOUSEHOLD_PRIORITY_CHOICES.filter((choice) => {
    const belongsToHousehold = choice.id.startsWith(prefix);
    const meetsCondition = !choice.condition || choice.condition(player, state.round);
    return belongsToHousehold && meetsCondition && choiceAvailable(player, choice);
  }).slice(0, 2);
}

function priorityScore(choice, player) {
  const delta = choice.delta || {};
  let score = (choice.future || 0) * 2;
  for (const metric of METRICS) {
    const need = Math.max(0, 11 - player[metric]);
    if ((delta[metric] || 0) > 0) score += delta[metric] * (1 + need);
    if ((delta[metric] || 0) < 0) score += delta[metric] * (1 + Math.max(0, 7 - player[metric]));
  }
  return score;
}

function selectForcedChoice(player, choices) {
  const eligible = choices.filter(
    (choice) =>
      !(choice.requires || []).some((trait) => !hasTrait(player, trait)) &&
      (!choice.condition || choice.condition(player, state.round))
  );
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => forcedChoiceScore(b) - forcedChoiceScore(a))[0];
}

function forcedChoiceScore(choice) {
  const delta = choice.delta || {};
  return METRICS.reduce((sum, key) => sum + (delta[key] || 0), 0) + (choice.future || 0) * 0.5;
}

function resolveRound() {
  const controlled = getControlledPlayers();
  const beforeById = new Map(controlled.map((player) => [player.id, snapshot(player)]));
  const cohortChoices = state.players
    .map((player) => `${player.name}: ${player.lastChoice}`)
    .join("; ");

  for (const player of state.players) {
    applyMaintenance(player);
    clampCapital(player);
    player.history.push(snapshot(player));
    player.journey.push(`${ROUND_LABELS[state.round]} - End position: ${positionText(player)}.`);
  }

  state.log.unshift({
    period: ROUND_LABELS[state.round],
    text: controlled
      .map(
        (player) =>
          `${player.name}: ${player.lastChoice}. End-of-decade change after recurring obligations and linked effects: ${describeDelta(difference(beforeById.get(player.id), player))}.`
      )
      .join(" "),
  });
  state.log.unshift({ period: "Cohort", text: cohortChoices });
  state.phase = "resolved";
  render();
}

function applyChoice(player, choice) {
  if (!choice) return;
  applyDelta(player, choice.delta || {});
  for (const trait of choice.addTraits || []) addTrait(player, trait);
  for (const trait of choice.removeTraits || []) removeTrait(player, trait);
  if (choice.pending) {
    for (const metric of METRICS) {
      player.pending[metric] = (player.pending[metric] || 0) + (choice.pending[metric] || 0);
    }
  }
  if (choice.special) choice.special(player);
  clampCapital(player);
}

function applyDelta(player, delta) {
  for (const metric of METRICS) player[metric] += delta[metric] || 0;
}

function applyMaintenance(player) {
  if (hasTrait(player, "debt")) {
    player.ec -= 1;
    player.wb -= 1;
  }
  if (hasTrait(player, "burnout")) {
    player.hc -= 1;
    player.wb -= 1;
  }
  if (hasTrait(player, "careDuty") && state.round >= 2) {
    player.ec -= 1;
    player.wb -= 1;
  }
  if (player.sc >= 12 && !hasTrait(player, "kinNetwork")) player.sc -= 1;
  if (hasTrait(player, "healthCover")) player.ec -= 1;
  if (hasTrait(player, "chronicCondition")) {
    const feedbackEnabled = state.feedbackEnabled !== false;
    player.hc -= feedbackEnabled && !hasTrait(player, "healthCover") ? 2 : 1;
    if (!hasTrait(player, "healthCover")) player.ec -= 1;
  }
  applyFamilyMaintenance(player);
}

function updateFamilyStage(player) {
  if (
    player.family.dependentChild &&
    state.round - player.family.childBirthRound >= 2
  ) {
    player.family.dependentChild = false;
    player.family.emptyNest = true;
    player.sc += 1;
    player.wb += 1;
    clampCapital(player);
    player.journey.push(
      `${ROUND_LABELS[state.round]} - Family transition: the child left the dependent household. Direct care costs ended; social and emotional ties remained.`
    );
  }
}

function applyFamilyMaintenance(player) {
  const feedbackEnabled = state.feedbackEnabled !== false;
  if (feedbackEnabled && player.family.partnered && player.ec <= 3) player.wb -= 1;
  if (!player.family.dependentChild) return;

  player.ec -= 1;
  if (feedbackEnabled && player.ec <= 6) {
    player.hc -= 1;
    player.wb -= 2;
  } else if (feedbackEnabled) {
    player.wb += 1;
  }
}

function nextRound() {
  if (state.round >= ROUND_LABELS.length - 1) {
    finishGame();
    return;
  }
  state.round += 1;
  startRound();
}

function finishGame() {
  els.gameScreen.hidden = true;
  els.finalScreen.hidden = false;
  renderFinal();
}

function render() {
  renderRoundTrack();
  renderHumanStats();
  renderCohort();
  renderLog();

  const event = LIFE_EVENTS[state.round];
  const activePlayer = getHuman();
  els.roundKicker.textContent =
    state.mode === "multiplayer" && state.phase !== "resolved"
      ? `ROUND ${state.round + 1} / ${ROUND_LABELS[state.round]} / ${activePlayer.name.toUpperCase()}'S TURN`
      : `ROUND ${state.round + 1} / ${ROUND_LABELS[state.round]}`;
  els.eventTitle.textContent =
    state.phase === "household"
      ? "Household and family"
      : state.phase === "priority"
        ? "What do you protect next?"
        : event.title;
  els.eventDescription.textContent =
    state.phase === "household"
      ? householdPrompt(getHuman())
      : state.phase === "priority"
        ? priorityPrompt(getHuman())
        : event.description;

  const activeShockMessage = activePlayer.roundStartNotes.length
    ? activePlayer.roundStartNotes.join(" ")
    : state.shockMessage;
  els.shockNote.hidden = !activeShockMessage;
  els.shockNote.textContent = activeShockMessage;
  els.choiceArea.hidden = state.phase === "resolved";
  els.resolutionArea.hidden = state.phase !== "resolved";

  if (state.phase === "event") {
    const available = event.choices.some((choice) => choiceAvailable(getHuman(), choice));
    if (available) renderChoices(event.choices, "Question 1 of 2: respond to the decade's central event.", chooseEvent);
    else renderForcedFallback(event);
  }
  if (state.phase === "household") renderHouseholdChoices();
  if (state.phase === "priority") renderPriorityChoices();
  if (state.phase === "resolved") renderResolution();
}

function priorityPrompt(player) {
  const lowest = [...METRICS].sort((a, b) => player[a] - player[b])[0];
  const labels = { ec: "economic capital", hc: "health", sc: "social capital", wb: "wellbeing" };
  const label = labels[lowest];
  const question = player.householdQuestionThisRound ? "Question 3 of 3" : "Question 2 of 2";
  return `${question}. Your options are conditioned by the position you have reached. ${label[0].toUpperCase() + label.slice(1)} is currently your least protected area.`;
}

function householdPrompt(player) {
  if (!player.family.partnered) {
    return "A shared household can increase social and emotional protection while creating obligations that make severe economic scarcity harder to absorb.";
  }
  return "Parenthood can strengthen wellbeing and social connection, while dependent care requires economic reserves. Children remain dependent for two decades.";
}

function renderRoundTrack() {
  els.roundTrack.innerHTML = ROUND_LABELS.map((label, index) => {
    const status = index === state.round ? "current" : index < state.round ? "complete" : "";
    return `<li class="${status}">${index + 1}. ${label}</li>`;
  }).join("");
}

function renderHumanStats() {
  const human = getHuman();
  els.positionKicker.textContent = state.mode === "multiplayer" ? `${human.name.toUpperCase()}'S POSITION` : "YOUR POSITION";
  const metrics = [
    { key: "ec", name: "Economic", className: "economic" },
    { key: "hc", name: "Health", className: "health" },
    { key: "sc", name: "Social", className: "social" },
    { key: "wb", name: "Wellbeing", className: "wellbeing" },
  ];

  els.humanStats.innerHTML = metrics
    .map(({ key, name, className }) => {
      const value = human[key];
      const width = Math.min(100, (value / CAPITAL_MAX) * 100);
      return `
        <dl class="metric-row ${className}">
          <dt>${name}</dt>
          <dd>${value}</dd>
          <div class="meter" aria-label="${name} score ${value}"><span style="width:${width}%"></span></div>
        </dl>`;
    })
    .join("");

  const tags = [
    `<span class="tag">Born: ${escapeHtml(human.background.label)}</span>`,
    `<span class="tag">Household: ${escapeHtml(familyLabel(human))}</span>`,
  ];
  tags.push(...human.traits.map((trait) => `<span class="tag">${TRAIT_LABELS[trait]}</span>`));
  els.humanTraits.innerHTML = tags.join("");
}

function renderCohort() {
  els.cohortList.innerHTML = state.players
    .map(
      (player) => `
        <article class="cohort-entry${player.id === state.activePlayerId && state.phase !== "resolved" ? " current-player" : ""}">
          <header>
            <h3>${escapeHtml(player.name)}${player.id === state.activePlayerId && state.phase !== "resolved" ? " (current)" : state.mode === "bots" && player.isHuman ? " (you)" : ""}</h3>
            <span class="total">TOTAL ${totalCapital(player)}</span>
          </header>
          <p>${escapeHtml(player.background.label)}</p>
          <p>Household: ${escapeHtml(familyLabel(player))}</p>
          ${state.round > 0 ? `<p>Household development: ${escapeHtml(player.lastHouseholdDevelopment)}</p>` : ""}
          <p>Chance: ${escapeHtml(player.lastEvent)}</p>
          <p>${escapeHtml(player.lastChoice)}</p>
        </article>`
    )
    .join("");
}

function renderLog() {
  els.eventLog.innerHTML = state.log
    .slice(0, 14)
    .map(
      (entry) =>
        `<li><span class="log-period">${escapeHtml(entry.period)}</span><span>${escapeHtml(entry.text)}</span></li>`
    )
    .join("");
}

function renderChoices(choices, instruction, handler) {
  const human = getHuman();
  els.choiceArea.innerHTML = `<p class="phase-instruction">${escapeHtml(instruction)}</p>`;
  for (const choice of choices) {
    const available = choiceAvailable(human, choice);
    const button = document.createElement("button");
    button.className = `choice-button${available ? " concealed-choice" : ""}`;
    button.type = "button";
    button.disabled = !available;
    button.innerHTML = available
      ? `<span class="choice-name">${escapeHtml(choice.label)}</span>`
      : `<span class="choice-name">${escapeHtml(choice.label)}</span><span class="choice-effect">${escapeHtml(unavailableReason(human, choice))}</span>`;
    button.addEventListener("click", () => handler(choice.id));
    els.choiceArea.appendChild(button);
  }
}

function renderForcedFallback(event) {
  const choice = selectForcedChoice(getHuman(), event.choices);
  const imposedChoice = choice ? choice.label : "the only remaining institutional response";
  els.choiceArea.innerHTML = `
    <div class="constraint-panel" role="alert">
      <p class="section-number">AGENCY EXHAUSTED</p>
      <h3>No viable response remains</h3>
      <p>
        Your accumulated position cannot cover the immediate cost of any available response.
        The simulation will impose <strong>${escapeHtml(imposedChoice)}</strong>, reduce exhausted
        resources to zero where necessary, and record a fallback.
      </p>
      <button id="forced-fallback-button" class="primary-button constraint-button" type="button">
        Continue under constraint
      </button>
    </div>`;
  document.querySelector("#forced-fallback-button").addEventListener("click", forceEventFallback);
}

function renderHouseholdChoices() {
  renderChoices(
    getHouseholdChoices(getHuman()),
    "Household decision: choose the structure you can and want to sustain at this stage.",
    chooseHousehold
  );
}

function renderPriorityChoices() {
  const human = getHuman();
  if (isBareCoping(human)) {
    els.choiceArea.innerHTML = `
      <p class="phase-instruction">Final decision this decade: at least one resource is 3 or below.</p>
      <button class="choice-button" id="bare-coping-button" type="button">
        <span class="choice-name">Bare coping</span>
        <span class="choice-effect">No additional long-term investment is available. Continue with what remains.</span>
      </button>`;
    document.querySelector("#bare-coping-button").addEventListener("click", () => choosePriority("bare-coping"));
    return;
  }
  renderChoices(
    getPriorityChoices(human),
    `Final decision this decade. Household-specific options reflect your current position: ${familyLabel(human)}. Your central life decision was: ${(human.currentEventChoice || state.selectedEventChoice).label}.`,
    choosePriority
  );
}

function renderResolution() {
  const human = getHuman();
  const nextLabel =
    state.round === ROUND_LABELS.length - 1 ? "View final evaluation" : `Continue to your ${ROUND_LABELS[state.round + 1]}`;
  els.resolutionArea.innerHTML = `
    <h3>The decade closes</h3>
    <p>${state.mode === "multiplayer"
      ? `Every player has completed the decade. Recurring obligations and linked effects have been applied. The cohort spread is now ${cohortSpread()} points.`
      : `Recurring obligations and linked effects have been applied. Your combined score is now ${totalCapital(human)}. The cohort spread is ${cohortSpread()} points.`}
    </p>
    <button id="next-round-button" class="primary-button" type="button">${nextLabel}</button>`;
  document.querySelector("#next-round-button").addEventListener("click", nextRound);
}

function renderFinal() {
  const sorted = [...state.players].sort((a, b) => totalCapital(b) - totalCapital(a));
  const human = state.mode === "bots" ? getControlledPlayers()[0] : state.players[0];
  const mean = Math.round(state.players.reduce((sum, player) => sum + totalCapital(player), 0) / state.players.length);
  const rank = sorted.findIndex((player) => player.id === human.id) + 1;
  const narrativeOrder = state.mode === "multiplayer" ? sorted : [human, ...sorted.filter((player) => player.id !== human.id)];

  for (const player of state.players) {
    if (!player.journey.some((entry) => entry.startsWith("Final"))) {
      player.journey.push(
        `Final - ${positionText(player)}. Household: ${familyLabel(player)}. ${ageingClassification(player.hc)}. Fallback decisions: ${player.fallback}.`
      );
    }
    if (!player.journey.some((entry) => entry.startsWith("Interpretation"))) {
      const playerRank = sorted.findIndex((entry) => entry.id === player.id) + 1;
      player.journey.push(`Interpretation - ${buildLifeNarrative(player, mean, playerRank, state.players.length)}`);
    }
  }

  els.finalSummary.textContent = state.mode === "multiplayer"
    ? `The rounded cohort mean is ${mean} and the highest-lowest spread is ${cohortSpread()} points. ${sorted[0].name} finishes first by combined capital.`
    : `${human.name} finishes ${ordinal(rank)} in a cohort of ${state.players.length}. The rounded cohort mean is ${mean} and the highest-lowest spread is ${cohortSpread()} points.`;
  els.finalNarratives.innerHTML = narrativeOrder
    .map((player) => {
      const playerRank = sorted.findIndex((entry) => entry.id === player.id) + 1;
      return `
        <article class="life-summary ${state.mode === "bots" && player.isHuman ? "human-summary" : ""}">
          <header>
            <h3>${escapeHtml(player.name)}${state.mode === "bots" && player.isHuman ? " (you)" : ""}</h3>
            <span>${ordinal(playerRank)} of ${state.players.length} · total ${totalCapital(player)}</span>
          </header>
          <p>${escapeHtml(buildLifeNarrative(player, mean, playerRank, state.players.length))}</p>
        </article>`;
    })
    .join("");
  els.finalTable.innerHTML = sorted
    .map(
      (player) => `
        <tr class="${state.mode === "bots" && player.isHuman ? "human-row" : ""}">
          <td>${escapeHtml(player.name)}${state.mode === "bots" && player.isHuman ? " (you)" : ""}</td>
          <td>${escapeHtml(familyLabel(player))}</td>
          <td>${player.ec}</td>
          <td>${player.hc}</td>
          <td>${player.sc}</td>
          <td>${player.wb}</td>
          <td>${totalCapital(player)}</td>
          <td>${player.fallback}</td>
          <td>${ageingClassification(player.hc)}</td>
        </tr>`
    )
    .join("");

  const noReserve = state.players.filter((player) => player.ec === 0).length;
  const activeCare = state.players.filter((player) => player.family.dependentChild).length;
  els.closingNote.textContent = `Across this cohort, ${noReserve} ${noReserve === 1 ? "person reached" : "people reached"} retirement with no economic reserve and ${activeCare} ${activeCare === 1 ? "person still had" : "people still had"} dependent care. Starting conditions, household timing, chance, and repeated costs shaped how much room each person had to choose.`;
  els.trajectoryChart.innerHTML = buildTrajectoryChart(state.players);
  els.journeyRecords.innerHTML = sorted
    .map(
      (player) => `
        <article class="journey-record">
          <h3>${escapeHtml(player.name)}${state.mode === "bots" && player.isHuman ? " (you)" : ""}</h3>
          <pre>${escapeHtml(buildJourneyText(player))}</pre>
        </article>`
    )
    .join("");
  els.copyStatus.textContent = "";
}

function buildLifeNarrative(player, mean, rank, cohortSize) {
  const secondPerson = state.mode === "bots" && player.isHuman;
  const opening = secondPerson ? "You were" : `${player.name} was`;
  const relation = totalCapital(player) >= mean ? "above" : "below";
  const start = `${opening} born into conditions classified as “${player.background.label.toLowerCase()}” and finished ${ordinal(rank)} of ${cohortSize}, ${relation} the cohort mean.`;
  return [
    start,
    householdNarrative(player),
    metricNarrative(player),
    worstChanceNarrative(player),
    compoundedNarrative(player),
  ].join(" ");
}

function householdNarrative(player) {
  const secondPerson = state.mode === "bots" && player.isHuman;
  const subject = secondPerson ? "You" : player.name;
  const possessive = secondPerson ? "your" : `${player.name}'s`;
  if (!player.family.partnered) {
    if (player.sc >= 12) {
      return `${subject} maintained an independent household while chosen ties remained a strong source of support.`;
    }
    if (player.ec <= 5) {
      return `${subject} maintained an independent household, and the cost of carrying it alone met a very thin reserve.`;
    }
    return `${subject} maintained an independent household with autonomy intact but without pooled household resources.`;
  }

  const partnershipPeriod = Number.isInteger(player.family.partnershipRound)
    ? `the ${ROUND_LABELS[player.family.partnershipRound]}`
    : "adulthood";
  if (!player.family.hasChildren) {
    const decision = player.family.childFree
      ? "deliberately built a child-free household"
      : "reached retirement without adding dependent care";
    return `${subject} formed a partnership in ${partnershipPeriod} and ${decision}; shared life ${player.ec <= 5 ? "could not prevent economic scarcity" : "provided some protection against living costs"}.`;
  }

  const birthPeriod = Number.isInteger(player.family.childBirthRound)
    ? `the ${ROUND_LABELS[player.family.childBirthRound]}`
    : "adulthood";
  if (player.family.dependentChild) {
    return `${subject} formed a partnership in ${partnershipPeriod} and became a parent in ${birthPeriod}. Dependent care was still active at retirement, so ${possessive} later-life resources were supporting two generations at once.`;
  }
  const reserve = player.ec <= 3
    ? "but the household reached retirement with its economic reserve exhausted"
    : player.ec <= 7
      ? "with only a narrow economic reserve left after the care years"
      : "with enough reserve to move from direct care toward a more reciprocal adult relationship";
  return `${subject} formed a partnership in ${partnershipPeriod} and became a parent in ${birthPeriod}. The child had become independent by retirement, ${reserve}.`;
}

function metricNarrative(player) {
  const descriptions = [
    metricBandText("ec", player.ec),
    metricBandText("hc", player.hc),
    metricBandText("sc", player.sc),
    metricBandText("wb", player.wb),
  ];
  descriptions[0] = descriptions[0][0].toUpperCase() + descriptions[0].slice(1);
  return `${descriptions.slice(0, -1).join("; ")}; and ${descriptions.at(-1)}.`;
}

function metricBandText(metric, value) {
  const bands = {
    ec: ["economic security was exhausted", "economic security was precarious", "economic security remained limited", "economic security was stable", "economic security was abundant"],
    hc: ["health was severely compromised", "health was fragile", "health remained constrained", "health was resilient", "health was strongly protected"],
    sc: ["social connection had collapsed", "social connection was sparse", "social connection remained serviceable", "social connection was strong", "social connection was exceptionally dense"],
    wb: ["wellbeing had collapsed", "wellbeing was badly strained", "wellbeing remained mixed", "wellbeing was secure", "wellbeing was exceptionally strong"],
  };
  const index = value <= 3 ? 0 : value <= 7 ? 1 : value <= 11 ? 2 : value <= 15 ? 3 : 4;
  return `${bands[metric][index]} at ${value}`;
}

function worstChanceNarrative(player) {
  const unique = new Map();
  for (const event of player.chanceHistory) {
    const severity = METRICS.reduce((sum, metric) => sum + Math.max(0, -(event.delta[metric] || 0)), 0);
    const existing = unique.get(event.title);
    if (!existing || severity > existing.severity) unique.set(event.title, { ...event, severity });
  }
  const worst = [...unique.values()]
    .filter((event) => event.severity > 0)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 2);
  if (!worst.length) return "None of the recorded chance events caused a direct loss.";
  const descriptions = worst.map(
    (event) => `“${event.title}” in the ${ROUND_LABELS[event.round]} (${describeDelta(event.delta)})`
  );
  return `The hardest recorded chance ${worst.length === 1 ? "event was" : "events were"} ${joinNatural(descriptions)}.`;
}

function compoundedNarrative(player) {
  const low = METRICS.filter((metric) => player[metric] <= 7);
  if (player.ec <= 3 && player.wb <= 3) {
    return "Material depletion and emotional collapse reinforced one another by the end of the life course.";
  }
  if (player.hc <= 7 && player.sc >= 12) {
    return "Strong social ties survived, but they could not fully compensate for accumulated health damage.";
  }
  if (player.ec <= 7 && player.sc >= 12) {
    return "Social connection remained durable even as material security narrowed.";
  }
  if (player.ec >= 12 && player.hc <= 7) {
    return "Material protection outlasted physical health, showing that one form of advantage did not erase another form of decline.";
  }
  if (player.wb >= 12 && player.ec <= 7) {
    return "Life satisfaction proved more resilient than the household balance sheet.";
  }
  if (METRICS.every((metric) => player[metric] >= 12)) {
    return "Advantages reinforced one another across every measured part of later life.";
  }
  if (low.length >= 2) {
    return "Several depleted resources began constraining one another, leaving little room for recovery by retirement.";
  }
  const strongest = [...METRICS].sort((a, b) => player[b] - player[a])[0];
  const weakest = [...METRICS].sort((a, b) => player[a] - player[b])[0];
  const labels = { ec: "economic security", hc: "health", sc: "social connection", wb: "wellbeing" };
  return `${labels[strongest][0].toUpperCase() + labels[strongest].slice(1)} offered the clearest protection, while ${labels[weakest]} remained the main constraint.`;
}

function joinNatural(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function buildJourneyText(player) {
  return [`${player.name.toUpperCase()} - LIFE-COURSE RECORD`, ...player.journey].join("\n");
}

function cohortJourneyText() {
  return state.players.map(buildJourneyText).join("\n\n========================================\n\n");
}

async function copyJourneys() {
  try {
    await navigator.clipboard.writeText(cohortJourneyText());
    els.copyStatus.textContent = "Cohort record copied to the clipboard.";
  } catch {
    els.copyStatus.textContent = "Copying was blocked by the browser. The complete record remains selectable below.";
  }
}

function buildTrajectoryChart(players) {
  const width = 900;
  const height = 330;
  const margin = { top: 35, right: 125, bottom: 45, left: 44 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const allTotals = players.flatMap((player) => player.history.map((point) => point.total));
  const max = Math.max(50, Math.ceil(Math.max(...allTotals) / 10) * 10);
  const colors = ["#8b3f2c", "#294c3a", "#36566b", "#8a6b2e", "#6b4d64", "#5d5b52"];
  const x = (index) => margin.left + (index / 5) * chartWidth;
  const y = (value) => margin.top + chartHeight - (value / max) * chartHeight;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((part) => {
      const value = Math.round(max * part);
      const yPos = y(value);
      return `<line x1="${margin.left}" y1="${yPos}" x2="${width - margin.right}" y2="${yPos}" stroke="#aaa292" stroke-width="1"/><text x="${margin.left - 8}" y="${yPos + 4}" text-anchor="end" font-size="11" fill="#5b5c52">${value}</text>`;
    })
    .join("");

  const labels = ["Birth", ...ROUND_LABELS]
    .map(
      (label, index) =>
        `<text x="${x(index)}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#5b5c52">${label}</text>`
    )
    .join("");

  const lines = players
    .map((player, playerIndex) => {
      const color = colors[playerIndex % colors.length];
      const highlighted = state.mode === "bots" && player.isHuman;
      const points = player.history.map((point, index) => `${x(index)},${y(point.total)}`).join(" ");
      const lastPoint = player.history.at(-1);
      return `
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="${highlighted ? 4 : 2}"/>
        ${player.history
          .map((point, index) => `<circle cx="${x(index)}" cy="${y(point.total)}" r="${highlighted ? 4 : 3}" fill="${color}"/>`)
          .join("")}
        <text x="${width - margin.right + 12}" y="${y(lastPoint.total) + 4}" font-size="11" font-weight="${highlighted ? 700 : 400}" fill="${color}">${escapeHtml(player.name)}</text>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc">
      <title id="chart-title">Combined resources across five decades</title>
      <desc id="chart-desc">A line for each participant shows economic, health, social, and wellbeing resources diverging from unequal birth positions.</desc>
      <text x="${margin.left}" y="16" font-size="12" font-weight="700" fill="#1d211c">COMBINED POSITION BY DECADE</text>
      ${grid}
      ${labels}
      ${lines}
    </svg>`;
}

function choiceAvailable(player, choice) {
  if ((choice.requires || []).some((trait) => !hasTrait(player, trait))) return false;
  if (choice.condition && !choice.condition(player, state.round)) return false;
  const delta = choice.delta || {};
  return METRICS.every((metric) => player[metric] + (delta[metric] || 0) >= 0);
}

function unavailableReason(player, choice) {
  if ((choice.requires || []).some((trait) => !hasTrait(player, trait))) {
    return `Unavailable. Requires ${(choice.requires || []).map((trait) => TRAIT_LABELS[trait].toLowerCase()).join(", ")}.`;
  }
  return "Unavailable. The immediate cost exceeds your remaining resources.";
}

function isBareCoping(player) {
  return METRICS.some((metric) => player[metric] <= 3);
}

function hasTrait(player, trait) {
  return player.traits.includes(trait);
}

function addTrait(player, trait) {
  if (!hasTrait(player, trait)) player.traits.push(trait);
}

function removeTrait(player, trait) {
  player.traits = player.traits.filter((item) => item !== trait);
}

function clampCapital(player) {
  for (const metric of METRICS) player[metric] = Math.min(CAPITAL_MAX, Math.max(0, Math.round(player[metric])));
}

function snapshot(player) {
  return {
    ec: player.ec,
    hc: player.hc,
    sc: player.sc,
    wb: player.wb,
    total: totalCapital(player),
  };
}

function difference(before, after) {
  const delta = {};
  for (const metric of METRICS) delta[metric] = after[metric] - before[metric];
  return delta;
}

function totalCapital(player) {
  return METRICS.reduce((sum, metric) => sum + player[metric], 0);
}

function cohortSpread() {
  const totals = state.players.map(totalCapital);
  return Math.max(...totals) - Math.min(...totals);
}

function getHuman() {
  return state.players.find((player) => player.id === state.activePlayerId) || state.players.find((player) => player.isHuman);
}

function describeDelta(delta) {
  const labels = { ec: "economic", hc: "health", sc: "social", wb: "wellbeing" };
  const parts = [];
  for (const metric of METRICS) {
    if (delta[metric]) parts.push(`${delta[metric] > 0 ? "+" : ""}${Math.round(delta[metric])} ${labels[metric]}`);
  }
  return parts.join(", ") || "no immediate numerical change";
}

function positionText(player) {
  return `economic ${player.ec}, health ${player.hc}, social ${player.sc}, wellbeing ${player.wb}`;
}

function familyLabel(player) {
  if (!player.family.partnered) return "Independent, no children";
  if (!player.family.hasChildren) return "Married/partnered, no children";
  if (player.family.dependentChild) return "Married/partnered, dependent child";
  return "Married/partnered, adult child";
}

function ageingClassification(health) {
  if (health >= 15) return "Optimal / successful ageing";
  if (health >= 8) return "Usual ageing";
  return "Pathological / high dependency";
}

function closingSentence(player, mean) {
  const relation = totalCapital(player) >= mean ? "above" : "below";
  const lowest = [...METRICS].sort((a, b) => player[a] - player[b])[0];
  const labels = { ec: "economic security", hc: "health", sc: "social connection", wb: "wellbeing" };
  return `You were born into ${player.background.label.toLowerCase()} and finished ${relation} the cohort mean. Your final household was ${familyLabel(player).toLowerCase()}. Your least protected final area was ${labels[lowest]}. The result combines inherited conditions, hidden chance, household obligations, choices, recurring costs, and compounding.`;
}

function ordinal(number) {
  if (number % 10 === 1 && number % 100 !== 11) return `${number}st`;
  if (number % 10 === 2 && number % 100 !== 12) return `${number}nd`;
  if (number % 10 === 3 && number % 100 !== 13) return `${number}rd`;
  return `${number}th`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetGame() {
  state = null;
  els.startScreen.hidden = false;
  els.gameScreen.hidden = true;
  els.finalScreen.hidden = true;
  els.resetButton.hidden = true;
}

els.startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(els.startForm);
  const mode = String(data.get("gameMode") || "bots");
  const cohortSize = Number(data.get("cohortSize"));
  if (mode === "multiplayer") {
    const names = String(data.get("playerNames") || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, cohortSize);
    startGame(names, cohortSize, mode);
  } else {
    startGame(String(data.get("playerName")), cohortSize, mode);
  }
});
els.gameMode.addEventListener("change", () => {
  const multiplayer = els.gameMode.value === "multiplayer";
  els.singlePlayerFields.hidden = multiplayer;
  els.multiplayerFields.hidden = !multiplayer;
});
els.resetButton.addEventListener("click", resetGame);
els.replayButton.addEventListener("click", resetGame);
els.copyJourneysButton.addEventListener("click", copyJourneys);
