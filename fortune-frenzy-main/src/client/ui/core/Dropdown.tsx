import React, { useEffect, useState, useRef } from "@rbxts/react";
import { useMotion } from "client/hooks/use-motion";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Button } from "./Button";
import { Corner } from "../tools/Corner";
import { useEventListener } from "@rbxts/pretty-react-hooks";
import { UserInputService } from "@rbxts/services";

interface DropdownOption {
	key: string;
	text: string;
	image?: string;
	backgroundColor?: Color3;
	textColor?: Color3;
}

interface Props {
	size: UDim2;
	position: UDim2;
	anchorPoint?: Vector2;
	options: DropdownOption[];
	onSelect: (key: string) => void;
	current?: string;
	typeface?: "Sans" | "Mono" | "Extended";
	weight?: "Light" | "Regular" | "Medium" | "SemiBold" | "Bold" | "ExtraBold";
	imageSize?: number;
	imagePadding?: number;
	textSize?: number;
	backgroundColor?: Color3;
	textColor?: Color3;
	layoutOrder?: number;
	pressDip?: number;
	zindex?: number;
}

export function Dropdown({
	size,
	position,
	anchorPoint = new Vector2(),
	options,
	onSelect,
	current,
	typeface = "Sans",
	weight = "Regular",
	imageSize = 21,
	imagePadding = 5,
	textSize = 18,
	backgroundColor = palette.background3,
	textColor = palette.primaryText,
	layoutOrder,
	pressDip = 2,
	zindex = 20,
}: Props) {
	const px = usePx();

	const getIndexFromKey = (key?: string) => {
		if (key === undefined) return 0;
		const idx = options.findIndex((o) => o.key === key);
		return idx === -1 ? 0 : idx;
	};

	const [currentIndex, setCurrentIndex] = useState(() => getIndexFromKey(current));
	const [open, setOpen] = useState(false);
	const [arrowRotation, arrowRotationMotion] = useMotion(0);
	const [containerSize, containerSizeMotion] = useMotion(size);

	const ANIM_TIME = 0.25;
	const TWEEN_PARAMS = {
		time: ANIM_TIME,
		style: Enum.EasingStyle.Exponential,
		direction: Enum.EasingDirection.Out,
	};

	const dropdownRef = useRef<Frame>();

	useEffect(() => {
		if (current === undefined) return;
		setCurrentIndex(getIndexFromKey(current));
	}, [current]);

	useEffect(() => {
		arrowRotationMotion.tween(open ? 180 : 0, TWEEN_PARAMS);
	}, [open]);

	useEffect(() => {
		containerSizeMotion.tween(
			open
				? new UDim2(
						size.X.Scale,
						size.X.Offset,
						0,
						size.Y.Offset +
							px(5) +
							(options.size() * rowHeight +
								optionSpacing * math.max(options.size() - 1, 0) +
								containerPadding * 2),
					)
				: size,
			TWEEN_PARAMS,
		);
	}, [open, options]);

	useEventListener(UserInputService.InputBegan, (input) => {
		if (!open) return;

		if (
			input.UserInputType === Enum.UserInputType.MouseButton1 ||
			input.UserInputType === Enum.UserInputType.Touch
		) {
			const frame = dropdownRef.current;
			if (!frame) return;
			const pos = frame.AbsolutePosition;
			const sizeAbs = frame.AbsoluteSize;
			const clickPos = input.Position;

			setOpen(
				clickPos.X >= pos.X &&
					clickPos.X <= pos.X + sizeAbs.X &&
					clickPos.Y >= pos.Y &&
					clickPos.Y <= pos.Y + sizeAbs.Y,
			);
		}
	});

	const handleSelect = (idx: number) => {
		setOpen(false);
		setCurrentIndex(idx);
		onSelect(options[idx].key);
	};

	const rowHeight = size.Y.Offset;
	const optionSpacing = px(4);
	const containerPadding = px(5);
	const listHeight =
		options.size() * rowHeight + optionSpacing * math.max(options.size() - 1, 0) + containerPadding * 2;

	return (
		<frame
			ref={dropdownRef}
			BackgroundTransparency={1}
			Size={containerSize}
			Position={position}
			AnchorPoint={anchorPoint}
			ClipsDescendants={true}
			LayoutOrder={layoutOrder}
			ZIndex={zindex}
		>
			<Button
				size={size}
				position={new UDim2(0, 0, 0, 0)}
				typeface={typeface}
				weight={weight}
				image={"rbxassetid://74034021420536"}
				imageRotation={arrowRotation}
				imageSize={px(30)}
				imagePadding={px(5)}
				text={options[currentIndex].text}
				textSize={textSize}
				backgroundColor={options[currentIndex].backgroundColor ?? backgroundColor}
				textColor={options[currentIndex].textColor ?? textColor}
				pressDip={pressDip}
				zindex={zindex}
				event={{
					Activated: () => setOpen((prev) => !prev),
				}}
			/>

			<frame
				Size={new UDim2(size.X.Scale, size.X.Offset, 0, listHeight)}
				Position={new UDim2(0, 0, 0, size.Y.Offset + px(5))}
				BackgroundColor3={palette.background3}
				BorderSizePixel={0}
				ZIndex={zindex}
			>
				<Corner roundness="small" />
				<uipadding
					PaddingTop={new UDim(0, px(5))}
					PaddingBottom={new UDim(0, px(5))}
					PaddingLeft={new UDim(0, px(5))}
					PaddingRight={new UDim(0, px(5))}
				/>
				<uilistlayout Padding={new UDim(0, optionSpacing)} SortOrder={Enum.SortOrder.LayoutOrder} />
				{options.map((opt, idx) => (
					<Button
						key={opt.key}
						size={new UDim2(1, 0, 0, rowHeight)}
						position={new UDim2(0, 0, 0, 0)}
						layoutOrder={idx}
						parentWidth={size.X.Offset}
						text={opt.text}
						textSize={textSize}
						typeface={typeface}
						weight={weight}
						backgroundColor={opt.backgroundColor ?? backgroundColor}
						textColor={opt.textColor ?? textColor}
						pressDip={pressDip}
						zindex={zindex}
						event={open ? { Activated: () => handleSelect(idx) } : undefined}
					/>
				))}
			</frame>
		</frame>
	);
}
