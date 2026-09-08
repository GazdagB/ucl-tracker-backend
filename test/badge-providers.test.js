import assert from "node:assert/strict";
import test from "node:test";
import { imageExtension, matchesTeam, validBadgeUrl } from "../src/badge-providers.js";

test("club aliases handle accents without accepting similarly named clubs", () => {
  assert.ok(matchesTeam("Bayern München", "FC Bayern München"));
  assert.ok(matchesTeam("Bodø/Glimt", "Bodo Glimt"));
  assert.ok(matchesTeam("Inter", "FC Internazionale Milano"));
  assert.equal(matchesTeam("Inter", "Inter Miami"), false);
  assert.equal(matchesTeam("Arsenal", "Arsenal Women"), false);
  assert.equal(matchesTeam("Paris Saint-Germain", "Torcy"), false);
});

test("only HTTPS image hosts belonging to the selected provider are accepted", () => {
  assert.equal(validBadgeUrl("https://crests.football-data.org/57.png", "football-data").hostname, "crests.football-data.org");
  for (const url of ["http://crests.football-data.org/57.png", "https://example.com/57.png", "https://crests.football-data.org.evil.test/a.png", "https://secret@crests.football-data.org/a.png"]) {
    assert.throws(() => validBadgeUrl(url, "football-data"));
  }
});

test("image validation rejects HTML responses and active SVG content", () => {
  assert.equal(imageExtension(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')), "svg");
  for (const invalid of [
    "<html>Access denied</html>",
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><image href="https://example.com/track"/></svg>',
  ]) assert.throws(() => imageExtension(Buffer.from(invalid)));
});
