import React, { useEffect, useMemo, useRef, useState, Binding } from "@rbxts/react";
import { Players, RunService, TweenService } from "@rbxts/services";
import { usePx } from "client/hooks/use-px";
import { useMotion } from "client/hooks/use-motion";
import { useCountdown } from "client/hooks/use-countdown";
import { palette } from "client/utils/palette";
import { JackpotData } from "typings/APIResponses";
import { PlayerSliceRotationRange, norm } from "client/hooks/use-jackpot-wheel";
import { setDecimalPlaces } from "shared/util/number-utils";
import { Motion } from "@rbxts/ripple";
import { brighten } from "client/utils/color-utils";
import { stringHash } from "client/utils/string-hash";

const DEFAULT_TWEEN = {
	time: 0.3,
	style: Enum.EasingStyle.Quad,
	direction: Enum.EasingDirection.Out,
} as const;

export interface WheelAnimationBindings {
	wheel: {
		size: Binding<UDim2>;
		rotation: Binding<number>;
		strokeSize: Binding<number>;
		strokeColour: Binding<Color3>;
		ref: React.RefObject<Frame>;
		pointerColour: Binding<Color3>;
		pointerTransparency: Binding<number>;
	};
	transparency: {
		title: Binding<number>;
		loading: Binding<number>;
		preSubtitle: Binding<number>;
		postSubtitle: Binding<number>;
		roundOverTitle: Binding<number>;
		roundOverDescription: Binding<number>;
	};
	text: {
		colour: Binding<Color3>;
		subtitle: string;
		postSubtitle: string;
	};
	state: {
		animating: boolean;
		buttonEnabled: boolean;
	};
	image: {
		headshotRotation: Binding<number>;
		headshotPosition: Binding<UDim2>;
		headshotSize: Binding<UDim2>;
		headshotTransparency: Binding<number>;
	};
	registerSlice: (index: number, slice?: ImageLabel) => void;
}

export function useJackpotWheelAnimations(
	jackpot: JackpotData,
	playerSliceInfo: PlayerSliceRotationRange[],
): WheelAnimationBindings {
	const px = usePx();

	const [innerWheelSize, innerWheelSizeMotion] = useMotion(new UDim2(0, px(300), 0, px(300)));
	const [wheelRotation, wheelRotationMotion] = useMotion(0);

	const [titleTransparency, titleTransparencyMotion] = useMotion(0);
	const [loadingTransparency, loadingTransparencyMotion] = useMotion(1);
	const [preSubTextTransparency, preSubTextTransparencyMotion] = useMotion(0);
	const [postSubTextTransparency, postSubTextTransparencyMotion] = useMotion(1);

	// Transparency for the end-of-round "Round Over" title and description
	const [roundOverTitleTransparency, roundOverTitleTransparencyMotion] = useMotion(1);
	const [roundOverDescriptionTransparency, roundOverDescriptionTransparencyMotion] = useMotion(1);

	const [textColour, textColourMotion] = useMotion(palette.primaryText);
	const [innerStrokeColour, innerStrokeColourMotion] = useMotion(palette.background1);
	const [pointerColour, pointerColourMotion] = useMotion(palette.white);
	const [pointerTransparency, pointerTransparencyMotion] = useMotion(1);
	const [innerStrokeSize, innerStrokeSizeMotion] = useMotion(0);

	const [headshotRotation, headshotRotationMotion] = useMotion(0);
	const [headshotSize, headshotSizeMotion] = useMotion(new UDim2(0, px(65), 0, px(65)));
	const [headshotPosition, headshotPositionMotion] = useMotion(new UDim2(0.5, 0, 0.5, -px(18)));
	const [headshotTransparency, headshotTransparencyMotion] = useMotion(1);

	const wheelRef = useRef<Frame>();
	const [animating, setAnimating] = useState(false);
	const [postSubText, setPostSubText] = useState("");
	const [countdownString, countdownFinished] = useCountdown(
		jackpot.status === "waiting_for_start" && jackpot.auto_start_at
			? jackpot.auto_start_at
			: jackpot.status === "countdown"
				? jackpot.countdown_end_at
				: undefined,
	);

	const computeSubtitle = () => {
		if (countdownFinished) return "";
		if (jackpot.status === "waiting_for_start" && jackpot.auto_start_at) {
			return `Starting in ${countdownString}`;
		} else if (jackpot.status === "waiting_for_start" && !jackpot.auto_start_at) {
			return "Waiting for players...";
		} else if (jackpot.status === "countdown") {
			return `Spinning in ${countdownString}`;
		} else if (jackpot.status === "complete") {
			return "";
		}
		return "";
	};

	const subtitleText = computeSubtitle();

	const pregameInnerVisible = !animating && jackpot.status !== "complete";
	const showTitle = pregameInnerVisible && !countdownFinished;
	const showLoading = pregameInnerVisible && countdownFinished && jackpot.status !== "complete";
	const showSubText = !animating && jackpot.status !== "complete";
	const showPostSubText = animating;

	useEffect(() => {
		const p: Array<[Motion<number>, boolean]> = [
			[titleTransparencyMotion, showTitle],
			[loadingTransparencyMotion, showLoading],
			[preSubTextTransparencyMotion, showSubText],
			[postSubTextTransparencyMotion, showPostSubText],
			[pointerTransparencyMotion, animating],
		];
		for (const [motion, visible] of p) {
			motion.tween(visible ? 0 : 1, DEFAULT_TWEEN);
		}
	}, [showTitle, showLoading, showSubText, showPostSubText, animating]);

	const sliceLookup = useMemo(() => {
		const lookup = new Array<PlayerSliceRotationRange | undefined>(360);
		for (const slice of playerSliceInfo) {
			const [sRaw, eRaw] = slice.range.map((d) => norm(d));
			if (math.abs(sRaw - eRaw) < 1e-4) {
				for (let d = 0; d < 360; d++) lookup[d] = slice;
				continue;
			}

			const assignRange = (from: number, to: number) => {
				for (let d = math.floor(from); d <= math.floor(to); d++) lookup[d % 360] = slice;
			};

			if (sRaw <= eRaw) {
				assignRange(sRaw, eRaw);
			} else {
				assignRange(sRaw, 359);
				assignRange(0, eRaw);
			}
		}
		return lookup as ReadonlyArray<PlayerSliceRotationRange | undefined>;
	}, [playerSliceInfo]);

	useEffect(() => {
		let connection: RBXScriptConnection | undefined;

		if (jackpot.status === "complete" && jackpot.winning_data) {
			const winner = jackpot.winning_data.player.id;
			const winnerSlice = playerSliceInfo.find((slice) => slice.playerId === winner);
			if (!winnerSlice) return;

			const [startDeg, endDeg] = winnerSlice.range;
			let randomRotation: number;
			let middleDeg: number;

			const rngSeed = stringHash(jackpot.id);
			const rng = new Random(rngSeed);

			const sliceSpan =
				math.abs(endDeg - startDeg) < 1e-4
					? 0
					: startDeg <= endDeg
						? endDeg - startDeg
						: 360 - startDeg + endDeg;

			if (sliceSpan < 1e-4) {
				randomRotation = startDeg;
				middleDeg = startDeg;
			} else {
				middleDeg = startDeg <= endDeg ? (startDeg + endDeg) / 2 : (startDeg + sliceSpan / 2) % 360;
				if (rng.NextNumber() < 0.5) {
					const edgeOffset = rng.NextNumber() * math.min(sliceSpan * 0.1, 10);
					randomRotation =
						rng.NextNumber() < 0.5 ? (startDeg + edgeOffset) % 360 : (endDeg - edgeOffset + 360) % 360;
				} else {
					const innerOffset = rng.NextNumber() * sliceSpan;
					randomRotation = (startDeg + innerOffset) % 360;
				}
			}

			setAnimating(true);
			// Ensure headshot is visible throughout the spin.
			headshotTransparencyMotion.immediate(0);

			innerWheelSizeMotion.tween(new UDim2(0, px(230), 0, px(230)), {
				time: 1,
				style: Enum.EasingStyle.Quint,
				direction: Enum.EasingDirection.Out,
			});
			innerStrokeSizeMotion.tween(px(5), {
				time: 1,
				style: Enum.EasingStyle.Quint,
				direction: Enum.EasingDirection.Out,
			});
			wheelRotationMotion.tween(360 * 5 + randomRotation, {
				time: 12,
				style: Enum.EasingStyle.Cubic,
				direction: Enum.EasingDirection.InOut,
			});

			let lastPlayerId: string | undefined;
			connection = RunService.RenderStepped.Connect(() => {
				if (!wheelRef.current) return;
				const rotation = wheelRef.current.Rotation;
				const r0 = ((rotation % 360) + 360) % 360;

				const currentSlice = sliceLookup[math.floor(r0)];
				if (!currentSlice) return;
				if (currentSlice.playerId === lastPlayerId) return;
				lastPlayerId = currentSlice.playerId;

				headshotRotationMotion.immediate(-10);
				headshotRotationMotion.tween(0, {
					time: 0.3,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});
				innerStrokeColourMotion.tween(adjustColour(currentSlice.colour), {
					time: 0.3,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});
				textColourMotion.tween(currentSlice.colour, {
					time: 0.3,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});
				pointerColourMotion.tween(brighten(currentSlice.colour, 0.2), {
					time: 0.3,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});

				const playerMember = jackpot.members.find((m) => m.player.id === currentSlice.playerId);
				const winChance =
					(playerMember?.total_value ?? 0) / jackpot.members.reduce((s, m) => s + m.total_value, 0);
				setPostSubText(
					`@${playerMember?.player.username}#${setDecimalPlaces(winChance * 100, 2)}%#rbxthumb://type=AvatarHeadShot&id=${currentSlice.playerId}&w=150&h=150`,
				);
			});

			task.delay(12, () => {
				postSubTextTransparencyMotion.tween(1, DEFAULT_TWEEN);
				roundOverTitleTransparencyMotion.immediate(1);
				roundOverDescriptionTransparencyMotion.immediate(1);
				task.spawn(() => {
					roundOverTitleTransparencyMotion.tween(0, {
						time: 0.4,
						style: Enum.EasingStyle.Quint,
						direction: Enum.EasingDirection.Out,
					});
					roundOverDescriptionTransparencyMotion.tween(0, {
						time: 0.5,
						style: Enum.EasingStyle.Quint,
						direction: Enum.EasingDirection.Out,
					});
				});

				// Keep headshot visible
				headshotTransparencyMotion.tween(0, DEFAULT_TWEEN);
				setAnimating(false);

				innerWheelSizeMotion.tween(new UDim2(0, px(300), 0, px(300)), {
					time: 0.5,
					style: Enum.EasingStyle.Back,
					direction: Enum.EasingDirection.Out,
				});
				innerStrokeSizeMotion.tween(px(0), {
					time: 0.5,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});
				headshotSizeMotion.tween(new UDim2(0, px(80), 0, px(80)), {
					time: 0.5,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});
				headshotPositionMotion.tween(new UDim2(0.5, 0, 0.5, -px(50)), {
					time: 0.5,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});

				// Tween alternate slices to winner colour for celebratory effect
				const tweenInfo = new TweenInfo(0.6, Enum.EasingStyle.Quint, Enum.EasingDirection.Out);
				for (let i = 0; i < sliceRefs.current.size(); i++) {
					const sliceImg = sliceRefs.current[i];
					if (!sliceImg) continue;
					TweenService.Create(sliceImg, tweenInfo, {
						ImageColor3: textColour.getValue(),
					}).Play();
				}
			});
		}

		return () => {
			if (connection) connection.Disconnect();
		};
	}, [jackpot.status]);

	const buttonActive = useMemo(() => {
		const playerId = `${Players.LocalPlayer.UserId}`;
		const isMember = jackpot.members.some((m) => m.player.id === playerId);
		return !isMember && jackpot.joinable && jackpot.status === "waiting_for_start";
	}, [jackpot.joinable, jackpot.members, jackpot.status]);

	// slice refs array for colour tweening
	const sliceRefs = useRef<Array<ImageLabel | undefined>>([]);
	const registerSlice = (idx: number, ref?: ImageLabel) => {
		sliceRefs.current[idx] = ref;
	};

	return {
		wheel: {
			size: innerWheelSize,
			rotation: wheelRotation,
			strokeSize: innerStrokeSize,
			strokeColour: innerStrokeColour,
			ref: wheelRef,
			pointerColour: pointerColour,
			pointerTransparency: pointerTransparency,
		},
		transparency: {
			title: titleTransparency,
			loading: loadingTransparency,
			preSubtitle: preSubTextTransparency,
			postSubtitle: postSubTextTransparency,
			roundOverTitle: roundOverTitleTransparency,
			roundOverDescription: roundOverDescriptionTransparency,
		},
		text: {
			colour: textColour,
			subtitle: subtitleText,
			postSubtitle: postSubText,
		},
		state: {
			animating,
			buttonEnabled: buttonActive,
		},
		image: {
			headshotRotation: headshotRotation,
			headshotPosition: headshotPosition,
			headshotSize: headshotSize,
			headshotTransparency: headshotTransparency,
		},
		registerSlice,
	};
}

function adjustColour(colour: Color3) {
	const [h, s, v] = Color3.toHSV(colour);
	return Color3.fromHSV(h, s, math.clamp(v * 0.704, 0, 1));
}
