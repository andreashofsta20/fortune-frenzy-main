import { useMemo } from "@rbxts/react";
import { useJackpotSelection } from "client/hooks/use-jackpot-selection";
import { stringHash } from "client/utils/string-hash";

const colourGroups: Color3[][] = [
	[
		Color3.fromHex("#e44028"),
		Color3.fromHex("#ac3924"),
		Color3.fromHex("#8f3424"),
		Color3.fromHex("#e57f5e"),
		Color3.fromHex("#db807f"),
		Color3.fromHex("#9d726b"),
	],
	[
		Color3.fromHex("#e7b437"),
		Color3.fromHex("#e0762b"),
		Color3.fromHex("#be8834"),
		Color3.fromHex("#965127"),
		Color3.fromHex("#795c3a"),
		Color3.fromHex("#d9aa80"),
	],
	[
		Color3.fromHex("#dded45"),
		Color3.fromHex("#cec83f"),
		Color3.fromHex("#c2b662"),
		Color3.fromHex("#e1daa0"),
		Color3.fromHex("#826e31"),
	],
	[Color3.fromHex("#9cd93e"), Color3.fromHex("#b7de79"), Color3.fromHex("#81942d")],
	[
		Color3.fromHex("#62e23e"),
		Color3.fromHex("#4ea432"),
		Color3.fromHex("#4e8132"),
		Color3.fromHex("#aed89b"),
		Color3.fromHex("#4e753d"),
	],
	[Color3.fromHex("#69e772"), Color3.fromHex("#60d17b")],
	[Color3.fromHex("#61e3ad"), Color3.fromHex("#4c9e6d"), Color3.fromHex("#466c52")],
	[Color3.fromHex("#56e3d8"), Color3.fromHex("#9fddc8"), Color3.fromHex("#4a9c96")],
	[Color3.fromHex("#3f6c74"), Color3.fromHex("#53cde8"), Color3.fromHex("#78b9d2")],
	[Color3.fromHex("#5693cf")],
	[
		Color3.fromHex("#594bd3"),
		Color3.fromHex("#5a54b0"),
		Color3.fromHex("#7183e3"),
		Color3.fromHex("#505f95"),
		Color3.fromHex("#b2b3e6"),
		Color3.fromHex("#404973"),
	],
	[Color3.fromHex("#3f3082")],
	[Color3.fromHex("#9836d5"), Color3.fromHex("#69248f"), Color3.fromHex("#b666da"), Color3.fromHex("#cb8ddb")],
	[Color3.fromHex("#dd3cc0"), Color3.fromHex("#c45aaf"), Color3.fromHex("#832c87"), Color3.fromHex("#cb93be")],
	[Color3.fromHex("#e04082"), Color3.fromHex("#932f67"), Color3.fromHex("#743f5b"), Color3.fromHex("#7c5270")],
	[
		Color3.fromHex("#dc4154"),
		Color3.fromHex("#a33849"),
		Color3.fromHex("#d77197"),
		Color3.fromHex("#823041"),
		Color3.fromHex("#ddb7c1"),
	],
	[Color3.fromHex("#c7d5ce"), Color3.fromHex("#7a88a0"), Color3.fromHex("#828e72")],
];

const jackpotColours: Color3[] = (() => {
	let maxLen = 0;
	for (const group of colourGroups) maxLen = math.max(maxLen, group.size());

	const result: Color3[] = [];
	for (let i = 0; i < maxLen; i++) {
		for (const group of colourGroups) {
			const colour = group[i];
			if (colour !== undefined) result.push(colour);
		}
	}
	return result;
})();

function adjustValue(colour: Color3, delta: number): Color3 {
	const [h, s, v] = Color3.toHSV(colour);
	return Color3.fromHSV(h, s, math.clamp(v + delta, 0, 1));
}

function colourDistanceSq(a: Color3, b: Color3): number {
	const dr = a.R - b.R;
	const dg = a.G - b.G;
	const db = a.B - b.B;
	return dr * dr + dg * dg + db * db;
}

const SIMILARITY_THRESHOLD = 0.25;

function pickColourForPlayer(playerId: string, usedIndices: Set<number>, prevColour?: Color3): Color3 {
	const paletteSize = jackpotColours.size();
	const baseIndex = (stringHash(playerId) % paletteSize) + 1;

	for (let offset = 0; offset < paletteSize; offset++) {
		const idx = ((baseIndex - 1 + offset) % paletteSize) + 1;
		if (usedIndices.has(idx)) continue;
		const colour = jackpotColours[idx - 1];
		if (prevColour === undefined || colourDistanceSq(colour, prevColour) >= SIMILARITY_THRESHOLD) {
			usedIndices.add(idx);
			return colour;
		}
	}

	for (let idx = 1; idx <= paletteSize; idx++) {
		if (!usedIndices.has(idx)) {
			usedIndices.add(idx);
			return jackpotColours[idx - 1];
		}
	}

	return jackpotColours[baseIndex - 1];
}

export interface JackpotSlice {
	rotation: number;
	colour: Color3;
	zIndex: number;
	cutRotation?: number;
}

const START_ANGLE_RAD = math.rad(90);

export interface PlayerSliceRotationRange {
	playerId: string;
	colour: Color3;
	range: [number, number];
}

export const norm = (d: number) => ((d % 360) + 360) % 360;
export const useJackpotWheel = () => {
	const { currentJackpot, selectedJackpotId, deselectJackpot } = useJackpotSelection();

	const { slices, playerSliceInfo } = useMemo(() => {
		const pushSlices = (result: JackpotSlice[], prev: number, angle: number, order: number, colour: Color3) => {
			const span = angle - prev;
			if (span < math.pi) {
				const rotation = math.deg(angle) + 180;
				const cutRotation = math.deg(prev) + 90 - rotation;
				result.push({ rotation, colour, zIndex: order, cutRotation });
			} else {
				const rotation1 = math.deg(prev);
				const rotation2 = math.deg(angle) + 180;
				result.push({ rotation: rotation1, colour, zIndex: order });
				result.push({ rotation: rotation2, colour, zIndex: order });
			}
		};

		const slicesResult: JackpotSlice[] = [];
		const playerInfoMap = new Map<string, PlayerSliceRotationRange>();

		let prev = START_ANGLE_RAD;
		let order = 0;

		if (!currentJackpot || currentJackpot.members.size() === 0) {
			return { slices: slicesResult, playerSliceInfo: [] };
		}
		const members = currentJackpot.members;
		let totalValue = 0;
		for (const m of members) totalValue += m.total_value;
		// If every stake is 0 (stale data / decode issue), still build slices so member rows and wheel don't break.
		const stakeDenominator = totalValue > 0 ? totalValue : members.size();
		const stakeFor = (m: (typeof members)[number]) => (totalValue > 0 ? m.total_value : 1);
		if (stakeDenominator === 0) return { slices: slicesResult, playerSliceInfo: [] };

		const sortedMembers = [...members].sort((a, b) => a.player.id < b.player.id);
		const usedColourIndices = new Set<number>();

		if (sortedMembers.size() === 1) {
			const member = sortedMembers[0];
			const baseColour = pickColourForPlayer(member.player.id, usedColourIndices, undefined);
			const altColour = adjustValue(baseColour, -0.18);
			const segmentCount = 8;

			playerInfoMap.set(member.player.id, {
				playerId: member.player.id,
				colour: baseColour,
				range: [0, 0],
			});

			for (let i = 0; i < segmentCount; i++) {
				const segmentStart = START_ANGLE_RAD + (i / segmentCount) * math.pi * 2;
				const segmentEnd = START_ANGLE_RAD + ((i + 1) / segmentCount) * math.pi * 2;
				order += 1;
				pushSlices(
					slicesResult,
					segmentStart,
					segmentEnd,
					order,
					i % 2 === 0 ? baseColour : altColour,
				);
			}

			const playerSliceInfoArray: PlayerSliceRotationRange[] = [];
			playerInfoMap.forEach((info) => playerSliceInfoArray.push(info));
			return { slices: slicesResult, playerSliceInfo: playerSliceInfoArray };
		}

		for (const member of sortedMembers) {
			order += 1;
			const angle = prev + (stakeFor(member) / stakeDenominator) * math.pi * 2;

			const startDeg = math.deg(prev);
			const endDeg = math.deg(angle);
			const rangeStart = norm(90 - endDeg);
			const rangeEnd = norm(90 - startDeg);
			let info = playerInfoMap.get(member.player.id);
			if (!info) {
				info = {
					playerId: member.player.id,
					colour: pickColourForPlayer(
						member.player.id,
						usedColourIndices,
						slicesResult.size() > 0 ? slicesResult[slicesResult.size() - 1].colour : undefined,
					),
					range: [rangeStart, rangeEnd],
				};
				playerInfoMap.set(member.player.id, info);
			} else {
				info.range = [rangeStart, rangeEnd];
			}

			const colour = info.colour;
			pushSlices(slicesResult, prev, angle, order, colour);
			prev = angle;
		}

		const playerSliceInfoArray: PlayerSliceRotationRange[] = [];
		playerInfoMap.forEach((info) => playerSliceInfoArray.push(info));

		return { slices: slicesResult, playerSliceInfo: playerSliceInfoArray };
	}, [currentJackpot]);

	return {
		selectedJackpotId,
		currentJackpot,
		deselectJackpot,
		slices,
		playerSliceInfo,
	};
};
