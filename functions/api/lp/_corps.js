// FW militia corporations with LP stores. Add more here to support them.
// `ownNavyPrefixes` lists the faction-name prefixes that LEGITIMATELY belong
// to this corp; offers whose product name starts with a navy prefix from a
// DIFFERENT faction are filtered out (ESI returns cross-faction items in some
// militia stores, e.g. 24th Imperial Crusade returns ~90 Federation Navy items).
export const LP_CORPS = {
  // Main Faction Warfare militias
  1000110: {
    name: "24th Imperial Crusade",
    faction: "Amarr Empire",
    ownNavyPrefixes: ["Imperial Navy", "Khanid Navy", "Amarr Empire", "Amarr Navy"],
  },
  1000179: {
    name: "Federal Defence Union",
    faction: "Gallente Federation",
    ownNavyPrefixes: ["Federation Navy", "Federal Navy", "Gallente Federation"],
  },
  1000180: {
    name: "State Protectorate",
    faction: "Caldari State",
    ownNavyPrefixes: ["Caldari Navy", "Caldari State"],
  },
  1000182: {
    name: "Tribal Liberation Force",
    faction: "Minmatar Republic",
    ownNavyPrefixes: ["Republic Fleet", "Minmatar Republic"],
  },
  // Pirate Faction Warfare — leave unfiltered, no cross-faction navy issues.
  1000436: { name: "Malakim Zealots", faction: "Angel Cartel" },
  1000437: { name: "Commando Guri", faction: "Guristas Pirates" },
};

// Faction-named navy/empire prefixes used to detect cross-faction items.
const ALL_NAVY_PREFIXES = [
  "Imperial Navy",
  "Khanid Navy",
  "Amarr Empire",
  "Amarr Navy",
  "Federation Navy",
  "Federal Navy",
  "Gallente Federation",
  "Caldari Navy",
  "Caldari State",
  "Republic Fleet",
  "Minmatar Republic",
];

export function isSupportedCorp(id) {
  return Object.prototype.hasOwnProperty.call(LP_CORPS, id);
}

// Returns true if `name` is from a faction navy that doesn't belong to this corp.
// Items with no navy prefix (generic implants, skills, ship blueprints without
// faction-name prefix, etc.) are kept.
export function isWrongFactionItem(corpId, name) {
  const corp = LP_CORPS[corpId];
  if (!corp || !corp.ownNavyPrefixes || !name) return false;
  for (const prefix of ALL_NAVY_PREFIXES) {
    if (!name.startsWith(prefix)) continue;
    return !corp.ownNavyPrefixes.some((own) => name.startsWith(own));
  }
  return false;
}
