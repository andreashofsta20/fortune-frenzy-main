import React, { useRef, useEffect, useMemo } from "@rbxts/react";

interface Props extends React.PropsWithChildren {
	viewportProps: Partial<JSX.IntrinsicElements["viewportframe"]>;
	cameraProps: Partial<JSX.IntrinsicElements["camera"]>;
}

export function ViewportWithCamera({ viewportProps, cameraProps, children }: Props) {
	const viewportRef = useRef<ViewportFrame>();
	const camera = useMemo(() => new Instance("Camera"), []);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		camera.Parent = viewport;
		viewport.CurrentCamera = camera;

		return () => {
			camera.Destroy();
		};
	}, [camera, viewportRef]);

	useEffect(() => {
		for (const [key, value] of pairs(cameraProps)) {
			if (camera[key as keyof Camera]) {
				(camera as unknown as { [k: string]: unknown })[key as string] = value;
			}
		}
	}, [cameraProps]);

	return (
		<viewportframe ref={viewportRef} {...viewportProps}>
			{children}
		</viewportframe>
	);
}
