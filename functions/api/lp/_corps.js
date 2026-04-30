// Pirate FW corps with LP stores. Add more here to support them.
export const LP_CORPS = {
  1000436: { name: "Malakim Zealots", faction: "Angel Cartel" },
  1000437: { name: "Commando Guri", faction: "Guristas Pirates" },
};

export function isSupportedCorp(id) {
  return Object.prototype.hasOwnProperty.call(LP_CORPS, id);
}
