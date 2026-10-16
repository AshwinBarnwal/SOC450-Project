"""
Compounding Advantage — Monte Carlo simulator for playtesting & balancing.

Encodes the rules in game_mech.pdf. Where the rules are silent or ambiguous,
the choice made here is marked  # ASSUMPTION  and listed in ASSUMPTIONS below,
so the group can confirm or change it. All tunable numbers live in CONFIG.

Usage:
    python cad_sim.py                 # run all experiments, write log + summary
    python cad_sim.py --runs 5000     # more runs per experiment
"""
import argparse, random, copy, json
from collections import Counter
import numpy as np
import pandas as pd

CAPS = ("EC", "HC", "SC")

CONFIG = {
    "start": {"EC": 10, "HC": 10, "SC": 10},
    "cad_high": 14, "cad_low": 6, "cad_step": 2,     # K>=14 -> +2 ; K<=6 -> -2
    "cad_on": True,
    "bare_coping_at": 4,                              # any capital <= 4
    "floor": 0, "ceiling": None,                      # ASSUMPTION: capitals can't go below 0
    "agency_min_ec_after": 5,                         # ASSUMPTION: can't invest if EC would drop below 5
    "recession": {"base": 3, "poor_ec": 6, "poor_loss": 5},
    "health_exp": {"poor_hc": 7, "boost": 3, "chronic_boost": 2, "cover_ec": 1},
    "pension_late_ec": 2,                             # ASSUMPTION: Pension pays +2 EC in round 5
    "portfolio_ec_per_round": 1,                      # ASSUMPTION: Asset Portfolio +1 EC/round
    "care_duty_from_round": 3,
    # --- balancing knobs (defaults = rules exactly as written; TUNED below changes them) ---
    "income_per_round": 0,        # baseline earnings +EC in rounds 1-4 (not if exited labour market)
    "sc_decay_from_round": None,  # SC -1 per round from this round (network shrinkage in later life)
    "savings_gate_ec": None,      # 'Use savings', 'Buy home', 'Return to school' need EC >= this
    "late_shock_mult": 1.0,       # timing: negative event effects x this in rounds 4-5                        # ASSUMPTION: "midlife" = round 3 (40s) onwards
    # ASSUMPTION: which life events can be drawn in each decade (rules don't say)
    "event_pools": {
        1: ["job_displacement", "housing", "inheritance", "credential"],
        2: ["job_displacement", "housing", "inheritance", "credential"],
        3: ["parental_decline", "midcareer_layoff", "job_displacement", "credential"],
        4: ["parental_decline", "midcareer_layoff", "chronic_shock"],
        5: ["retirement", "old_age_dependency", "chronic_shock"],
    },
}

TUNED = {  # proposed balance changes, tested in experiment T_*
    "income_per_round": 2,
    "sc_decay_from_round": 4,
    "savings_gate_ec": 8,
    "late_shock_mult": 1.5,
    "pension_late_ec": 5,
    "portfolio_ec_per_round": 2,
    "cad_low": 5,
}  # chosen from a parameter sweep: see balancing_report

ASSUMPTIONS = [
    "Each round a player draws ONE life event, uniformly from that decade's pool (CONFIG['event_pools']).",
    "Capitals are floored at 0.",
    "An agency investment is only allowed if EC stays >= 5 afterwards; Bare Coping (any capital <= 4) blocks all agency investments.",
    "Bare Coping restricts the Agency step only; players still choose among life-event options.",
    "Precarious Work: each later Job Displacement / Layoff costs an extra -1 EC.",
    "Career Security: Job Displacement costs 1 EC less; Recession loss reduced by 1. Mobility: Recession loss reduced by 1.",
    "Debt, Asset Portfolio and Home Equity each add -1 EC to the Recession loss.",
    "Care Duty maintenance starts in round 3 (40s); Care Duty adds an extra -1 HC to 'Informal care'.",
    "Kin Network in 'Coordinate family' gives +1 HC back.",
    "Health-expansion line '3EC + 1' read as: Health Cover holders get +1 EC.",
    "Pension pays +2 EC in round 5 and offsets EC loss by +2 for 'Exit labour market' / 'Retire early'.",
    "Asset Portfolio pays +1 EC per round (maintenance step).",
    "Care Risk (from rationing treatment) makes 'Rely on family' / 'Formal support' cost 1 extra HC.",
    "Mobility adds +1 HC to 'Part-time work'.",
    "'Use Career Security' is only available to players who hold Career Security.",
    "Return to school's +5 EC arrives in the next round's maintenance step.",
]

# ----------------------------------------------------------------------------
# Life events: each returns list of (choice_name, apply_fn)
# apply_fn(p) mutates player p
# ----------------------------------------------------------------------------
ACTIVE = {"cfg": CONFIG, "round": 1}

def add(p, **d):
    m = ACTIVE["cfg"]["late_shock_mult"] if ACTIVE["round"] >= 4 else 1.0
    for k, v in d.items():
        p["cap"][k] += int(round(v * m)) if v < 0 else v

def gated(p):
    g = ACTIVE["cfg"]["savings_gate_ec"]
    return g is not None and p["cap"]["EC"] < g

def gain(p, *traits):
    p["traits"].update(traits)

def ev_job_displacement(p):
    extra = -1 if "Precarious Work" in p["traits"] else 0
    cs = 1 if "Career Security" in p["traits"] else 0
    return [
        ("Take any job", lambda p: (add(p, EC=-2 + cs + extra, HC=1), gain(p, "Precarious Work"))),
        ("Retrain",      lambda p: (add(p, EC=-3 + cs + extra, HC=-1), gain(p, "Career Security"))),
        ("Use network",  lambda p: (add(p, EC=-1 + cs + extra, SC=3), gain(p, "Kin Network"))),
    ]

def ev_housing(p):
    opts = [("Rent / stay mobile", lambda p: (add(p, EC=-1, HC=1), gain(p, "Mobility")))]
    if not gated(p):
        opts.append(("Buy home", lambda p: (add(p, EC=-5, SC=2), gain(p, "Home Equity"))))
    return opts

def ev_inheritance(p):
    return [
        ("Invest",          lambda p: (add(p, EC=5), gain(p, "Asset Portfolio"))),
        ("Secure housing",  lambda p: (add(p, EC=2, SC=2), gain(p, "Home Equity"))),
        ("Support family",  lambda p: (add(p, EC=-1, SC=4), gain(p, "Kin Network"))),
    ]

def ev_credential(p):
    def stay(p):
        add(p, EC=2, SC=1)
        if p["cap"]["EC"] >= 12:
            gain(p, "Career Security")
    def school(p):
        add(p, EC=-4, HC=-2); gain(p, "Career Security"); p["pending_ec"] += 5
    opts = [
        ("Stay in job",      stay),
        ("Reduce hours",     lambda p: (add(p, EC=-2, SC=3, HC=1), gain(p, "Care Duty"))),
    ]
    if not gated(p):
        opts.append(("Return to school", school))
    return opts

def ev_parental_decline(p):
    kin = "Kin Network" in p["traits"]
    cd = -1 if "Care Duty" in p["traits"] else 0
    return [
        ("Formal care",       lambda p: add(p, EC=-3 if kin else -5)),
        ("Informal care",     lambda p: add(p, HC=-4 + cd, SC=-3)),
        ("Coordinate family", lambda p: add(p, EC=-2, HC=-2 + (1 if kin else 0), SC=2)),
    ]

def ev_midcareer_layoff(p):
    extra = -1 if "Precarious Work" in p["traits"] else 0
    pen = 2 if "Pension" in p["traits"] else 0
    opts = []
    if "Career Security" in p["traits"]:
        opts.append(("Use Career Security", lambda p: add(p, EC=-2 + extra)))
    opts += [
        ("Lower-status job",    lambda p: add(p, EC=-3 + extra, HC=-1, SC=1)),
        ("Exit labour market",  lambda p: (add(p, EC=-5 + pen, HC=3, SC=2), gain(p, "Exited"))),
    ]
    return opts

def ev_chronic_shock(p):
    return [
        ("Manage aggressively", lambda p: (add(p, HC=-2, EC=-1), gain(p, "Chronic Condition"))),
        ("Ration treatment",    lambda p: (add(p, EC=1, HC=-5), gain(p, "Chronic Condition", "Care Risk"))),
    ]

def ev_retirement(p):
    pen = 2 if "Pension" in p["traits"] else 0
    mob = 1 if "Mobility" in p["traits"] else 0
    return [
        ("Retire early",   lambda p: add(p, EC=-4 + pen, HC=3, SC=2)),
        ("Work longer",    lambda p: add(p, EC=4, HC=-3, SC=-1)),
        ("Part-time work", lambda p: add(p, EC=1, HC=1 + mob, SC=1)),
    ]

def ev_old_age_dependency(p):
    kin = "Kin Network" in p["traits"]
    cover = "Health Cover" in p["traits"]
    risk = -1 if "Care Risk" in p["traits"] else 0
    return [
        ("Formal support",  lambda p: add(p, EC=-1 if cover else -3, HC=2 + risk)),
        ("Rely on family",  lambda p: add(p, EC=-1, SC=2, HC=risk) if kin else add(p, EC=-3, SC=-3, HC=risk)),
        ("Conserve assets", lambda p: add(p, EC=2, HC=-3, SC=-1)),
    ]

EVENTS = {
    "job_displacement": ev_job_displacement, "housing": ev_housing,
    "inheritance": ev_inheritance, "credential": ev_credential,
    "parental_decline": ev_parental_decline, "midcareer_layoff": ev_midcareer_layoff,
    "chronic_shock": ev_chronic_shock, "retirement": ev_retirement,
    "old_age_dependency": ev_old_age_dependency,
}

AGENCY = {
    "Career Investment": (dict(EC=-4, HC=-1), ["Career Security"]),
    "Health Cover":      (dict(EC=-3, HC=3),  ["Health Cover"]),
    "Kin Network":       (dict(EC=-2, HC=-1, SC=4), ["Kin Network"]),
    "Long-Term Home":    (dict(EC=-5, SC=1),  ["Home Equity"]),
    "Pension":           (dict(EC=-3),        ["Pension"]),
    "Asset Portfolio":   (dict(EC=-5),        ["Asset Portfolio"]),
    "Overtime":          (dict(EC=3, HC=-2, SC=-1), ["Burnout"]),
}

# ----------------------------------------------------------------------------
# Player strategies (how a simulated player picks options)
# ----------------------------------------------------------------------------
TRAIT_VALUE = {  # rough long-run value a forward-looking player assigns
    "Career Security": 3, "Kin Network": 3, "Health Cover": 3, "Pension": 3,
    "Asset Portfolio": 2, "Home Equity": 1, "Mobility": 1,
    "Debt": -4, "Burnout": -4, "Chronic Condition": -3, "Care Duty": -2,
    "Precarious Work": -2, "Care Risk": -2,
}

def score(p, policy):
    c = p["cap"]
    if policy == "myopic":       # maximise total right now
        return sum(c.values())
    if policy == "balanced":     # protect the weakest capital
        return 3 * min(c.values()) + sum(c.values())
    if policy == "planner":      # total + value of traits held
        return sum(c.values()) + sum(TRAIT_VALUE.get(t, 0) for t in p["traits"]) + 2 * min(c.values())
    raise ValueError(policy)

def pick(p, options, policy, rng):
    if policy == "random":
        return rng.choice(options)
    best, best_s = [], None
    for name, fn in options:
        q = copy.deepcopy(p); fn(q); s = score(q, policy)
        if best_s is None or s > best_s:
            best, best_s = [(name, fn)], s
        elif s == best_s:
            best.append((name, fn))
    return rng.choice(best)

def agency_options(p, cfg):
    opts = [("None", lambda p: None)]
    for name, (delta, traits) in AGENCY.items():
        if traits[0] in p["traits"]:
            continue
        if p["cap"]["EC"] + delta.get("EC", 0) < cfg["agency_min_ec_after"]:
            continue
        opts.append((name, (lambda d, t: lambda p: (add(p, **d), gain(p, *t)))(delta, traits)))
    return opts

# ----------------------------------------------------------------------------
# One game
# ----------------------------------------------------------------------------
def clamp(p, cfg):
    for k in CAPS:
        p["cap"][k] = max(cfg["floor"], p["cap"][k])

def period_shock(p, rnd, cfg):
    t = p["traits"]
    if rnd == 3:
        r = cfg["recession"]
        loss = r["poor_loss"] if p["cap"]["EC"] <= r["poor_ec"] else r["base"]
        loss -= ("Career Security" in t) + ("Mobility" in t)
        loss += ("Debt" in t) + ("Asset Portfolio" in t) + ("Home Equity" in t)
        add(p, EC=-max(0, loss)); return f"Recession -{max(0, loss)}EC"
    if rnd == 5:
        h = cfg["health_exp"]; got = []
        if p["cap"]["HC"] <= h["poor_hc"]: add(p, HC=h["boost"]); got.append(f"+{h['boost']}HC")
        if "Chronic Condition" in t: add(p, HC=h["chronic_boost"]); got.append(f"+{h['chronic_boost']}HC")
        if "Health Cover" in t: add(p, EC=h["cover_ec"]); got.append(f"+{h['cover_ec']}EC")
        return "Healthcare expansion " + (" ".join(got) or "(none)")
    return ""

def maintenance(p, rnd, cfg):
    saved = ACTIVE["round"]; ACTIVE["round"] = 0   # recurring costs are not timing-scaled
    try:
        _maintenance(p, rnd, cfg)
    finally:
        ACTIVE["round"] = saved

def _maintenance(p, rnd, cfg):
    t = p["traits"]
    if cfg["income_per_round"] and rnd <= 4 and "Exited" not in t:
        p["cap"]["EC"] += cfg["income_per_round"]
    if cfg["sc_decay_from_round"] and rnd >= cfg["sc_decay_from_round"]:
        p["cap"]["SC"] -= 1
    if "Debt" in t: add(p, EC=-1)
    if "Burnout" in t: add(p, HC=-1)
    if "Care Duty" in t and rnd >= cfg["care_duty_from_round"]: add(p, EC=-1, HC=-1)
    if "Health Cover" in t: add(p, EC=-1)
    if "Chronic Condition" in t:
        add(p, HC=-1)
        if "Health Cover" not in t: add(p, EC=-1)
    if "Asset Portfolio" in t: add(p, EC=cfg["portfolio_ec_per_round"])
    if "Pension" in t and rnd == 5: add(p, EC=cfg["pension_late_ec"])
    if p["pending_ec"]: add(p, EC=p["pending_ec"]); p["pending_ec"] = 0

def cad(p, cfg):
    fired = []
    if not cfg["cad_on"]: return fired
    for k in CAPS:
        if p["cap"][k] >= cfg["cad_high"]: p["cap"][k] += cfg["cad_step"]; fired.append(f"{k}+")
        elif p["cap"][k] <= cfg["cad_low"]: p["cap"][k] -= cfg["cad_step"]; fired.append(f"{k}-")
    return fired

def recession_choice(p, policy, rng):
    # The doc lists Recession as a life-event with choices; we offer it in round 3
    # in addition to the period shock.  ASSUMPTION: treated as the round-3 coping choice.
    opts = [
        ("Borrow",               lambda p: (add(p, EC=1), gain(p, "Debt"))),
        ("Withdraw from work",   lambda p: (add(p, EC=-3, HC=2, SC=1), gain(p, "Exited"))),
    ]
    if not gated(p):
        opts.append(("Use savings", lambda p: add(p, EC=-2, HC=1)))
    return opts

def play_game(n_players, policies, starts, cfg, rng, game_id, condition):
    players = []
    for i in range(n_players):
        players.append({"id": i, "policy": policies[i], "group": starts[i][0],
                        "cap": dict(starts[i][1]), "traits": set(), "pending_ec": 0})
    rows = []
    ACTIVE["cfg"] = cfg
    for rnd in range(1, 6):
        ACTIVE["round"] = rnd
        for p in players:
            before = dict(p["cap"])
            shock = period_shock(p, rnd, cfg); clamp(p, cfg)
            ev = rng.choice(cfg["event_pools"][rnd])
            choice, fn = pick(p, EVENTS[ev](p), p["policy"], rng); fn(p); clamp(p, cfg)
            rec = ""
            if rnd == 3:
                rec, fn2 = pick(p, recession_choice(p, p["policy"], rng), p["policy"], rng); fn2(p); clamp(p, cfg)
            bare = min(p["cap"].values()) <= cfg["bare_coping_at"]
            if bare:
                agency = "Bare Coping"
            else:
                pol = p["policy"]
                ACTIVE["round"] = 0          # investment costs are not timing-scaled
                agency, fn3 = pick(p, agency_options(p, cfg), pol, rng); fn3(p)
                ACTIVE["round"] = rnd
            clamp(p, cfg)
            maintenance(p, rnd, cfg); clamp(p, cfg)
            fired = cad(p, cfg); clamp(p, cfg)
            rows.append({
                "condition": condition, "game": game_id, "player": p["id"], "group": p["group"],
                "policy": p["policy"], "round": rnd, "age": ["20s","30s","40s","50s","60s+"][rnd-1],
                "shock": shock, "event": ev, "choice": choice, "recession_choice": rec,
                "agency": agency, "bare_coping": bare, "cad_fired": " ".join(fired),
                "EC_before": before["EC"], "HC_before": before["HC"], "SC_before": before["SC"],
                "EC": p["cap"]["EC"], "HC": p["cap"]["HC"], "SC": p["cap"]["SC"],
                "total": sum(p["cap"].values()), "traits": ";".join(sorted(p["traits"])),
            })
    return rows

# ----------------------------------------------------------------------------
# Metrics
# ----------------------------------------------------------------------------
def gini(x):
    x = np.sort(np.asarray(x, dtype=float))
    if x.sum() == 0: return 0.0
    n = len(x); idx = np.arange(1, n + 1)
    return float((2 * idx - n - 1).dot(x) / (n * x.sum()))

def aging_class(hc):
    return "Optimal" if hc >= 15 else ("Usual" if hc >= 8 else "Pathological")

# ----------------------------------------------------------------------------
# Experiments
# ----------------------------------------------------------------------------
def run(condition, runs, cfg, rng, n_players=5, policy_mode="random", start_mode="identical"):
    all_rows = []
    pol_list = ["random", "myopic", "balanced", "planner"]
    for g in range(runs):
        if policy_mode == "mixed":
            pols = [rng.choice(pol_list) for _ in range(n_players)]
        else:
            pols = [policy_mode] * n_players
        if start_mode == "identical":
            starts = [("equal", cfg["start"])] * n_players
        else:  # differentiated starts, same cohort total on average
            starts = []
            for _ in range(n_players):
                grp = rng.choice(["advantaged", "middle", "disadvantaged"])
                base = {"advantaged": 12, "middle": 10, "disadvantaged": 8}[grp]
                starts.append((grp, {"EC": base, "HC": base, "SC": base}))
        all_rows += play_game(n_players, pols, starts, cfg, rng, g, condition)
    return pd.DataFrame(all_rows)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    experiments = []
    base = copy.deepcopy(CONFIG)
    experiments.append(run("A_identical_mixed", args.runs, base, rng, policy_mode="mixed"))
    experiments.append(run("B_identical_random", args.runs, base, rng, policy_mode="random"))
    nocad = copy.deepcopy(CONFIG); nocad["cad_on"] = False
    experiments.append(run("C_identical_mixed_noCAD", args.runs, nocad, rng, policy_mode="mixed"))
    experiments.append(run("D_differentiated_mixed", args.runs, base, rng, policy_mode="mixed", start_mode="diff"))
    for pol in ["myopic", "balanced", "planner"]:
        experiments.append(run(f"P_{pol}", args.runs, base, rng, policy_mode=pol))
    tuned = copy.deepcopy(CONFIG); tuned.update(TUNED)
    experiments.append(run("T_identical_mixed", args.runs, tuned, rng, policy_mode="mixed"))
    t_nocad = copy.deepcopy(tuned); t_nocad["cad_on"] = False
    experiments.append(run("T_identical_mixed_noCAD", args.runs, t_nocad, rng, policy_mode="mixed"))
    experiments.append(run("T_differentiated_mixed", args.runs, tuned, rng, policy_mode="mixed", start_mode="diff"))
    for pol in ["myopic", "planner"]:
        experiments.append(run(f"T_{pol}", args.runs, tuned, rng, policy_mode=pol))

    df = pd.concat(experiments, ignore_index=True)
    df.to_csv("simulation_log.csv.gz", index=False, compression="gzip")
    with open("assumptions.json", "w") as f:
        json.dump({"assumptions": ASSUMPTIONS, "config": CONFIG}, f, indent=2, default=str)
    print(f"Wrote simulation_log.csv.gz: {len(df):,} rows")

if __name__ == "__main__":
    main()
