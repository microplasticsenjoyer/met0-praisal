// FW militia corporations with LP stores. Add more here to support them.
export const LP_CORPS = {
  // Main Faction Warfare militias
  1000110: { name: "24th Imperial Crusade", faction: "Amarr Empire" },
  1000179: { name: "Federal Defence Union", faction: "Gallente Federation" },
  1000180: { name: "State Protectorate", faction: "Caldari State" },
  1000182: { name: "Tribal Liberation Force", faction: "Minmatar Republic" },
  // Pirate Faction Warfare
  1000436: { name: "Malakim Zealots", faction: "Angel Cartel" },
  1000437: { name: "Commando Guri", faction: "Guristas Pirates" },
};

export function isSupportedCorp(id) {
  return Object.prototype.hasOwnProperty.call(LP_CORPS, id);
}
