# Free Throw Change into Playoffs

Static dashboard and scraper for comparing NBA regular-season free throw behavior to playoff free throw behavior.

The dashboard starts with each team's top regular-season free throw getters, then shows how their playoff free throws per game and free throw rate changed. It also includes team-level playoff FT rate swings and champion-only run summaries.

Basketball Reference season years use the ending year, so `2025` means the `2024-25` NBA season.

## Dashboard

Serve the folder locally:

```powershell
python -m http.server 8787
```

Then open:

```text
http://127.0.0.1:8787/
```

Dashboard tabs:

- `FT Up`: biggest playoff increases in raw FTA/G.
- `FT Down`: biggest playoff decreases in raw FTA/G.
- `Rate Up`: biggest playoff increases in FT rate.
- `Rate Down`: biggest playoff decreases in FT rate.
- `Teams`: team-level playoff FT rate and FT rate allowed changes.
- `Champions`: champion-only run FT rate swing.

## Key Stats

Raw free throw change:

```text
FT Change = Playoff FTA/G - Regular FTA/G
```

Free throw rate:

```text
FT Rate = FTA / FGA
FT Rate Delta = Playoff FT Rate - Regular FT Rate
```

Team net swing:

```text
Net Swing = Team FT Rate Delta - Team FT Rate Allowed Delta
```

Champion net swing:

```text
Team FT Rate Swing = Champion playoff FT Rate - Champion regular FT Rate
Opp FT Rate Swing vs Champ = Opponents playoff FT Rate vs champion - Champion regular FT Rate allowed
Net Swing = Team FT Rate Swing - Opp FT Rate Swing vs Champ
```

## Scraper Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Run The Scraper

Single season:

```powershell
.\.venv\Scripts\python.exe ft_playoff_change.py --seasons 2025
```

Full current dataset:

```powershell
.\.venv\Scripts\python.exe ft_playoff_change.py --seasons 2000 2001 2002 2003 2004 2005 2006 2007 2008 2009 2010 2011 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025
```

Useful options:

```powershell
.\.venv\Scripts\python.exe ft_playoff_change.py --seasons 2025 --top-n 5
.\.venv\Scripts\python.exe ft_playoff_change.py --seasons 2025 --rank-by per-game
```

## Outputs

Outputs are written to `output/`:

- `ft_change_YYYY.csv`: player regular season vs playoff changes for one season.
- `ft_change_all.csv`: all player rows across generated seasons.
- `team_summary_YYYY.csv`: team summary for the selected top regular-season FTA players.
- `team_summary_all.csv`: combined top-player team summaries.
- `team_rate_summary_all.csv`: true team-level FT rate and FT rate allowed summary.
- `champion_runs.csv`: champion-only run summary.

The checked-in dataset currently covers season ending years `2000` through `2025`, meaning `1999-00` through `2024-25`.
