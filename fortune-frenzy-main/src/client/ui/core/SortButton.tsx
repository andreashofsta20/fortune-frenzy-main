import React, { useState, useEffect } from "@rbxts/react";
import { useMotion } from "client/hooks/use-motion";
import { palette } from "client/utils/palette";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";

interface Props {
	size: UDim2;
	position: UDim2;
	typeface?: "Sans" | "Mono" | "Extended";
	weight?: "Light" | "Regular" | "Medium" | "SemiBold" | "Bold" | "ExtraBold";
	imageSize?: number;
	imagePadding?: number;
	textSize?: number;
	backgroundColor?: Color3;
	textColor?: Color3;
	layoutOrder?: number;
	pressDip?: number;
	options: Array<[string, string, number, string?, Color3?, Color3?]>; // [key, text, rotation, image?, backgroundColor?, textColor?]
	setSortOrder: React.Dispatch<React.SetStateAction<string>> | ((sortOrder: string) => void);

	event?: React.InstanceEvent<ImageButton>;
	change?: React.InstanceChangeEvent<ImageButton>;
	ref?: React.Ref<ImageButton>;
	current?: string;
}

export function SortButton({
	size,
	position,
	event,
	change,
	ref,
	typeface = "Sans",
	weight = "Regular",
	imageSize = 21,
	textSize = 18,
	imagePadding = 5,
	backgroundColor = palette.background3,
	textColor = palette.primaryText,
	layoutOrder,
	pressDip = 2,
	options,
	setSortOrder,
	current,
}: Props) {
	// Determine if we should use the dropdown approach (3+ options)
	const useDropdown = options.size() > 2;

	// Determine the index that corresponds to the provided current key (if any)
	const getIndexFromKey = (key?: string) => {
		if (key === undefined) return 0;
		const found = options.findIndex((opt) => opt[0] === key);
		return found !== -1 ? found : 0;
	};

	const [currentIndex, setIndex] = useState(() => getIndexFromKey(current));

	if (useDropdown) {
		// Transform SortButton option tuple into DropdownOption objects
		const dropdownOptions = options.map((opt) => ({
			key: opt[0],
			text: opt[1],
			image: opt[3],
			backgroundColor: opt[4] ?? backgroundColor,
			textColor: opt[5] ?? textColor,
		}));

		return (
			<Dropdown
				size={size}
				position={position}
				anchorPoint={new Vector2()}
				options={dropdownOptions}
				current={current ?? dropdownOptions[currentIndex].key}
				onSelect={(key) => {
					if (typeIs(setSortOrder, "function")) setSortOrder(key);
					// keep internal state in sync when uncontrolled
					setIndex(getIndexFromKey(key));
				}}
				typeface={typeface}
				weight={weight}
				imageSize={imageSize}
				imagePadding={imagePadding}
				textSize={textSize}
				backgroundColor={backgroundColor}
				textColor={textColor}
				layoutOrder={layoutOrder}
				pressDip={pressDip}
				zindex={20}
			/>
		);
	}

	// Existing 2-option toggle behaviour
	const [rotation, rotationMotion] = useMotion(0);

	// Keep the displayed option in sync when the externally controlled key changes
	useEffect(() => {
		if (current === undefined) return;
		const newIdx = getIndexFromKey(current);
		setIndex(newIdx);
		rotationMotion.spring(options[newIdx][2], { tension: 200, friction: 20 });
	}, [current]);

	const handleSortOrderChange = () => {
		const newIndex = (currentIndex + 1) % options.size();
		setIndex(newIndex);

		if (typeIs(setSortOrder, "function")) {
			setSortOrder(options[newIndex][0]);
		}

		rotationMotion.spring(options[newIndex][2], { tension: 200, friction: 20 });
	};

	return (
		<Button
			size={size}
			position={position}
			event={{
				...(event ?? {}),
				Activated: (...args) => {
					handleSortOrderChange();
					if (event?.Activated) event.Activated(...args);
				},
			}}
			change={change}
			ref={ref}
			typeface={typeface}
			weight={weight}
			imageSize={imageSize}
			imagePadding={imagePadding}
			image={options[currentIndex][3]}
			text={options[currentIndex][1]}
			textSize={textSize}
			imageRotation={rotation}
			backgroundColor={options[currentIndex][4] ?? backgroundColor}
			textColor={options[currentIndex][5] ?? textColor}
			layoutOrder={layoutOrder}
			pressDip={pressDip}
		/>
	);
}
