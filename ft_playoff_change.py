from __future__ import annotations

import argparse
import io
import re
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests
from bs4 import BeautifulSoup, Comment


BASE_URL = "https://www.basketball-reference.com"
OUTPUT_DIR = Path("output")
PAGE_CACHE: dict[str, str] = {}


def season_label(season: int) -> str:
    return f"{season - 1}-{str(season)[-2:]}"


def read_bref_table(url: str, table_id: str) -> pd.DataFrame:
    """Read a Basketball Reference table, including tables hidden in HTML comments."""
    soup = get_page_soup(url)
    table = find_table_tag(soup, table_id)
    if table is None:
        raise ValueError(f"Could not find table '{table_id}' at {url}")

    frame = pd.read_html(io.StringIO(str(table)))[0]
    frame = frame[frame["Rk"].astype(str) != "Rk"].copy()
    return frame


def get_page_soup(url: str) -> BeautifulSoup:
    if url not in PAGE_CACHE:
        response = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 ft-playoff-change/1.0"},
            timeout=30,
        )
        response.raise_for_status()
        PAGE_CACHE[url] = response.text
    return BeautifulSoup(PAGE_CACHE[url], "html.parser")


def find_table_tag(soup: BeautifulSoup, table_id: str):
    table = soup.find("table", id=table_id)
    if table is None:
        for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
            if table_id in comment:
                comment_soup = BeautifulSoup(comment, "html.parser")
                table = comment_soup.find("table", id=table_id)
                if table is not None:
                    break
    return table


def read_team_totals_table(url: str, table_id: str, season: int) -> pd.DataFrame:
    soup = get_page_soup(url)
    table = find_table_tag(soup, table_id)
    if table is None:
        raise ValueError(f"Could not find table '{table_id}' at {url}")

    frame = pd.read_html(io.StringIO(str(table)))[0]
    frame = frame[frame["Rk"].astype(str) != "Rk"].copy()
    frame = frame.rename(columns={"Tm": "Team"})
    if "Team" in frame.columns:
        frame = frame[frame["Team"].astype(str) != "League Average"].copy()

    tbody = table.find("tbody")
    if tbody is None:
        raise ValueError(f"Missing tbody for table '{table_id}' at {url}")

    team_rows = []
    for tr in tbody.find_all("tr"):
        if "thead" in (tr.get("class") or []):
            continue
        team_cell = tr.find(["th", "td"], attrs={"data-stat": re.compile(r"^team(_name)?$")})
        if team_cell is None:
            continue
        link = team_cell.find("a")
        if link is None:
            continue
        href = link.get("href", "")
        match = re.search(r"/teams/([A-Z0-9]+)/", href)
        team_rows.append(
            {
                "team_name": link.get_text(strip=True),
                "team_abbr": match.group(1) if match else None,
            }
        )

    if len(team_rows) != len(frame):
        raise ValueError(f"Team row metadata mismatch for table '{table_id}' at {url}")

    frame["team_name"] = [row["team_name"] for row in team_rows]
    frame["team_abbr"] = [row["team_abbr"] for row in team_rows]
    return clean_team_totals_table(frame, season)


def clean_player_table(frame: pd.DataFrame, season: int, season_type: str) -> pd.DataFrame:
    frame = frame.rename(columns={"Tm": "Team"})
    keep = ["Player", "Age", "Team", "Pos", "G", "MP", "FGA", "FTA"]
    missing = [column for column in keep if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing expected columns: {missing}")

    cleaned = frame[keep].copy()
    cleaned = cleaned.rename(
        columns={
            "Team": "team",
            "Player": "player",
            "Age": "age",
            "Pos": "pos",
            "G": "games",
            "MP": "mp_per_g",
            "FGA": "fga_per_g",
            "FTA": "fta_per_g",
        }
    )
    cleaned["season"] = season
    cleaned["season_label"] = season_label(season)
    cleaned["season_type"] = season_type

    for column in ["age", "games", "mp_per_g", "fga_per_g", "fta_per_g"]:
        cleaned[column] = pd.to_numeric(cleaned[column], errors="coerce")

    cleaned["player"] = cleaned["player"].str.replace("*", "", regex=False)
    cleaned = cleaned.dropna(subset=["team", "player", "fta_per_g"])
    cleaned = cleaned[~cleaned["team"].isin(["TOT", "2TM", "3TM", "4TM", "5TM"])].copy()
    cleaned["fta_rate"] = cleaned["fta_per_g"] / cleaned["fga_per_g"].replace(0, pd.NA)
    return cleaned


def clean_total_table(frame: pd.DataFrame, season: int, season_type: str) -> pd.DataFrame:
    frame = frame.rename(columns={"Tm": "Team"})
    keep = ["Player", "Team", "FGA", "FTA"]
    missing = [column for column in keep if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing expected total columns: {missing}")

    cleaned = frame[keep].copy()
    cleaned = cleaned.rename(
        columns={
            "Team": "team",
            "Player": "player",
            "FGA": "fga_total",
            "FTA": "fta_total",
        }
    )
    cleaned["season"] = season
    cleaned["season_label"] = season_label(season)
    cleaned["season_type"] = season_type

    for column in ["fga_total", "fta_total"]:
        cleaned[column] = pd.to_numeric(cleaned[column], errors="coerce")

    cleaned["player"] = cleaned["player"].str.replace("*", "", regex=False)
    cleaned = cleaned.dropna(subset=["team", "player", "fta_total"])
    cleaned = cleaned[~cleaned["team"].isin(["TOT", "2TM", "3TM", "4TM", "5TM"])].copy()
    return cleaned


def attach_totals(per_game: pd.DataFrame, totals: pd.DataFrame) -> pd.DataFrame:
    return per_game.merge(
        totals[["season", "season_label", "team", "player", "fga_total", "fta_total"]],
        on=["season", "season_label", "team", "player"],
        how="left",
    )


def fetch_season(season: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    regular_per_game_url = f"{BASE_URL}/leagues/NBA_{season}_per_game.html"
    regular_totals_url = f"{BASE_URL}/leagues/NBA_{season}_totals.html"
    playoff_per_game_url = f"{BASE_URL}/playoffs/NBA_{season}_per_game.html"
    playoff_totals_url = f"{BASE_URL}/playoffs/NBA_{season}_totals.html"

    regular = attach_totals(
        clean_player_table(read_bref_table(regular_per_game_url, "per_game_stats"), season, "regular"),
        clean_total_table(read_bref_table(regular_totals_url, "totals_stats"), season, "regular"),
    )
    playoffs = attach_totals(
        clean_player_table(read_bref_table(playoff_per_game_url, "per_game_stats"), season, "playoffs"),
        clean_total_table(read_bref_table(playoff_totals_url, "totals_stats"), season, "playoffs"),
    )
    return regular, playoffs


def pct_change(playoff_value: pd.Series, regular_value: pd.Series) -> pd.Series:
    return (playoff_value - regular_value) / regular_value.replace(0, pd.NA)


def clean_team_totals_table(frame: pd.DataFrame, season: int) -> pd.DataFrame:
    keep = ["team_name", "team_abbr", "G", "FGA", "FTA"]
    missing = [column for column in keep if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing expected team total columns: {missing}")

    cleaned = frame[keep].copy()
    cleaned = cleaned.rename(
        columns={
            "G": "games",
            "FGA": "fga_total",
            "FTA": "fta_total",
        }
    )
    cleaned["season"] = season
    for column in ["games", "fga_total", "fta_total"]:
        cleaned[column] = pd.to_numeric(cleaned[column], errors="coerce")
    cleaned["ft_rate"] = cleaned["fta_total"] / cleaned["fga_total"].replace(0, pd.NA)
    return cleaned


def fetch_team_rate_summary(season: int) -> pd.DataFrame:
    playoff_url = f"{BASE_URL}/playoffs/NBA_{season}.html"
    regular_url = f"{BASE_URL}/leagues/NBA_{season}.html"

    regular_team_totals = read_team_totals_table(regular_url, "totals-team", season)
    regular_opp_totals = read_team_totals_table(regular_url, "totals-opponent", season)
    playoff_team_totals = read_team_totals_table(playoff_url, "totals-team", season)
    playoff_opp_totals = read_team_totals_table(playoff_url, "totals-opponent", season)

    summary = playoff_team_totals[
        ["season", "team_name", "team_abbr", "games", "ft_rate"]
    ].rename(
        columns={
            "games": "playoff_games",
            "ft_rate": "po_ft_rate",
        }
    )
    summary = summary[summary["playoff_games"] > 0].copy()
    summary["season_label"] = season_label(season)
    summary = summary.merge(
        regular_team_totals[["team_abbr", "ft_rate"]].rename(columns={"ft_rate": "reg_ft_rate"}),
        on="team_abbr",
        how="left",
    )
    summary = summary.merge(
        regular_opp_totals[["team_abbr", "ft_rate"]].rename(columns={"ft_rate": "reg_ft_rate_allowed"}),
        on="team_abbr",
        how="left",
    )
    summary = summary.merge(
        playoff_opp_totals[["team_abbr", "ft_rate"]].rename(columns={"ft_rate": "po_ft_rate_allowed"}),
        on="team_abbr",
        how="left",
    )
    summary["ft_rate_change"] = summary["po_ft_rate"] - summary["reg_ft_rate"]
    summary["ft_rate_allowed_change"] = summary["po_ft_rate_allowed"] - summary["reg_ft_rate_allowed"]
    summary["net_ft_rate_swing"] = summary["ft_rate_change"] - summary["ft_rate_allowed_change"]
    return summary.sort_values("team_abbr").reset_index(drop=True)


def fetch_champion_run(season: int) -> dict[str, object]:
    playoff_url = f"{BASE_URL}/playoffs/NBA_{season}.html"
    regular_url = f"{BASE_URL}/leagues/NBA_{season}.html"

    playoff_soup = get_page_soup(playoff_url)
    champion_anchor = playoff_soup.select_one("p strong:-soup-contains('League Champion')")
    if champion_anchor is None or champion_anchor.parent.find("a") is None:
        raise ValueError(f"Could not find champion on {playoff_url}")

    champion_link = champion_anchor.parent.find("a")
    champion_name = champion_link.get_text(strip=True)
    champion_abbr_match = re.search(r"/teams/([A-Z0-9]+)/", champion_link.get("href", ""))
    if champion_abbr_match is None:
        raise ValueError(f"Could not parse champion abbreviation for {season}")
    champion_abbr = champion_abbr_match.group(1)

    playoff_html = PAGE_CACHE[playoff_url]
    series_pattern = re.compile(
        rf"<td><a href='/teams/([A-Z0-9]+)/{season}\.html'>([^<]+)</a>\s*over\s*"
        rf"<a href='/teams/([A-Z0-9]+)/{season}\.html'>([^<]+)</a>\s*&nbsp;\((\d+)-(\d+)\)",
        re.S,
    )
    opponents: list[dict[str, object]] = []
    for winner_abbr, winner_name, loser_abbr, loser_name, wins, losses in series_pattern.findall(playoff_html):
        if winner_abbr != champion_abbr:
            continue
        opponents.append(
            {
                "opponent_abbr": loser_abbr,
                "opponent_name": loser_name,
                "series_games": int(wins) + int(losses),
            }
        )

    regular_team_totals = read_team_totals_table(regular_url, "totals-team", season)
    regular_opp_totals = read_team_totals_table(regular_url, "totals-opponent", season)
    playoff_team_totals = read_team_totals_table(playoff_url, "totals-team", season)
    playoff_opp_totals = read_team_totals_table(playoff_url, "totals-opponent", season)

    champion_regular = regular_team_totals.loc[regular_team_totals["team_abbr"] == champion_abbr]
    champion_playoff = playoff_team_totals.loc[playoff_team_totals["team_abbr"] == champion_abbr]
    champion_opp_playoff = playoff_opp_totals.loc[playoff_opp_totals["team_abbr"] == champion_abbr]
    if champion_regular.empty or champion_playoff.empty or champion_opp_playoff.empty:
        raise ValueError(f"Missing champion team rows for {season}")

    opponent_regular_rows = regular_team_totals.loc[
        regular_team_totals["team_abbr"].isin([entry["opponent_abbr"] for entry in opponents])
    ].copy()
    series_games_lookup = {entry["opponent_abbr"]: entry["series_games"] for entry in opponents}
    opponent_regular_rows["series_games"] = opponent_regular_rows["team_abbr"].map(series_games_lookup)
    opponent_regular_allowed_rows = regular_opp_totals.loc[
        regular_opp_totals["team_abbr"].isin([entry["opponent_abbr"] for entry in opponents])
    ].copy()
    opponent_regular_allowed_rows["series_games"] = opponent_regular_allowed_rows["team_abbr"].map(series_games_lookup)

    weighted_opp_reg_ft_rate = (
        (opponent_regular_rows["ft_rate"] * opponent_regular_rows["series_games"]).sum()
        / opponent_regular_rows["series_games"].sum()
    )
    weighted_opp_reg_ft_rate_allowed = (
        (opponent_regular_allowed_rows["ft_rate"] * opponent_regular_allowed_rows["series_games"]).sum()
        / opponent_regular_allowed_rows["series_games"].sum()
    )

    champion_regular_row = champion_regular.iloc[0]
    champion_playoff_row = champion_playoff.iloc[0]
    champion_opp_playoff_row = champion_opp_playoff.iloc[0]
    champion_regular_allowed_row = regular_opp_totals.loc[regular_opp_totals["team_abbr"] == champion_abbr].iloc[0]

    team_ft_rate_change = champion_playoff_row["ft_rate"] - champion_regular_row["ft_rate"]
    opp_ft_rate_change = champion_opp_playoff_row["ft_rate"] - weighted_opp_reg_ft_rate
    opp_matchup_swing = champion_opp_playoff_row["ft_rate"] - champion_regular_allowed_row["ft_rate"]
    net_ft_rate_edge = team_ft_rate_change - opp_matchup_swing

    return {
        "season": season,
        "season_label": season_label(season),
        "champion": champion_name,
        "champion_abbr": champion_abbr,
        "opponents": ", ".join(entry["opponent_abbr"] for entry in opponents),
        "playoff_games": champion_playoff_row["games"],
        "series_count": len(opponents),
        "team_reg_ft_rate": champion_regular_row["ft_rate"],
        "team_po_ft_rate": champion_playoff_row["ft_rate"],
        "team_ft_rate_change": team_ft_rate_change,
        "team_matchup_swing": team_ft_rate_change,
        "opp_reg_ft_rate_weighted": weighted_opp_reg_ft_rate,
        "opp_reg_ft_rate_allowed_weighted": weighted_opp_reg_ft_rate_allowed,
        "opp_po_ft_rate": champion_opp_playoff_row["ft_rate"],
        "opp_ft_rate_change": opp_ft_rate_change,
        "champion_reg_ft_rate_allowed": champion_regular_allowed_row["ft_rate"],
        "opp_matchup_swing": opp_matchup_swing,
        "net_ft_rate_edge": net_ft_rate_edge,
    }


def compare_top_free_throw_getters(season: int, top_n: int, rank_by: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    regular, playoffs = fetch_season(season)
    rank_column = "fta_total" if rank_by == "total" else "fta_per_g"

    top_regular = (
        regular.sort_values(["team", rank_column, "fta_per_g", "fga_per_g", "mp_per_g"], ascending=False)
        .sort_values("team", kind="stable")
        .groupby("team", as_index=False, group_keys=False)
        .head(top_n)
        .copy()
    )
    top_regular["team_fta_rank"] = top_regular.groupby("team")[rank_column].rank(method="first", ascending=False)

    merged = top_regular.merge(
        playoffs,
        on=["season", "season_label", "team", "player"],
        how="left",
        suffixes=("_reg", "_po"),
    )

    merged["made_playoffs"] = merged["games_po"].notna()
    for stat in ["fta_per_g", "fga_per_g", "fta_rate"]:
        merged[f"{stat}_change"] = merged[f"{stat}_po"] - merged[f"{stat}_reg"]
    for stat in ["fta_total", "fga_total"]:
        merged[f"{stat}_change"] = merged[f"{stat}_po"] - merged[f"{stat}_reg"]

    merged["fta_per_g_pct_change"] = pct_change(merged["fta_per_g_po"], merged["fta_per_g_reg"])
    merged["fga_per_g_pct_change"] = pct_change(merged["fga_per_g_po"], merged["fga_per_g_reg"])
    merged["fta_change_minus_fga_change"] = merged["fta_per_g_pct_change"] - merged["fga_per_g_pct_change"]

    merged = merged.rename(
        columns={
            "games_reg": "reg_games",
            "games_po": "po_games",
            "mp_per_g_reg": "reg_mp_per_g",
            "mp_per_g_po": "po_mp_per_g",
            "fga_per_g_reg": "reg_fga_per_g",
            "fga_per_g_po": "po_fga_per_g",
            "fta_per_g_reg": "reg_fta_per_g",
            "fta_per_g_po": "po_fta_per_g",
            "fta_rate_reg": "reg_fta_rate",
            "fta_rate_po": "po_fta_rate",
            "fta_total_reg": "reg_fta_total",
            "fta_total_po": "po_fta_total",
            "fga_total_reg": "reg_fga_total",
            "fga_total_po": "po_fga_total",
            "pos_reg": "pos",
            "age_reg": "age",
        }
    )

    player_columns = [
        "season",
        "season_label",
        "team",
        "team_fta_rank",
        "player",
        "pos",
        "age",
        "reg_games",
        "po_games",
        "made_playoffs",
        "reg_mp_per_g",
        "po_mp_per_g",
        "reg_fta_per_g",
        "po_fta_per_g",
        "fta_per_g_change",
        "fta_per_g_pct_change",
        "reg_fta_total",
        "po_fta_total",
        "fta_total_change",
        "reg_fga_per_g",
        "po_fga_per_g",
        "fga_per_g_change",
        "fga_per_g_pct_change",
        "reg_fga_total",
        "po_fga_total",
        "fga_total_change",
        "reg_fta_rate",
        "po_fta_rate",
        "fta_rate_change",
        "fta_change_minus_fga_change",
    ]
    player_changes = merged[player_columns].sort_values(["season", "team", "team_fta_rank"])

    playoff_only = player_changes[player_changes["made_playoffs"]].copy()
    team_summary = (
        playoff_only.groupby(["season", "season_label", "team"], as_index=False)
        .agg(
            players_tracked=("player", "count"),
            avg_reg_fta_per_g=("reg_fta_per_g", "mean"),
            avg_po_fta_per_g=("po_fta_per_g", "mean"),
            avg_fta_per_g_change=("fta_per_g_change", "mean"),
            avg_fta_per_g_pct_change=("fta_per_g_pct_change", "mean"),
            sum_reg_fta_total=("reg_fta_total", "sum"),
            sum_po_fta_total=("po_fta_total", "sum"),
            avg_reg_fga_per_g=("reg_fga_per_g", "mean"),
            avg_po_fga_per_g=("po_fga_per_g", "mean"),
            avg_fga_per_g_pct_change=("fga_per_g_pct_change", "mean"),
            sum_reg_fga_total=("reg_fga_total", "sum"),
            sum_po_fga_total=("po_fga_total", "sum"),
            avg_fta_rate_change=("fta_rate_change", "mean"),
            avg_fta_change_minus_fga_change=("fta_change_minus_fga_change", "mean"),
        )
        .sort_values(["season", "team"])
    )

    return player_changes, team_summary


def write_outputs(seasons: Iterable[int], top_n: int, rank_by: str) -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    all_players = []
    all_teams = []
    champion_runs = []
    all_team_rates = []

    for season in seasons:
        print(f"Fetching {season_label(season)}...")
        player_changes, team_summary = compare_top_free_throw_getters(season, top_n, rank_by)
        champion_runs.append(fetch_champion_run(season))
        all_team_rates.append(fetch_team_rate_summary(season))
        player_changes.to_csv(OUTPUT_DIR / f"ft_change_{season}.csv", index=False, encoding="utf-8-sig")
        team_summary.to_csv(OUTPUT_DIR / f"team_summary_{season}.csv", index=False, encoding="utf-8-sig")
        all_players.append(player_changes)
        all_teams.append(team_summary)

    pd.concat(all_players, ignore_index=True).to_csv(OUTPUT_DIR / "ft_change_all.csv", index=False, encoding="utf-8-sig")
    pd.concat(all_teams, ignore_index=True).to_csv(OUTPUT_DIR / "team_summary_all.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(champion_runs).to_csv(OUTPUT_DIR / "champion_runs.csv", index=False, encoding="utf-8-sig")
    pd.concat(all_team_rates, ignore_index=True).to_csv(OUTPUT_DIR / "team_rate_summary_all.csv", index=False, encoding="utf-8-sig")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare top regular-season FTA players to playoff FTA changes.")
    parser.add_argument(
        "--seasons",
        nargs="+",
        type=int,
        default=[2025],
        help="Basketball Reference season ending years. Example: 2025 means 2024-25.",
    )
    parser.add_argument("--top-n", type=int, default=5, help="Top regular-season FTA players to track per team.")
    parser.add_argument(
        "--rank-by",
        choices=["total", "per-game"],
        default="total",
        help="Rank each team's top free throw getters by regular-season total FTA or FTA per game.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    write_outputs(args.seasons, args.top_n, args.rank_by)


if __name__ == "__main__":
    main()
