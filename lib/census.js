// When each station on the register came on the air. Filled in by the
// register when it loads, so that a station can report the size of the
// band without importing the list it is itself on.

export const census = { since: [] };

// How many stations were on the air at time t.
export const stationsAt = (t) => census.since.filter((s) => s <= t).length;
