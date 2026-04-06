export const COINFLIP_JOIN_MIN_ODDS_PERCENT = 45;
export const COINFLIP_JOIN_MAX_ODDS_PERCENT = 55;

export function getCoinflipJoinValueRange(playerOneValue: number) {
	const normalizedPlayerOneValue = math.max(0, math.floor(playerOneValue));
	const minimumRatio = COINFLIP_JOIN_MIN_ODDS_PERCENT / (100 - COINFLIP_JOIN_MIN_ODDS_PERCENT);
	const maximumRatio = COINFLIP_JOIN_MAX_ODDS_PERCENT / (100 - COINFLIP_JOIN_MAX_ODDS_PERCENT);

	return {
		minimumValue: math.max(0, math.floor(normalizedPlayerOneValue * minimumRatio)),
		maximumValue: math.max(0, math.ceil(normalizedPlayerOneValue * maximumRatio)),
	};
}
