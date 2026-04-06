export function calculateLevelXP(xp: number): {
	current_level: number;
	xp_to_next_level: number;
	xp_next_level: number;
	progress: number;
} {
	// Define the cubic function coefficients
	const a = 1.6667;
	const b = 22.5;
	const c = 75.8333;

	// Define the root-finding functions
	const f = (x: number) => a * math.pow(x, 3) + b * math.pow(x, 2) + c * x - xp;
	const df = (x: number) => 3 * a * math.pow(x, 2) + 2 * b * math.pow(x, 1) + c;

	// Initial guess for root
	let x0 = xp / 100;
	let x1 = x0 - f(x0) / df(x0);

	// Iterate to find root (current_level)
	for (let i = 0; i < 10; i++) {
		x0 = x1;
		x1 = x0 - f(x0) / df(x0);
		if (math.abs(f(x1)) < 1e-6) break;
	}
	const current_level = math.round(x1);

	// Calculate XP for next level
	const next_level = current_level + 1;
	const xp_next_level = a * math.pow(next_level, 3) + b * math.pow(next_level, 2) + c * next_level;

	// XP required to reach current level
	const prev_level_xp = a * math.pow(current_level, 3) + b * math.pow(current_level, 2) + c * current_level;
	const xp_to_next_level = xp_next_level - prev_level_xp;

	// Calculate progress percentage
	let progress = ((xp - prev_level_xp) / xp_to_next_level) * 100;
	progress = math.min(progress, 100);
	progress = math.max(progress, 0);

	return {
		current_level: current_level,
		xp_to_next_level: xp_to_next_level,
		xp_next_level: xp_next_level,
		progress: progress,
	};
}
