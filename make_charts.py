"""Charts + summary tables from simulation_log.csv.gz (run cad_sim.py first)."""
import random
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from cad_sim import gini, aging_class

BLUE, ORANGE, AQUA, VIOLET = "#2a78d6", "#eb6834", "#1baf7a", "#6250d6"
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e6e5e0", "#fcfcfb"
plt.rcParams.update({
    "figure.facecolor": SURF, "axes.facecolor": SURF, "axes.edgecolor": GRID,
    "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False,
    "font.size": 11, "axes.titlesize": 13, "axes.titleweight": "bold",
    "axes.titlecolor": INK, "legend.frameon": False,
})
AGES = ["20s", "30s", "40s", "50s", "60s+"]

df = pd.read_csv("simulation_log.csv.gz")
fin = df[df["round"] == 5].copy()
fin["aging"] = fin.HC.apply(aging_class)

def save(fig, name):
    fig.tight_layout(); fig.savefig(name, dpi=180); plt.close(fig)

# 1. Gini by round: CAD on vs off, original rules vs tuned
fig, ax = plt.subplots(figsize=(7.5, 4.6))
series = [("A_identical_mixed", "Rules as written, CAD on", BLUE, "-"),
          ("C_identical_mixed_noCAD", "Rules as written, CAD off", BLUE, "--"),
          ("T_identical_mixed", "Tuned rules, CAD on", ORANGE, "-"),
          ("T_identical_mixed_noCAD", "Tuned rules, CAD off", ORANGE, "--")]
for cond, lab, col, ls in series:
    g = df[df.condition == cond].groupby("round").total.apply(gini)
    ax.plot(range(1, 6), g.values, ls, color=col, lw=2, marker="o", ms=7, label=lab)
ax.set_xticks(range(1, 6), AGES); ax.set_ylim(0, None)
ax.set_ylabel("Gini coefficient of total capital")
ax.set_title("Inequality rises every decade from identical starts")
ax.legend(loc="upper left", fontsize=9)
save(fig, "chart1_gini_by_decade.png")

# 2. Trajectory fan (tuned, differentiated starts)
d = df[df.condition == "T_differentiated_mixed"]
keys = d[["game", "player"]].drop_duplicates().sample(90, random_state=3)
fig, ax = plt.subplots(figsize=(7.5, 4.8))
cols = {"advantaged": BLUE, "middle": AQUA, "disadvantaged": ORANGE}
for _, k in keys.iterrows():
    t = d[(d.game == k.game) & (d.player == k.player)].sort_values("round")
    start = t.EC_before.iloc[0] + t.HC_before.iloc[0] + t.SC_before.iloc[0]
    ys = [start] + t.total.tolist()
    ax.plot(range(0, 6), ys, color=cols[t.group.iloc[0]], lw=1, alpha=0.35)
for grp, col in cols.items():
    m = d[d.group == grp].groupby("round").total.mean()
    st = {"advantaged": 36, "middle": 30, "disadvantaged": 24}[grp]
    ax.plot(range(0, 6), [st] + m.tolist(), color=col, lw=3, label=f"{grp} (mean)")
ax.set_xticks(range(0, 6), ["Start"] + AGES)
ax.set_ylabel("Total capital (EC + HC + SC)")
ax.set_title("Starting gaps widen: 90 sampled life-courses")
ax.legend(loc="upper left", fontsize=9)
save(fig, "chart2_trajectory_fan.png")

# 3. Final total by starting group vs starting gap
fig, ax = plt.subplots(figsize=(7, 4.4))
order = ["disadvantaged", "middle", "advantaged"]
starts = [24, 30, 36]
finals = [fin[(fin.condition == "T_differentiated_mixed") & (fin.group == g)].total.mean() for g in order]
x = np.arange(3); w = 0.36
b1 = ax.bar(x - w/2 - 0.01, starts, w, color=INK2, alpha=0.35, label="Start of game")
b2 = ax.bar(x + w/2 + 0.01, finals, w, color=BLUE, label="End of game (60s+)")
for b in list(b1) + list(b2):
    ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.6, f"{b.get_height():.0f}",
            ha="center", color=INK, fontsize=10)
ax.set_xticks(x, [o.capitalize() for o in order]); ax.set_ylabel("Mean total capital")
ax.set_title(f"A 12-point start gap becomes a {finals[2]-finals[0]:.0f}-point end gap")
ax.legend(loc="upper left", fontsize=9)
save(fig, "chart3_start_vs_end_gap.png")

# 4. Aging classification, original vs tuned
fig, ax = plt.subplots(figsize=(7.5, 3.6))
conds = [("A_identical_mixed", "Rules as written"), ("T_identical_mixed", "Tuned rules"),
         ("T_differentiated_mixed", "Tuned, unequal starts")]
cats = [("Optimal", AQUA), ("Usual", BLUE), ("Pathological", ORANGE)]
for i, (c, lab) in enumerate(conds):
    share = fin[fin.condition == c].aging.value_counts(normalize=True) * 100
    left = 0
    for cat, col in cats:
        v = share.get(cat, 0)
        ax.barh(i, v, left=left, color=col, edgecolor=SURF, linewidth=2,
                label=cat if i == 0 else None)
        if v > 6:
            ax.text(left + v/2, i, f"{v:.0f}%", ha="center", va="center", color="white", fontsize=10, fontweight="bold")
        left += v
ax.set_yticks(range(3), [l for _, l in conds]); ax.invert_yaxis()
ax.set_xlim(0, 100); ax.set_xlabel("% of players by health-based ageing class at 60s+")
ax.set_title("How players age")
ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.55), ncol=3, fontsize=9)
ax.grid(axis="y", visible=False)
save(fig, "chart4_ageing_classes.png")

# Summary tables -------------------------------------------------------------
rows = []
for cond, g in fin.groupby("condition"):
    rows.append({
        "condition": cond, "players": len(g),
        "mean_total": g.total.mean(), "mean_EC": g.EC.mean(), "mean_HC": g.HC.mean(), "mean_SC": g.SC.mean(),
        "gini_final": gini(g.total),
        "mean_within_game_spread": g.groupby("game").total.agg(lambda x: x.max() - x.min()).mean(),
        "pct_optimal": (g.aging == "Optimal").mean() * 100,
        "pct_usual": (g.aging == "Usual").mean() * 100,
        "pct_pathological": (g.aging == "Pathological").mean() * 100,
        "pct_bare_coping_r5": g.bare_coping.mean() * 100,
    })
pd.DataFrame(rows).round(2).to_csv("summary_by_condition.csv", index=False)

strat = df[df.policy != "random"]
ch = strat.groupby(["condition", "event", "choice"]).size().rename("n").reset_index()
ch["pct_of_event"] = ch.n / ch.groupby(["condition", "event"]).n.transform("sum") * 100
ch[ch.condition.isin(["A_identical_mixed", "T_identical_mixed"])].round(1).to_csv("choice_frequencies.csv", index=False)
print("charts + tables written")
