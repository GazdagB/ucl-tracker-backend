// Snapshot checked against UEFA's published draw pots on 7 September 2026.
// The first 30 in the published seeding order are the home tournament default.
export const defaultRoster = {
  season: "2026/27",
  players: ["Joel", "Balázs", "Mark"],
  teams: [
    "Paris Saint-Germain", "Bayern München", "Real Madrid", "Liverpool",
    "Inter", "Manchester City", "Arsenal", "Barcelona", "Atlético de Madrid",
    "Borussia Dortmund", "Roma", "Sporting CP", "Aston Villa", "Porto",
    "Manchester United", "Club Brugge", "Real Betis", "PSV",
    "Feyenoord", "Lille", "Bodø/Glimt", "Napoli", "RB Leipzig", "Villarreal",
    "Fenerbahçe", "Shakhtar Donetsk", "Galatasaray", "Slavia Praha",
    "Slovan Bratislava", "Stuttgart",
  ],
  excluded: ["AEK Athens", "LASK", "Como", "Lens", "Viking", "Sabah"],
  source: "https://www.uefa.com/uefachampionsleague/news/02a8-21717d0c6cb5-03a9a5ff1552-1000--champions-league-league-phase-draw-pots-confirmed/",
  checkedAt: "2026-09-07",
};
