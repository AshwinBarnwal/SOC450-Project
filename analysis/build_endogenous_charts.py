from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "output" / "analysis"
OUT = DATA / "endogenous_charts"
OUT.mkdir(parents=True, exist_ok=True)

BLUE = "#28557F"
RUST = "#B15533"
GREEN = "#4E7963"
GOLD = "#9C7B36"
GRAY = "#858781"
SURFACE = "#F8F6F0"
GRID = "#DEDCD5"
INK = "#1F211E"

plt.rcParams.update({
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK,
    "xtick.color": INK,
    "ytick.color": INK,
    "axes.titlecolor": INK,
    "axes.titleweight": "bold",
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.titlesize": 14,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.color": GRID,
    "grid.linewidth": 0.8,
    "legend.frameon": False,
})


def save(fig, name):
    fig.tight_layout()
    fig.savefig(OUT / name, dpi=220, bbox_inches="tight")
    plt.close(fig)


gini = pd.read_csv(DATA / "gini_by_decade.csv")
fig, ax = plt.subplots(figsize=(7.5, 4.5))
for condition, label, color, style in [
    ("endogenous_feedback-on_equal", "Feedback enabled", RUST, "-"),
    ("endogenous_feedback-off_equal", "Feedback disabled", BLUE, "--"),
]:
    d = gini[gini.condition == condition]
    ax.plot(d.decade, d["mean"], color=color, linestyle=style, marker="o", linewidth=2.5, markersize=6, label=label)
ax.set_ylim(0, 0.20)
ax.set_ylabel("Mean within-game Gini coefficient")
ax.set_xlabel("Life stage")
ax.set_title("Feedback mechanisms increase divergence from equal starts")
ax.legend(loc="upper left")
save(fig, "figure1_gini_feedback.png")


summary = pd.read_csv(DATA / "condition_summary.csv")
unequal = summary[summary.starts == "unequal"].set_index("feedback")
labels = ["Feedback enabled", "Feedback disabled"]
start = [unequal.loc["Enabled", "start_gap"], unequal.loc["Disabled", "start_gap"]]
end = [unequal.loc["Enabled", "end_gap"], unequal.loc["Disabled", "end_gap"]]
x = np.arange(2)
width = 0.34
fig, ax = plt.subplots(figsize=(7.2, 4.3))
b1 = ax.bar(x - width / 2, start, width, color=GRAY, label="Starting gap")
b2 = ax.bar(x + width / 2, end, width, color=[RUST, BLUE], label="Final gap")
for bar in [*b1, *b2]:
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.25, f"{bar.get_height():.1f}", ha="center", fontsize=10)
ax.set_xticks(x, labels)
ax.set_ylim(0, 19)
ax.set_ylabel("Advantaged minus disadvantaged mean capital")
ax.set_title("Feedback turns an initial resource gap into cumulative divergence")
ax.legend(loc="upper right")
save(fig, "figure2_start_end_gap.png")


ageing = pd.read_csv(DATA / "ageing_classification.csv")
d = ageing[ageing.condition == "endogenous_feedback-on_unequal"]
groups = ["Disadvantaged", "Middle", "Advantaged"]
classes = [("Optimal", GREEN), ("Usual", GOLD), ("Pathological", RUST)]
fig, ax = plt.subplots(figsize=(7.4, 4.5))
bottom = np.zeros(3)
for class_name, color in classes:
    values = np.array([
        d[(d.group == group) & (d.ageing_class == class_name)].proportion.iloc[0] * 100
        for group in groups
    ])
    bars = ax.bar(groups, values, bottom=bottom, color=color, label=class_name)
    for index, value in enumerate(values):
        if value >= 6:
            ax.text(index, bottom[index] + value / 2, f"{value:.1f}%", ha="center", va="center", fontsize=9, color="white")
    bottom += values
ax.set_ylim(0, 100)
ax.set_ylabel("Share of simulated lives")
ax.set_title("Ageing outcomes remain strongly patterned by starting position")
ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.22), ncol=3)
ax.grid(axis="x", visible=False)
save(fig, "figure3_ageing_by_start.png")

print(OUT)
