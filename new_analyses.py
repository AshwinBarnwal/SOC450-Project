"""Four additional analyses from simulation_log.csv.gz (run cad_sim.py first)."""
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from cad_sim import gini

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

df = pd.read_csv("simulation_log.csv.gz")

def save(fig, name):
    fig.tight_layout(); fig.savefig(name, dpi=180); plt.close(fig)

# ═══════════════════════════════════════════════════════════════
# 1. MOBILITY MATRIX (Heatmap)
# ═══════════════════════════════════════════════════════════════
print("1. Computing mobility matrix...")
cond = "T_differentiated_mixed"
d = df[df.condition == cond]
r1 = d[d["round"] == 1][["game","player","total"]].rename(columns={"total":"total_r1"})
r5 = d[d["round"] == 5][["game","player","total"]].rename(columns={"total":"total_r5"})
merged = r1.merge(r5, on=["game","player"])
merged["tercile_r1"] = pd.qcut(merged.total_r1, 3, labels=["Bottom","Middle","Top"])
merged["tercile_r5"] = pd.qcut(merged.total_r5, 3, labels=["Bottom","Middle","Top"])
mob = pd.crosstab(merged.tercile_r1, merged.tercile_r5, normalize="index") * 100

fig, ax = plt.subplots(figsize=(6.5, 5))
labels = ["Bottom", "Middle", "Top"]
mat = mob.reindex(index=labels, columns=labels).values
cmap = LinearSegmentedColormap.from_list("wb", ["#ffffff", BLUE])
im = ax.imshow(mat, cmap=cmap, vmin=0, vmax=80, aspect="auto")
ax.set_xticks(range(3)); ax.set_xticklabels(labels)
ax.set_yticks(range(3)); ax.set_yticklabels(labels)
ax.set_xlabel("Position at 60s+ (end)", fontsize=12)
ax.set_ylabel("Position at 20s (start)", fontsize=12)
ax.set_title("Social Mobility Matrix: where you start is where you stay")
for i in range(3):
    for j in range(3):
        v = mat[i, j]
        color = "white" if v > 50 else INK
        ax.text(j, i, f"{v:.0f}%", ha="center", va="center",
                fontsize=16, fontweight="bold", color=color)
ax.grid(False)
fig.colorbar(im, ax=ax, label="% of players", shrink=0.8)
save(fig, "chart5_mobility_matrix.png")
print("   Saved chart5_mobility_matrix.png")
print(f"   Bottom→Bottom: {mat[0,0]:.0f}%, Top→Top: {mat[2,2]:.0f}%")

# ═══════════════════════════════════════════════════════════════
# 2. VARIANCE DECOMPOSITION (ANOVA)
# ═══════════════════════════════════════════════════════════════
print("\n2. Running variance decomposition...")
from numpy.linalg import lstsq

fin = d[d["round"] == 5].copy()
y = fin.total.values
ss_total = ((y - y.mean())**2).sum()

# R² for starting group alone
X_g = pd.get_dummies(fin[["group"]], drop_first=True).astype(float)
X_g.insert(0, "intercept", 1.0)
coefs, _, _, _ = lstsq(X_g.values, y, rcond=None)
r2_group = ((X_g.values @ coefs - y.mean())**2).sum() / ss_total

# R² for strategy alone
X_p = pd.get_dummies(fin[["policy"]], drop_first=True).astype(float)
X_p.insert(0, "intercept", 1.0)
coefs, _, _, _ = lstsq(X_p.values, y, rcond=None)
r2_policy = ((X_p.values @ coefs - y.mean())**2).sum() / ss_total

# R² for both together
X_both = pd.get_dummies(fin[["group","policy"]], drop_first=True).astype(float)
X_both.insert(0, "intercept", 1.0)
coefs, _, _, _ = lstsq(X_both.values, y, rcond=None)
r2_both = ((X_both.values @ coefs - y.mean())**2).sum() / ss_total

r2_interaction = r2_both - r2_group - r2_policy
r2_residual = 1 - r2_both

print(f"   Starting group: {r2_group*100:.1f}%")
print(f"   Strategy:       {r2_policy*100:.1f}%")
print(f"   Interaction:    {r2_interaction*100:.1f}%")
print(f"   Luck/events:    {r2_residual*100:.1f}%")

# Chart
fig, ax = plt.subplots(figsize=(7, 4))
components = ["Starting\nGroup", "Strategy", "Interaction\nEffect", "Luck\n(Events)"]
values = [r2_group*100, r2_policy*100, r2_interaction*100, r2_residual*100]
colors = [ORANGE, AQUA, VIOLET, INK2]
alphas = [1.0, 1.0, 1.0, 0.35]
bars = ax.barh(range(4), values, color=colors, edgecolor=SURF, linewidth=2)
for b, a in zip(bars, alphas):
    b.set_alpha(a)
for i, (bar, v) in enumerate(zip(bars, values)):
    ax.text(bar.get_width() + 1, i, f"{v:.1f}%", va="center", fontsize=12,
            fontweight="bold", color=INK)
ax.set_yticks(range(4)); ax.set_yticklabels(components)
ax.set_xlim(0, 60)
ax.set_xlabel("% of variance in final total capital explained")
ax.set_title("Structure vs Agency vs Luck: what determines your outcome?")
ax.invert_yaxis()
ax.grid(axis="y", visible=False)
save(fig, "chart6_variance_decomposition.png")
print("   Saved chart6_variance_decomposition.png")

# ═══════════════════════════════════════════════════════════════
# 3. POVERTY TRAP / THRESHOLD ANALYSIS
# ═══════════════════════════════════════════════════════════════
print("\n3. Analysing poverty traps...")
poverty_line = 20

# Poverty rate by starting group
fin_diff = df[(df.condition == "T_differentiated_mixed") & (df["round"] == 5)]
pov_by_group = {}
for grp in ["disadvantaged", "middle", "advantaged"]:
    g = fin_diff[fin_diff.group == grp]
    pov_by_group[grp] = (g.total <= poverty_line).mean() * 100
    print(f"   {grp:15s}: {pov_by_group[grp]:.1f}% below poverty line")

# Bare coping trap
ever_bc = d[d.bare_coping == True][["game","player"]].drop_duplicates()
ever_bc_set = set(zip(ever_bc.game, ever_bc.player))
fin2 = d[d["round"] == 5].copy()
fin2["ever_bare_coping"] = [((g,p) in ever_bc_set) for g,p in zip(fin2.game, fin2.player)]

bc_yes = fin2[fin2.ever_bare_coping].total
bc_no = fin2[~fin2.ever_bare_coping].total
print(f"\n   Bare coping trap:")
print(f"   Hit BC at least once: mean={bc_yes.mean():.1f}, poverty={( bc_yes <= poverty_line).mean()*100:.1f}%")
print(f"   Never hit BC:         mean={bc_no.mean():.1f}, poverty={(bc_no <= poverty_line).mean()*100:.1f}%")

# Recovery from bare coping at round 3
bc_r3 = d[(d["round"] == 3) & (d.bare_coping == True)][["game","player"]]
r5_data = d[d["round"] == 5][["game","player","total","bare_coping"]]
bc_r3_fin = bc_r3.merge(r5_data, on=["game","player"])
recovery = (bc_r3_fin.total > poverty_line).mean() * 100
still_bc = bc_r3_fin.bare_coping.mean() * 100
print(f"   In BC at round 3 → still in BC at round 5: {still_bc:.1f}%")

# Chart
fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))

ax = axes[0]
groups = ["Disadvantaged", "Middle", "Advantaged"]
pov_rates = [pov_by_group["disadvantaged"], pov_by_group["middle"], pov_by_group["advantaged"]]
cols = [ORANGE, AQUA, BLUE]
bars = ax.bar(range(3), pov_rates, color=cols, width=0.6, edgecolor=SURF, linewidth=2)
for b, v in zip(bars, pov_rates):
    ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.8, f"{v:.1f}%",
            ha="center", fontsize=12, fontweight="bold", color=INK)
ax.set_xticks(range(3)); ax.set_xticklabels(groups)
ax.set_ylabel("% ending below poverty line (total ≤ 20)")
ax.set_title("Poverty rate by starting group")
ax.set_ylim(0, 35)

ax = axes[1]
cats = ["Hit bare\ncoping", "Never hit\nbare coping"]
means = [bc_yes.mean(), bc_no.mean()]
pov = [(bc_yes <= poverty_line).mean()*100, (bc_no <= poverty_line).mean()*100]
x = np.arange(2); w = 0.35
b1 = ax.bar(x - w/2 - 0.02, means, w, color=BLUE, label="Mean final capital")
b2 = ax.bar(x + w/2 + 0.02, pov, w, color=ORANGE, label="% in poverty")
for b in list(b1) + list(b2):
    ax.text(b.get_x() + b.get_width()/2, b.get_height() + 0.8,
            f"{b.get_height():.1f}", ha="center", fontsize=10, fontweight="bold", color=INK)
ax.set_xticks(x); ax.set_xticklabels(cats)
ax.set_title("The bare-coping trap")
ax.legend(loc="upper right", fontsize=9)
ax.set_ylim(0, 58)
save(fig, "chart7_poverty_trap.png")
print("   Saved chart7_poverty_trap.png")

# ═══════════════════════════════════════════════════════════════
# 4. CAPITAL CORRELATION OVER TIME (Path Dependence)
# ═══════════════════════════════════════════════════════════════
print("\n4. Computing path-dependence correlations...")

# Differentiated starts
piv_diff = d.pivot_table(index=["game","player"], columns="round", values="total")
corr_diff = [1.0] + [piv_diff[1].corr(piv_diff[r]) for r in [2,3,4,5]]

# Identical starts
d_id = df[df.condition == "T_identical_mixed"]
piv_id = d_id.pivot_table(index=["game","player"], columns="round", values="total")
corr_id = [1.0] + [piv_id[1].corr(piv_id[r]) for r in [2,3,4,5]]

print("   Differentiated starts — r(round 1, round 5):", f"{corr_diff[-1]:.3f}")
print("   Identical starts     — r(round 1, round 5):", f"{corr_id[-1]:.3f}")

# Capital-specific
for cap in ["EC", "HC", "SC"]:
    piv_cap = d.pivot_table(index=["game","player"], columns="round", values=cap)
    corr = piv_cap[1].corr(piv_cap[5])
    print(f"   {cap} r(1,5) = {corr:.3f}")

# Chart
fig, ax = plt.subplots(figsize=(7.5, 4.6))
ages = ["20s", "30s", "40s", "50s", "60s+"]
ax.plot(range(5), corr_diff, "-o", color=ORANGE, lw=2.5, ms=8, label="Unequal starts")
ax.plot(range(5), corr_id, "-s", color=BLUE, lw=2.5, ms=8, label="Equal starts")
ax.annotate(f"r = {corr_diff[-1]:.2f}", (4, corr_diff[-1]), textcoords="offset points",
            xytext=(10, 5), fontsize=10, color=ORANGE, fontweight="bold")
ax.annotate(f"r = {corr_id[-1]:.2f}", (4, corr_id[-1]), textcoords="offset points",
            xytext=(10, -12), fontsize=10, color=BLUE, fontweight="bold")
ax.set_xticks(range(5)); ax.set_xticklabels(ages)
ax.set_ylabel("Correlation with round-1 capital (r)")
ax.set_ylim(0.5, 1.05)
ax.set_title("Path dependence: early position predicts late position")
ax.legend(loc="lower left", fontsize=10)
ax.axhline(0.7, ls=":", color=INK2, alpha=0.5, lw=1)
ax.text(0.1, 0.71, "Strong correlation threshold (r = 0.7)", fontsize=8, color=INK2)
save(fig, "chart8_path_dependence.png")
print("   Saved chart8_path_dependence.png")

print("\n✓ All 4 analyses complete. Charts saved.")
