import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { extractRankedSkills, paginateSkillResults } = await jiti.import("./skills-ranking.ts");

test("extracts skills from legacy __NEXT_DATA__", () => {
  const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"skills":[{"source":"owner/repo","skillId":"skill-a","name":"skill-a","installs":1250}]}}}</script>';
  assert.deepEqual(extractRankedSkills(html), [{
    package: "owner/repo@skill-a",
    installs: "1.3K installs",
    url: "https://skills.sh/owner/repo/skill-a",
  }]);
});

test("extracts current escaped Flight data and caps pagination at eight pages", () => {
  const html = 'self.__next_f.push([1,"{\\"skills\\":[{\\"source\\":\\"owner/repo\\",\\"skillId\\":\\"skill-a\\",\\"name\\":\\"skill-a\\",\\"installs\\":7},{\\"source\\":\\"owner/repo\\",\\"skillId\\":\\"skill-b\\",\\"name\\":\\"skill-b\\",\\"installs\\":6}]} "])';
  assert.deepEqual(extractRankedSkills(html).map((skill) => skill.package), ["owner/repo@skill-a", "owner/repo@skill-b"]);

  const skills = Array.from({ length: 140 }, (_, index) => ({ package: `owner/repo@skill-${index}`, installs: "1 install", url: "" }));
  const page = paginateSkillResults(skills, 9);
  assert.equal(page.totalPages, 8);
  assert.equal(page.page, 8);
  assert.equal(page.results.length, 15);
});
