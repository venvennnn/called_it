# Scoring and fair comparisons
Canonical p is the probability of **Yes**, stored as an integer 0–100. Yes 80 → 80, No 80 → 20. Confidence must be an integer 50–100, optionally followed by `%`. Both directions at 50 mean the same uncertainty; No 20 is invalid.

For p expressed on 0–1 and y=1 for Yes or 0 for No:

**BS = (p − y)²**; **Round score = 100 × (1 − BS)**.

The exact squared-error numerator is `(integerProbability − (outcome ? 100 : 0))²`. Only display is rounded. This is the single-probability binary Brier convention, not the sum of both outcome categories.

| Yes probability | Outcome | Score |
|---|---|---|
| 80% | Yes | 96 |
| 80% | No | 36 |
| 90% | No | 19 |
| 20% (No 80) | No | 96 |
| 50% | Either | 75 |
| 100% | No | 0 |
| 100% | Yes | 100 |

Each account has one effective forecast, irrespective of subscriptions, donations, badges, or message volume. Fairness per account does not prove one human per account. A replacement changes confidence; it cannot add weight. Void rounds do not affect means or eligibility. A corrected resolution is a new revision; standings recompute from locked forecasts and the latest revision rather than double-adding points.

Session means are exploratory because viewers may answer different questions. Each session predeclares its first five rounds as a Series. A final series rank needs forecasts on every nonvoid round, at least three nonvoid resolved rounds, and all five slots finished/voided. Incomplete entrants stay visible without final rank. Ties share rank and sharpest-call awards.

The crowd forecast is the equally weighted arithmetic mean, not a validated win probability. No cash-like odds or trade execution. Crowd calibration uses **one locked crowd mean per resolved round**. It never pools correlated viewers as separate crowd outcomes. Display safeguards: at least 20 resolved rounds overall and at least five per visible bin. Calibration does not yet show per-viewer histories or uncertainty intervals, so it must not be used to claim demonstrated calibration superiority.
