const playerUrl = './output/ft_change_all.csv';
const runUrl = './output/champion_runs.csv';
const teamRateUrl = './output/team_rate_summary_all.csv';

const seasonStart = document.getElementById('season-start');
const seasonEnd = document.getElementById('season-end');
const teamFilter = document.getElementById('team-filter');
const rankFilter = document.getElementById('rank-filter');
const rankFilterWrap = document.getElementById('rank-filter-wrap');
const poGamesFilter = document.getElementById('po-games-filter');
const searchFilter = document.getElementById('search-filter');
const combineFilter = document.getElementById('combine-filter');
const summaryCards = document.getElementById('summary-cards');
const statusBanner = document.getElementById('status-banner');
const explainToggle = document.getElementById('explain-toggle');
const explainPanel = document.getElementById('explain-panel');
const explainTitle = document.getElementById('explain-title');
const explainText1 = document.getElementById('explain-text-1');
const explainText2 = document.getElementById('explain-text-2');
const explainFormulaLabel = document.getElementById('explain-formula-label');
const explainFormula = document.getElementById('explain-formula');
const tabStrip = document.getElementById('tab-strip');

let playerRows = [];
let championRuns = [];
let teamRateRows = [];
let seasonYears = [];
let activeTab = 'risers';
let teamSortDirection = 'desc';
let runSortDirection = 'desc';

function setStatus(message, tone = 'info') {
  if (!message) {
    statusBanner.hidden = true;
    statusBanner.textContent = '';
    statusBanner.removeAttribute('data-tone');
    return;
  }
  statusBanner.textContent = message;
  statusBanner.dataset.tone = tone;
  statusBanner.hidden = false;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''));
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

function repairMojibake(value) {
  if (typeof value !== 'string') return value;
  if (!/[ÃÅÄÐÑØÞæœ]/.test(value)) return value;

  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    return value;
  }
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNum(value, digits = 1) {
  const parsed = num(value);
  if (parsed === null) return '-';
  return parsed.toFixed(digits);
}

function formatPct(value, digits = 1) {
  const parsed = num(value);
  if (parsed === null) return '-';
  return `${(parsed * 100).toFixed(digits)}%`;
}

function signedClass(value) {
  const parsed = num(value);
  return parsed !== null && parsed >= 0 ? 'pos' : 'neg';
}

function populateSelect(selectEl, values, allLabel) {
  const current = selectEl.value;
  selectEl.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = allLabel;
  selectEl.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });

  if ([...selectEl.options].some((option) => option.value === current)) {
    selectEl.value = current;
  }
}

function unique(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
}

function normalizePlayerRows(rows) {
  return rows.map((row) => ({
    ...row,
    player: repairMojibake(row.player),
    season: num(row.season),
    team_fta_rank: num(row.team_fta_rank),
    reg_games: num(row.reg_games),
    po_games: num(row.po_games),
    reg_fta_per_g: num(row.reg_fta_per_g),
    po_fta_per_g: num(row.po_fta_per_g),
    fta_per_g_change: num(row.fta_per_g_change),
    fta_per_g_pct_change: num(row.fta_per_g_pct_change),
    reg_fga_per_g: num(row.reg_fga_per_g),
    po_fga_per_g: num(row.po_fga_per_g),
    fga_per_g_change: num(row.fga_per_g_change),
    fga_per_g_pct_change: num(row.fga_per_g_pct_change),
    reg_fta_rate: num(row.reg_fta_rate),
    po_fta_rate: num(row.po_fta_rate),
    fta_rate_change: num(row.fta_rate_change),
    fta_change_minus_fga_change: num(row.fta_change_minus_fga_change),
    made_playoffs: String(row.made_playoffs).toLowerCase() === 'true',
  })).filter((row) => row.made_playoffs);
}

function normalizeChampionRuns(rows) {
  return rows.map((row) => ({
    ...row,
    season: num(row.season),
    playoff_games: num(row.playoff_games),
    series_count: num(row.series_count),
    team_reg_ft_rate: num(row.team_reg_ft_rate),
    team_po_ft_rate: num(row.team_po_ft_rate),
    team_ft_rate_change: num(row.team_ft_rate_change),
    opp_reg_ft_rate_weighted: num(row.opp_reg_ft_rate_weighted),
    opp_reg_ft_rate_allowed_weighted: num(row.opp_reg_ft_rate_allowed_weighted),
    opp_po_ft_rate: num(row.opp_po_ft_rate),
    opp_ft_rate_change: num(row.opp_ft_rate_change),
    champion_reg_ft_rate_allowed: num(row.champion_reg_ft_rate_allowed),
    opp_matchup_swing: (num(row.opp_po_ft_rate) ?? 0) - (num(row.champion_reg_ft_rate_allowed) ?? 0),
    net_ft_rate_edge: (num(row.team_ft_rate_change) ?? 0) - (((num(row.opp_po_ft_rate) ?? 0) - (num(row.champion_reg_ft_rate_allowed) ?? 0))),
  }));
}

function normalizeTeamRateRows(rows) {
  return rows.map((row) => ({
    ...row,
    season: num(row.season),
    playoff_games: num(row.playoff_games),
    reg_ft_rate: num(row.reg_ft_rate),
    po_ft_rate: num(row.po_ft_rate),
    reg_ft_rate_allowed: num(row.reg_ft_rate_allowed),
    po_ft_rate_allowed: num(row.po_ft_rate_allowed),
    ft_rate_change: num(row.ft_rate_change),
    ft_rate_allowed_change: num(row.ft_rate_allowed_change),
    net_ft_rate_swing: num(row.net_ft_rate_swing),
  })).filter((row) => (row.playoff_games ?? 0) > 0 && row.po_ft_rate !== null && row.po_ft_rate_allowed !== null);
}

function currentSeasonBounds() {
  const rawStart = num(seasonStart.value);
  const rawEnd = num(seasonEnd.value);
  const fallbackStart = seasonYears[0];
  const fallbackEnd = seasonYears[seasonYears.length - 1];
  const start = rawStart ?? fallbackStart;
  const end = rawEnd ?? fallbackEnd;
  return start <= end ? { start, end } : { start: end, end: start };
}

function seasonLabelFromYear(year) {
  return `${year - 1}-${String(year).slice(-2)}`;
}

function selectedSpanLabel() {
  const { start, end } = currentSeasonBounds();
  if (start === end) return String(end);
  return `${String(start).slice(-2)}-${String(end).slice(-2)}`;
}

function compactSeasonLabel(label) {
  if (!label) return '';
  const text = String(label);
  if (/^\d{4}$/.test(text)) return text.slice(-2);
  const match = text.match(/(\d{2})$/);
  return match ? match[1] : text;
}

function compactPlayerName(name) {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((part) => `${part[0]}.`).join(' ');
  return `${initials} ${last}`;
}

function cardPlayer(row, value, formatter = formatNum) {
  if (!row) return '-';
  const fullValue = `${row.player} ${compactSeasonLabel(row.season_label)} (${formatter(value)})`;
  if (fullValue.length <= 24) return fullValue;
  return `${compactPlayerName(row.player)} ${compactSeasonLabel(row.season_label)} (${formatter(value)})`;
}

function cardTeam(row, value) {
  if (!row) return '-';
  return `${row.team_abbr} ${compactSeasonLabel(row.season_label)} (${formatRateDelta(value)})`;
}

function cardChampion(row, value) {
  if (!row) return '-';
  return `${row.champion_abbr} ${compactSeasonLabel(row.season_label)} (${formatRateDelta(value)})`;
}

function formatRateDelta(value) {
  const parsed = num(value);
  if (parsed === null) return '-';
  return `${parsed >= 0 ? '+' : ''}${(parsed * 100).toFixed(1)}`;
}

function formatOpponentPath(value) {
  if (!value) return '-';
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reverse()
    .join(' -> ');
}

function renderExplanation() {
  if (activeTab === 'runs') {
    explainTitle.textContent = 'Champion Runs Explained';
    explainText1.textContent = 'This tab is champions only. Team FT Rate Swing measures how the champion changed its own free-throw rate from regular season to playoffs.';
    explainText2.textContent = 'Opp FT Rate Swing vs Champ measures how often opponents got to the line against that champion in the playoffs compared with what that defense usually allowed in the regular season.';
    explainFormulaLabel.textContent = 'Run Formula';
    explainFormula.textContent = 'Team FT Rate Swing = Champion playoff FT Rate - Champion regular FT Rate\nOpp FT Rate Swing vs Champ = Opponents playoff FT Rate vs champion - Champion regular FT Rate allowed\nNet FT Rate Swing = Team FT Rate Swing - Opp FT Rate Swing vs Champ';
    return;
  }

  if (activeTab === 'teams') {
    explainTitle.textContent = 'Team Summary Explained';
    explainText1.textContent = 'This tab is fully team-level. It compares each team\'s playoff FT rate and playoff FT rate allowed with that same team\'s regular season.';
    explainText2.textContent = 'Positive net swing means the team improved its own foul-drawing environment more than it worsened on the defensive side.';
    explainFormulaLabel.textContent = 'Team Formula';
    explainFormula.textContent = 'FT Rate = FTA / FGA\nFT Rate Delta = Playoff FT Rate - Regular FT Rate\nFT Rate Allowed Delta = Playoff FT Rate Allowed - Regular FT Rate Allowed\nNet FT Rate Swing = FT Rate Delta - FT Rate Allowed Delta';
    return;
  }

  if (activeTab === 'risers-rate' || activeTab === 'droppers-rate') {
    explainTitle.textContent = 'FT Rate Explained';
    explainText1.textContent = 'FT rate means how often a player gets to the line per shot attempt. This is the cleaner foul-drawing stat because it adjusts for shot volume.';
    explainText2.textContent = activeTab === 'risers-rate'
      ? 'Rate Up shows the biggest positive playoff FT rate changes.'
      : 'Rate Down shows the biggest negative playoff FT rate changes.';
    explainFormulaLabel.textContent = 'Rate Formula';
    explainFormula.textContent = 'FT Rate = FTA / FGA\nFT Rate Delta = Playoff FT Rate - Regular FT Rate';
    return;
  }

  explainTitle.textContent = 'FT Change Explained';
  explainText1.textContent = 'These tabs sort by raw free-throw volume. They simply compare playoff free throws per game with regular-season free throws per game.';
  explainText2.textContent = activeTab === 'droppers'
    ? 'FT Down shows the biggest playoff drops in free throws per game.'
    : 'FT Up shows the biggest playoff increases in free throws per game.';
  explainFormulaLabel.textContent = 'Volume Formula';
  explainFormula.textContent = 'FT Change = Playoff FTA/G - Regular FTA/G';
}

function activeRows() {
  const { start, end } = currentSeasonBounds();
  const team = teamFilter.value;
  const maxRank = Number(rankFilter.value || 5);
  const search = searchFilter.value.trim().toLowerCase();

  return playerRows.filter((row) => {
    const matchesSeason = row.season >= start && row.season <= end;
    const matchesTeam = !team || row.team === team;
    const matchesRank = combineFilter.value === 'combined' || (row.team_fta_rank !== null && row.team_fta_rank <= maxRank);
    const matchesSearch = !search || String(row.player).toLowerCase().includes(search);
    return matchesSeason && matchesTeam && matchesRank && matchesSearch;
  });
}

function aggregateRows(rows) {
  if (combineFilter.value !== 'combined') return rows;

  const { start, end } = currentSeasonBounds();
  const groups = new Map();

  rows.forEach((row) => {
    const key = row.player;
    if (!groups.has(key)) {
      groups.set(key, {
        player: row.player,
        teams: new Set(),
        season_label: selectedSpanLabel(),
        season: end,
        team_fta_rank_sum: 0,
        reg_games_sum: 0,
        po_games_sum: 0,
        reg_fta_weighted_sum: 0,
        po_fta_weighted_sum: 0,
        reg_fga_weighted_sum: 0,
        po_fga_weighted_sum: 0,
        reg_fta_rate_weighted_sum: 0,
        po_fta_rate_weighted_sum: 0,
        fta_per_g_pct_change_sum: 0,
        fga_per_g_pct_change_sum: 0,
        fta_change_minus_fga_change_sum: 0,
        seasons_played: 0,
      });
    }

    const group = groups.get(key);
    const regGames = row.reg_games ?? 0;
    const poGames = row.po_games ?? 0;
    group.teams.add(row.team);
    group.team_fta_rank_sum += row.team_fta_rank ?? 0;
    group.reg_games_sum += regGames;
    group.po_games_sum += poGames;
    group.reg_fta_weighted_sum += (row.reg_fta_per_g ?? 0) * regGames;
    group.po_fta_weighted_sum += (row.po_fta_per_g ?? 0) * poGames;
    group.reg_fga_weighted_sum += (row.reg_fga_per_g ?? 0) * regGames;
    group.po_fga_weighted_sum += (row.po_fga_per_g ?? 0) * poGames;
    group.reg_fta_rate_weighted_sum += (row.reg_fta_rate ?? 0) * regGames;
    group.po_fta_rate_weighted_sum += (row.po_fta_rate ?? 0) * poGames;
    group.fta_per_g_pct_change_sum += row.fta_per_g_pct_change ?? 0;
    group.fga_per_g_pct_change_sum += row.fga_per_g_pct_change ?? 0;
    group.fta_change_minus_fga_change_sum += row.fta_change_minus_fga_change ?? 0;
    group.seasons_played += 1;
  });

  return [...groups.values()].map((group) => ({
    player: group.player,
    team: group.teams.size === 1 ? [...group.teams][0] : 'MULTI',
    season_label: group.season_label,
    season: group.season,
    team_fta_rank: group.team_fta_rank_sum / group.seasons_played,
    reg_games: group.reg_games_sum,
    po_games: group.po_games_sum,
    reg_fta_per_g: group.reg_games_sum > 0 ? group.reg_fta_weighted_sum / group.reg_games_sum : null,
    po_fta_per_g: group.po_games_sum > 0 ? group.po_fta_weighted_sum / group.po_games_sum : null,
    fta_per_g_change: (group.po_games_sum > 0 && group.reg_games_sum > 0)
      ? (group.po_fta_weighted_sum / group.po_games_sum) - (group.reg_fta_weighted_sum / group.reg_games_sum)
      : null,
    reg_fga_per_g: group.reg_games_sum > 0 ? group.reg_fga_weighted_sum / group.reg_games_sum : null,
    po_fga_per_g: group.po_games_sum > 0 ? group.po_fga_weighted_sum / group.po_games_sum : null,
    fta_change_minus_fga_change: group.fta_change_minus_fga_change_sum / group.seasons_played,
    fta_rate_change: (group.po_games_sum > 0 && group.reg_games_sum > 0)
      ? (group.po_fta_rate_weighted_sum / group.po_games_sum) - (group.reg_fta_rate_weighted_sum / group.reg_games_sum)
      : null,
    fta_per_g_pct_change: group.fta_per_g_pct_change_sum / group.seasons_played,
    fga_per_g_pct_change: group.fga_per_g_pct_change_sum / group.seasons_played,
    seasons_played: group.seasons_played,
  }));
}

function applyPostAggregationFilters(rows) {
  const minPoGames = Number(poGamesFilter.value || 0);

  return rows.filter((row) => {
    const matchesPoGames = (row.po_games ?? 0) >= minPoGames;
    return matchesPoGames;
  });
}

function computeTeamRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = `${row.season_label}__${row.team}`;
    if (!groups.has(key)) {
      groups.set(key, {
        season: row.season,
        season_label: row.season_label,
        team: row.team,
        players_tracked: 0,
        reg_fta_sum: 0,
        po_fta_sum: 0,
        fta_change_sum: 0,
        fta_rate_change_sum: 0,
        fta_pct_sum: 0,
        fga_pct_sum: 0,
        normalized_sum: 0,
      });
    }

    const group = groups.get(key);
    group.players_tracked += 1;
    group.reg_fta_sum += row.reg_fta_per_g ?? 0;
    group.po_fta_sum += row.po_fta_per_g ?? 0;
    group.fta_change_sum += row.fta_per_g_change ?? 0;
    group.fta_rate_change_sum += row.fta_rate_change ?? 0;
    group.fta_pct_sum += row.fta_per_g_pct_change ?? 0;
    group.fga_pct_sum += row.fga_per_g_pct_change ?? 0;
    group.normalized_sum += row.fta_change_minus_fga_change ?? 0;
  });

  return [...groups.values()].map((group) => ({
    season: group.season,
    season_label: group.season_label,
    team: group.team,
    players_tracked: group.players_tracked,
    avg_reg_fta_per_g: group.reg_fta_sum / group.players_tracked,
    avg_po_fta_per_g: group.po_fta_sum / group.players_tracked,
    avg_fta_per_g_change: group.fta_change_sum / group.players_tracked,
    avg_fta_rate_change: group.fta_rate_change_sum / group.players_tracked,
    avg_fta_per_g_pct_change: group.fta_pct_sum / group.players_tracked,
    avg_fga_per_g_pct_change: group.fga_pct_sum / group.players_tracked,
    avg_fta_change_minus_fga_change: group.normalized_sum / group.players_tracked,
  }));
}

function computeCombinedTeamRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = row.team;
    if (!groups.has(key)) {
      groups.set(key, {
        team: row.team,
        season_label: selectedSpanLabel(),
        seasons_count: 0,
        players_tracked: 0,
        reg_fta_sum: 0,
        po_fta_sum: 0,
        fta_change_sum: 0,
        fta_rate_change_sum: 0,
        fta_pct_sum: 0,
        fga_pct_sum: 0,
        normalized_sum: 0,
      });
    }

    const group = groups.get(key);
    group.seasons_count += 1;
    group.players_tracked += row.players_tracked ?? 0;
    group.reg_fta_sum += row.avg_reg_fta_per_g ?? 0;
    group.po_fta_sum += row.avg_po_fta_per_g ?? 0;
    group.fta_change_sum += row.avg_fta_per_g_change ?? 0;
    group.fta_rate_change_sum += row.avg_fta_rate_change ?? 0;
    group.fta_pct_sum += row.avg_fta_per_g_pct_change ?? 0;
    group.fga_pct_sum += row.avg_fga_per_g_pct_change ?? 0;
    group.normalized_sum += row.avg_fta_change_minus_fga_change ?? 0;
  });

  return [...groups.values()].map((group) => ({
    season_label: group.season_label,
    team: group.team,
    players_tracked: group.players_tracked / group.seasons_count,
    avg_reg_fta_per_g: group.reg_fta_sum / group.seasons_count,
    avg_po_fta_per_g: group.po_fta_sum / group.seasons_count,
    avg_fta_per_g_change: group.fta_change_sum / group.seasons_count,
    avg_fta_rate_change: group.fta_rate_change_sum / group.seasons_count,
    avg_fta_per_g_pct_change: group.fta_pct_sum / group.seasons_count,
    avg_fga_per_g_pct_change: group.fga_pct_sum / group.seasons_count,
    avg_fta_change_minus_fga_change: group.normalized_sum / group.seasons_count,
  }));
}

function currentRunRows() {
  const { start, end } = currentSeasonBounds();
  const team = teamFilter.value;
  return championRuns.filter((row) => {
    const matchesSeason = row.season >= start && row.season <= end;
    const matchesTeam = !team || row.champion_abbr === team;
    return matchesSeason && matchesTeam;
  });
}

function currentTeamRateRows() {
  const { start, end } = currentSeasonBounds();
  const team = teamFilter.value;
  const rows = teamRateRows.filter((row) => {
    const matchesSeason = row.season >= start && row.season <= end;
    const matchesTeam = !team || row.team_abbr === team;
    return matchesSeason && matchesTeam;
  });

  if (combineFilter.value !== 'combined') return rows;

  const groups = new Map();
  rows.forEach((row) => {
    const key = row.team_abbr;
    if (!groups.has(key)) {
      groups.set(key, {
        season_label: selectedSpanLabel(),
        team_abbr: row.team_abbr,
        team_name: row.team_name,
        playoff_games: 0,
        reg_ft_rate_sum: 0,
        po_ft_rate_sum: 0,
        reg_ft_rate_allowed_sum: 0,
        po_ft_rate_allowed_sum: 0,
        ft_rate_change_sum: 0,
        ft_rate_allowed_change_sum: 0,
        net_ft_rate_swing_sum: 0,
        seasons_count: 0,
      });
    }
    const group = groups.get(key);
    group.playoff_games += row.playoff_games ?? 0;
    group.reg_ft_rate_sum += row.reg_ft_rate ?? 0;
    group.po_ft_rate_sum += row.po_ft_rate ?? 0;
    group.reg_ft_rate_allowed_sum += row.reg_ft_rate_allowed ?? 0;
    group.po_ft_rate_allowed_sum += row.po_ft_rate_allowed ?? 0;
    group.ft_rate_change_sum += row.ft_rate_change ?? 0;
    group.ft_rate_allowed_change_sum += row.ft_rate_allowed_change ?? 0;
    group.net_ft_rate_swing_sum += row.net_ft_rate_swing ?? 0;
    group.seasons_count += 1;
  });

  return [...groups.values()].map((group) => ({
    season_label: group.season_label,
    team_abbr: group.team_abbr,
    team_name: group.team_name,
    playoff_games: group.playoff_games,
    reg_ft_rate: group.reg_ft_rate_sum / group.seasons_count,
    po_ft_rate: group.po_ft_rate_sum / group.seasons_count,
    reg_ft_rate_allowed: group.reg_ft_rate_allowed_sum / group.seasons_count,
    po_ft_rate_allowed: group.po_ft_rate_allowed_sum / group.seasons_count,
    ft_rate_change: group.ft_rate_change_sum / group.seasons_count,
    ft_rate_allowed_change: group.ft_rate_allowed_change_sum / group.seasons_count,
    net_ft_rate_swing: group.net_ft_rate_swing_sum / group.seasons_count,
  }));
}

function renderCards(rows) {
  const biggestGain = rows.slice().sort((a, b) => (b.fta_per_g_change ?? -Infinity) - (a.fta_per_g_change ?? -Infinity))[0];
  const biggestDrop = rows.slice().sort((a, b) => (a.fta_per_g_change ?? Infinity) - (b.fta_per_g_change ?? Infinity))[0];
  const biggestNormalized = rows.slice().sort((a, b) => (b.fta_rate_change ?? -Infinity) - (a.fta_rate_change ?? -Infinity))[0];
  const avgChange = rows.reduce((sum, row) => sum + (row.fta_per_g_change ?? 0), 0) / (rows.length || 1);
  const isCombined = combineFilter.value === 'combined';
  const avgRateChange = rows.reduce((sum, row) => sum + (row.fta_rate_change ?? 0), 0) / (rows.length || 1);

  let cards;
  if (activeTab === 'droppers') {
    const rateDown = rows.slice().sort((a, b) => (a.fta_rate_change ?? Infinity) - (b.fta_rate_change ?? Infinity))[0];
    cards = [
      [isCombined ? 'Combined Players' : 'Player Rows', rows.length, isCombined ? 'Players rolled up across the selected season span.' : 'Playoff season rows in the current filters.'],
      ['Avg FT Change', formatNum(avgChange, 2), 'Average playoff minus regular FTA/G.'],
      [
        'Most Down',
        cardPlayer(biggestDrop, biggestDrop?.fta_per_g_change, (value) => formatNum(value, 1)),
        'Largest raw playoff FT decrease.',
      ],
      [
        'Most Up',
        cardPlayer(biggestGain, biggestGain?.fta_per_g_change, (value) => formatNum(value, 1)),
        'Largest raw playoff FT increase.',
      ],
      [
        'Lowest Rate',
        cardPlayer(rateDown, rateDown?.fta_rate_change, formatRateDelta),
        'Lowest playoff FT rate move in the current pool.',
      ],
    ];
  } else if (activeTab === 'risers-rate' || activeTab === 'droppers-rate') {
    const rateDown = rows.slice().sort((a, b) => (a.fta_rate_change ?? Infinity) - (b.fta_rate_change ?? Infinity))[0];
    cards = [
      [isCombined ? 'Combined Players' : 'Player Rows', rows.length, isCombined ? 'Players rolled up across the selected season span.' : 'Playoff season rows in the current filters.'],
      ['Avg FT Rate', formatRateDelta(avgRateChange), 'Average playoff minus regular FT rate.'],
      [
        'Rate Up',
        cardPlayer(biggestNormalized, biggestNormalized?.fta_rate_change, formatRateDelta),
        'Largest playoff FT rate jump.',
      ],
      [
        'Rate Down',
        cardPlayer(rateDown, rateDown?.fta_rate_change, formatRateDelta),
        'Largest playoff FT rate drop.',
      ],
      [
        'Avg FT Change',
        formatNum(avgChange, 2),
        'Average playoff minus regular FTA/G for the same filtered pool.',
      ],
    ];
  } else if (activeTab === 'teams') {
    const teamRows = currentTeamRateRows();
    const bestTeam = teamRows.slice().sort((a, b) => (b.net_ft_rate_swing ?? -Infinity) - (a.net_ft_rate_swing ?? -Infinity))[0];
    const worstTeam = teamRows.slice().sort((a, b) => (a.net_ft_rate_swing ?? Infinity) - (b.net_ft_rate_swing ?? Infinity))[0];
    const bestDefense = teamRows.slice().sort((a, b) => (a.ft_rate_allowed_change ?? Infinity) - (b.ft_rate_allowed_change ?? Infinity))[0];
    const bestOffense = teamRows.slice().sort((a, b) => (b.ft_rate_change ?? -Infinity) - (a.ft_rate_change ?? -Infinity))[0];
    const avgTeamSwing = teamRows.reduce((sum, row) => sum + (row.net_ft_rate_swing ?? 0), 0) / (teamRows.length || 1);
    cards = [
      ['Avg Net Swing', formatRateDelta(avgTeamSwing), 'Average team FT rate swing minus FT rate allowed swing.'],
      [
        'Top Team',
        cardTeam(bestTeam, bestTeam?.net_ft_rate_swing),
        'Largest team-level net FT rate swing.',
      ],
      [
        'Bottom Team',
        cardTeam(worstTeam, worstTeam?.net_ft_rate_swing),
        'Lowest team-level net FT rate swing.',
      ],
      [
        'Best FT Defense',
        cardTeam(bestDefense, bestDefense?.ft_rate_allowed_change),
        'Lowest playoff change in FT rate allowed.',
      ],
      [
        'Best FT Offense',
        cardTeam(bestOffense, bestOffense?.ft_rate_change),
        'Largest playoff change in team FT rate.',
      ],
    ];
  } else if (activeTab === 'runs') {
    const runRows = currentRunRows();
    const bestRun = runRows.slice().sort((a, b) => (b.net_ft_rate_edge ?? -Infinity) - (a.net_ft_rate_edge ?? -Infinity))[0];
    const worstRun = runRows.slice().sort((a, b) => (a.net_ft_rate_edge ?? Infinity) - (b.net_ft_rate_edge ?? Infinity))[0];
    const avgRunSwing = runRows.reduce((sum, row) => sum + (row.net_ft_rate_edge ?? 0), 0) / (runRows.length || 1);
    const bestOpponentControl = runRows.slice().sort((a, b) => (a.opp_matchup_swing ?? Infinity) - (b.opp_matchup_swing ?? Infinity))[0];
    const bestTeamSwing = runRows.slice().sort((a, b) => (b.team_ft_rate_change ?? -Infinity) - (a.team_ft_rate_change ?? -Infinity))[0];
    cards = [
      ['Avg Net Swing', formatRateDelta(avgRunSwing), 'Average champion net FT rate swing in the selected range.'],
      [
        'Best Swing',
        cardChampion(bestRun, bestRun?.net_ft_rate_edge),
        'Largest net FT rate swing among champions.',
      ],
      [
        'Worst Swing',
        cardChampion(worstRun, worstRun?.net_ft_rate_edge),
        'Lowest net FT rate swing among champions.',
      ],
      [
        'Best Opp Control',
        cardChampion(bestOpponentControl, bestOpponentControl?.opp_matchup_swing),
        'Lowest opponent FT rate swing vs champion.',
      ],
      [
        'Best Team Swing',
        cardChampion(bestTeamSwing, bestTeamSwing?.team_ft_rate_change),
        'Largest champion increase in own FT rate.',
      ],
    ];
  } else {
    cards = [
      [isCombined ? 'Combined Players' : 'Player Rows', rows.length, isCombined ? 'Players rolled up across the selected season span.' : 'Playoff season rows in the current filters.'],
      ['Avg FT Change', formatNum(avgChange, 2), 'Average playoff minus regular FTA/G.'],
      [
        'Most Up',
        cardPlayer(biggestGain, biggestGain?.fta_per_g_change, (value) => formatNum(value, 1)),
        'Largest raw playoff FT increase.',
      ],
      [
        'Most Down',
        cardPlayer(biggestDrop, biggestDrop?.fta_per_g_change, (value) => formatNum(value, 1)),
        'Largest raw playoff FT decrease.',
      ],
      [
        'Top Rate Move',
        cardPlayer(biggestNormalized, biggestNormalized?.fta_rate_change, formatRateDelta),
        'Largest playoff FT rate jump.',
      ],
    ];
  }

  summaryCards.innerHTML = cards.map(([label, value, note]) => `
    <article class="card">
      <p class="card-label">${label}</p>
      <p class="card-value">${value}</p>
      <p class="card-note">${note}</p>
    </article>
  `).join('');
}

function renderPlayerTable(tableId, rows, sortKey, direction = 'desc', viewType = 'raw') {
  const table = document.getElementById(tableId);
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const isCombined = combineFilter.value === 'combined';
  const sorted = rows
    .filter((row) => row[sortKey] !== null)
    .slice()
    .sort((a, b) => direction === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey])
    .slice(0, 25);

  thead.innerHTML = viewType === 'rate' ? `
    <tr>
      <th>Season</th>
      <th>Player</th>
      <th>Team</th>
      ${isCombined ? '<th>Matched Seasons</th>' : ''}
      <th>Reg GP</th>
      <th>PO GP</th>
      <th>Reg FT Rate</th>
      <th>PO FT Rate</th>
      <th>FT Rate Delta</th>
    </tr>
  ` : `
    <tr>
      <th>Season</th>
      <th>Player</th>
      <th>Team</th>
      ${isCombined ? '<th>Matched Seasons</th>' : ''}
      <th>Reg GP</th>
      <th>PO GP</th>
      <th>Reg FTA/G</th>
      <th>PO FTA/G</th>
      <th>FTA/G Change</th>
    </tr>
  `;

  if (!sorted.length) {
    tbody.innerHTML = viewType === 'rate'
      ? `<tr><td colspan="${isCombined ? 10 : 9}">No playoff rows match the current filters.</td></tr>`
      : `<tr><td colspan="${isCombined ? 9 : 8}">No playoff rows match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((row) => viewType === 'rate' ? `
    <tr>
      <td>${row.season_label}</td>
      <td class="player-name-cell">${row.player}</td>
      <td>${row.team}</td>
      ${isCombined ? `<td>${formatNum(row.seasons_played ?? 1, 0)}</td>` : ''}
      <td>${formatNum(row.reg_games, 0)}</td>
      <td>${formatNum(row.po_games, 0)}</td>
      <td>${formatPct(row.reg_fta_rate)}</td>
      <td>${formatPct(row.po_fta_rate)}</td>
      <td class="${signedClass(row.fta_rate_change)}">${formatRateDelta(row.fta_rate_change)}</td>
    </tr>
  ` : `
    <tr>
      <td>${row.season_label}</td>
      <td class="player-name-cell">${row.player}</td>
      <td>${row.team}</td>
      ${isCombined ? `<td>${formatNum(row.seasons_played ?? 1, 0)}</td>` : ''}
      <td>${formatNum(row.reg_games, 0)}</td>
      <td>${formatNum(row.po_games, 0)}</td>
      <td>${formatNum(row.reg_fta_per_g)}</td>
      <td>${formatNum(row.po_fta_per_g)}</td>
      <td class="${signedClass(row.fta_per_g_change)}">${formatNum(row.fta_per_g_change)}</td>
    </tr>
  `).join('');
}

function renderTeamTable() {
  const table = document.getElementById('team-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const rows = currentTeamRateRows()
    .slice()
    .sort((a, b) => teamSortDirection === 'desc'
      ? (b.net_ft_rate_swing ?? -Infinity) - (a.net_ft_rate_swing ?? -Infinity)
      : (a.net_ft_rate_swing ?? Infinity) - (b.net_ft_rate_swing ?? Infinity));

  thead.innerHTML = `
    <tr>
      <th>Season</th>
      <th>Team</th>
      <th>PO Games</th>
      <th>Reg Rate</th>
      <th>PO Rate</th>
      <th>Rate Swing</th>
      <th>Reg Allowed</th>
      <th>PO Allowed</th>
      <th>Allowed Swing</th>
      <th><button class="sort-button" type="button" data-sort-table="teams">Net Swing</button></th>
    </tr>
  `;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9">No team rows match the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.season_label}</td>
      <td class="ticker-cell">${row.team_abbr}</td>
      <td>${formatNum(row.playoff_games, 0)}</td>
      <td>${formatPct(row.reg_ft_rate)}</td>
      <td>${formatPct(row.po_ft_rate)}</td>
      <td class="${signedClass(row.ft_rate_change)}">${formatRateDelta(row.ft_rate_change)}</td>
      <td>${formatPct(row.reg_ft_rate_allowed)}</td>
      <td>${formatPct(row.po_ft_rate_allowed)}</td>
      <td class="${signedClass(row.ft_rate_allowed_change)}">${formatRateDelta(row.ft_rate_allowed_change)}</td>
      <td class="${signedClass(row.net_ft_rate_swing)}">${formatRateDelta(row.net_ft_rate_swing)}</td>
    </tr>
  `).join('');
}

function renderRunsTable() {
  const table = document.getElementById('runs-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const rows = currentRunRows()
    .slice()
    .sort((a, b) => runSortDirection === 'desc'
      ? (b.net_ft_rate_edge ?? -Infinity) - (a.net_ft_rate_edge ?? -Infinity)
      : (a.net_ft_rate_edge ?? Infinity) - (b.net_ft_rate_edge ?? Infinity));

  thead.innerHTML = `
    <tr>
      <th>Season</th>
      <th>Champion</th>
      <th>Opponents</th>
      <th>Games</th>
      <th>Team Reg Rate</th>
      <th>Team PO Rate</th>
      <th>Team Swing</th>
      <th>Champ Reg Allowed</th>
      <th>Opp Rate vs Champ</th>
      <th>Opp Swing vs Champ</th>
      <th><button class="sort-button" type="button" data-sort-table="runs">Net Swing</button></th>
    </tr>
  `;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11">No champion runs match the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.season_label}</td>
      <td class="player-name-cell season-team-cell">${row.champion}</td>
      <td class="opponents-cell">${formatOpponentPath(row.opponents)}</td>
      <td>${formatNum(row.playoff_games, 0)}</td>
      <td>${formatPct(row.team_reg_ft_rate)}</td>
      <td>${formatPct(row.team_po_ft_rate)}</td>
      <td class="${signedClass(row.team_ft_rate_change)}">${formatRateDelta(row.team_ft_rate_change)}</td>
      <td>${formatPct(row.champion_reg_ft_rate_allowed)}</td>
      <td>${formatPct(row.opp_po_ft_rate)}</td>
      <td class="${signedClass(row.opp_matchup_swing)}">${formatRateDelta(row.opp_matchup_swing)}</td>
      <td class="${signedClass(row.net_ft_rate_edge)}">${formatRateDelta(row.net_ft_rate_edge)}</td>
    </tr>
  `).join('');
}

function showActiveTab() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === activeTab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const isActive = panel.id === `panel-${activeTab}`;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
  });
  const isCombined = combineFilter.value === 'combined';
  const isPlayerTab = ['risers', 'droppers', 'risers-rate', 'droppers-rate'].includes(activeTab);
  const hideRankFilter = isCombined || !isPlayerTab;
  rankFilterWrap.hidden = hideRankFilter;
  rankFilter.disabled = hideRankFilter;
  rankFilter.title = hideRankFilter ? 'Top N only applies to separate-season player tabs.' : '';
}

function rerender() {
  const rows = applyPostAggregationFilters(aggregateRows(activeRows()));
  renderExplanation();
  renderCards(rows);
  renderPlayerTable('risers-table', rows, 'fta_per_g_change', 'desc', 'raw');
  renderPlayerTable('droppers-table', rows, 'fta_per_g_change', 'asc', 'raw');
  renderPlayerTable('risers-rate-table', rows, 'fta_rate_change', 'desc', 'rate');
  renderPlayerTable('droppers-rate-table', rows, 'fta_rate_change', 'asc', 'rate');
  renderTeamTable();
  renderRunsTable();
  showActiveTab();
}

function setupFilters() {
  seasonYears = unique(playerRows, 'season').map(Number).sort((a, b) => a - b);
  populateSelect(teamFilter, unique(playerRows, 'team'), 'All teams');
  seasonStart.min = String(seasonYears[0]);
  seasonStart.max = String(seasonYears[seasonYears.length - 1]);
  seasonEnd.min = String(seasonYears[0]);
  seasonEnd.max = String(seasonYears[seasonYears.length - 1]);
  seasonStart.value = String(seasonYears[0]);
  seasonEnd.value = String(seasonYears[seasonYears.length - 1]);

  [seasonStart, seasonEnd, teamFilter, rankFilter, poGamesFilter, searchFilter, combineFilter].forEach((element) => {
    element.addEventListener('input', rerender);
    element.addEventListener('change', rerender);
  });

  tabStrip.addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (!button) return;
    activeTab = button.dataset.tab;
    rerender();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.sort-button');
    if (!button) return;
    const tableName = button.dataset.sortTable;
    if (tableName === 'teams') {
      teamSortDirection = teamSortDirection === 'desc' ? 'asc' : 'desc';
    } else if (tableName === 'runs') {
      runSortDirection = runSortDirection === 'desc' ? 'asc' : 'desc';
    }
    rerender();
  });

  explainToggle.addEventListener('click', () => {
    const isOpen = !explainPanel.hidden;
    explainPanel.hidden = isOpen;
    explainToggle.setAttribute('aria-expanded', String(!isOpen));
  });
}

async function loadCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return parseCsv(await response.text());
}

function verifyData() {
  const badPlayerRows = playerRows.filter((row) => !row.made_playoffs || row.po_games === null || row.po_fta_per_g === null);
  if (badPlayerRows.length) {
    throw new Error('Data verification failed for playoff-only dashboard rows.');
  }
}

async function init() {
  try {
    setStatus('Loading dashboard data...');
    const [rawPlayers, rawRuns, rawTeamRates] = await Promise.all([loadCsv(playerUrl), loadCsv(runUrl), loadCsv(teamRateUrl)]);
    playerRows = normalizePlayerRows(rawPlayers);
    championRuns = normalizeChampionRuns(rawRuns);
    teamRateRows = normalizeTeamRateRows(rawTeamRates);
    verifyData();
    setupFilters();
    rerender();
    setStatus('');
  } catch (error) {
    console.error(error);
    setStatus(`Dashboard load failed: ${error.message}`, 'error');
  }
}

init();
