const rankRanges = [
	{ min: 0, max: 5, rank: "noob" },
	{ min: 6, max: 10, rank: "rookie" },
	{ min: 11, max: 20, rank: "drifter" },
	{ min: 21, max: 30, rank: "hustler" },
	{ min: 31, max: 40, rank: "chancer" },
	{ min: 41, max: 50, rank: "baller" },
	{ min: 51, max: 60, rank: "dealer" },
	{ min: 61, max: 70, rank: "riser" },
	{ min: 71, max: 80, rank: "staker" },
	{ min: 81, max: 90, rank: "roller" },
	{ min: 91, max: 100, rank: "ace" },
	{ min: 101, max: 120, rank: "shark" },
	{ min: 121, max: 140, rank: "slayer" },
	{ min: 141, max: 160, rank: "prodigy" },
	{ min: 161, max: 180, rank: "veteran" },
	{ min: 181, max: 200, rank: "exec" },
	{ min: 201, max: 220, rank: "legend" },
	{ min: 221, max: 240, rank: "hotshot" },
	{ min: 241, max: 260, rank: "icon" },
	{ min: 261, max: 280, rank: "baron" },
	{ min: 281, max: 300, rank: "kingpin" },
	{ min: 301, max: 325, rank: "tycoon" },
	{ min: 326, max: 350, rank: "dominator" },
	{ min: 351, max: 375, rank: "sovereign" },
	{ min: 376, max: 400, rank: "overlord" },
	{ min: 401, max: 425, rank: "ascendant" },
	{ min: 426, max: 450, rank: "oracle" },
	{ min: 451, max: 475, rank: "immortal" },
	{ min: 476, max: 499, rank: "transcendent" },
	{ min: 500, max: 500, rank: "deity" },
];

export default function (level: number): string {
	for (const range of rankRanges) {
		if (level >= range.min && level <= range.max) {
			return range.rank;
		}
	}
	return "weirdo";
}
