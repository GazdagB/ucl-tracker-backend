// Tournament draw 2 and group scores inspected in Railway on 24 September 2026.
import { fixturesForDraw } from '../src/groups.js';
import { groupStandingsFromMatches } from '../src/matches.js';
import { qualifiersFromStandings } from '../src/knockout.js';
const entries = [
  [['Bodø/Glimt','Mark'],['Club Brugge','Joel'],['Feyenoord','Balázs']],
  [['Barcelona','Joel'],['Real Madrid','Balázs'],['Arsenal','Mark']],
  [['Borussia Dortmund','Mark'],['RB Leipzig','Joel'],['Porto','Balázs']],
  [['Manchester City','Balázs'],['Slavia Praha','Mark'],['Sporting CP','Joel']],
  [['Paris Saint-Germain','Mark'],['Slovan Bratislava','Joel'],['Liverpool','Balázs']],
  [['Napoli','Balázs'],['Atlético de Madrid','Joel'],['Stuttgart','Mark']],
  [['Fenerbahçe','Balázs'],['Shakhtar Donetsk','Joel'],['Roma','Mark']],
  [['Bayern München','Balázs'],['Manchester United','Mark'],['Inter','Joel']],
  [['Aston Villa','Joel'],['Real Betis','Mark'],['Lille','Balázs']],
  [['PSV','Joel'],['Galatasaray','Mark'],['Villarreal','Balázs']],
];
const scores = [[[2,0],[2,3],[4,1]],[[3,2],[2,1],[1,1]],[[3,2],[2,2],[2,2]],[[0,2],[1,0],[1,3]],[[5,0],[0,8],[2,3]],[[3,3],[5,2],[4,4]],[[7,1],[2,2],[5,3]],[[4,4],[1,2],[3,4]],[[2,1],[1,3],[3,1]],[[1,0],[3,0],[1,1]]];
const draw = { groups: entries.map((group,i) => ({ name: String.fromCharCode(65+i), entries: group.map(([team,player]) => ({team,player})) })) };
const fixtures = fixturesForDraw(draw).map(f => { const [homeScore,awayScore] = scores[f.group.charCodeAt(0)-65][Number(f.key.slice(-1))-1]; return {...f,result:{homeScore,awayScore}}; });
export const liveQualifiers = qualifiersFromStandings(groupStandingsFromMatches(draw,fixtures));
export const liveSaved = [
  [8,'Borussia Dortmund','Barcelona',3,7,'Barcelona'],
  [1,'Paris Saint-Germain','Manchester City',8,6,'Paris Saint-Germain'],
  [3,'Lille','Inter',2,2,'Inter'],
  [7,'Bayern München','PSV',0,1,'PSV'],
  [5,'Atlético de Madrid','Fenerbahçe',1,3,'Fenerbahçe'],
].map(([i,homeTeam,awayTeam,homeScore,awayScore,winnerTeam]) => ({fixtureKey:`knockout-r16-${i}`,homeTeam,awayTeam,homeScore,awayScore,winnerTeam}));
