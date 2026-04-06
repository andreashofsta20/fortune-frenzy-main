function getRarity(value: number, returnAsNumber: true): number;
function getRarity(
	value: number,
	returnAsNumber?: false,
): "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythical";
function getRarity(
	value: number,
	returnAsNumber?: boolean,
): "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythical" | number {
	if (value >= 15000000 / 5) {
		return returnAsNumber ? 6 : "mythical";
	} else if (value >= 5000000 / 5) {
		return returnAsNumber ? 5 : "legendary";
	} else if (value >= 1500000 / 5) {
		return returnAsNumber ? 4 : "epic";
	} else if (value >= 300000 / 5) {
		return returnAsNumber ? 3 : "rare";
	} else if (value >= 50000 / 5) {
		return returnAsNumber ? 2 : "uncommon";
	} else {
		return returnAsNumber ? 1 : "common";
	}
}

export default getRarity;
