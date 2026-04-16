import { getMariaConnection } from "../services/mariaService.js";

const misc = [
	{ primary: "rbxassetid://15807807517", secondary: "rbxassetid://16301287999", colour: "#8585a5" },
	{ primary: "rbxassetid://15798873667", secondary: "rbxassetid://16301286870", colour: "#a262a5" },
	{ primary: "rbxassetid://15798906620", secondary: "rbxassetid://16301286347", colour: "#a54c4d" },
	{ primary: "rbxassetid://15800082300", secondary: "rbxassetid://16301285796", colour: "#814ba3" },
	{ primary: "rbxassetid://15800099099", secondary: "rbxassetid://16301285182", colour: "#46a566" },
	{ primary: "rbxassetid://15800151046", secondary: "rbxassetid://16301284803", colour: "#6d529d" },
	{ primary: "rbxassetid://15800171273", secondary: "rbxassetid://16301284324", colour: "#54a044" },
	{ primary: "rbxassetid://15800196659", secondary: "rbxassetid://16301283938", colour: "#4b8b9b" },
	{ primary: "rbxassetid://15800221411", secondary: "rbxassetid://16301283554", colour: "#a03b83" },
	{ primary: "rbxassetid://15800256140", secondary: "rbxassetid://16301283113", colour: "#53509f" },
	{ primary: "rbxassetid://15800299961", secondary: "rbxassetid://16301282541", colour: "#a5858a" },
	{ primary: "rbxassetid://15800317702", secondary: "rbxassetid://16301281925", colour: "#534545" },
	{ primary: "rbxassetid://15800343558", secondary: "rbxassetid://16301281534", colour: "#8b8b8b" },
	{ primary: "rbxassetid://15800356195", secondary: "rbxassetid://16301280992", colour: "#ba3838" },
	{ primary: "rbxassetid://15800387846", secondary: "rbxassetid://16301280449", colour: "#6b70a0" },
];

export default async function generateCase(tier: string) {
	const connection = await getMariaConnection("Game1");

	// Fetch current ui_data values in use
	const existingUiData = await connection.query("SELECT ui_data FROM cases");
	const usedUiData = existingUiData.map((row: any) => JSON.stringify(row.ui_data));

	// Filter out misc items already in use
	const availableMisc = misc.filter((item) => !usedUiData.includes(JSON.stringify(item)));

	// If all misc items are used, return null or handle the shortage
	if (availableMisc.length === 0) {
		connection.release();
		throw new Error("No unique UI data available.");
	}

	const [caseData] = await connection.query("SELECT * FROM cases WHERE id = ?", [tier]);
	if (!caseData) {
		connection.release();
		return null;
	}

	const price = caseData.price;
	const rows = await connection.query("SELECT id, value FROM items WHERE value > ? AND value < ?", [
		price / 2.5,
		price * 3,
	]);
	const amount_of_items_in_case = 10

	let items = [];
	let items_with_higher_value = rows.filter((item: any) => item.value >= price);

	for (let i = 0; i < Math.min(items_with_higher_value.length, Math.floor(amount_of_items_in_case / 2)); i++) {
		let item = items_with_higher_value[Math.floor(Math.random() * items_with_higher_value.length)];
		items.push(item);
	}

	for (let i = items.length; i < amount_of_items_in_case; i++) {
		let item = rows[Math.floor(Math.random() * rows.length)];
		items.push(item);
	}

	items = items.sort(() => Math.random() - 0.5);
	const offset = price / 1.4;
	const adjustedValues = items.map((item) => 1 / Math.exp(item.value / offset));
	const totalAdjustedValue = adjustedValues.reduce((acc, value) => acc + value, 0);

	let chances = adjustedValues.map((adjustedValue) => adjustedValue / totalAdjustedValue);
	let case_items = items.map((item, i) => ({
		id: `${item.id}`,
		chance: Math.max(Number((chances[i] * 100).toFixed(3)), 0.01),
	}));

	// Select a random ui_data from the available options
	const ui_data = availableMisc[Math.floor(Math.random() * availableMisc.length)];

	const res = await connection.query("UPDATE cases SET items = ?, ui_data = ?, next_rotation = ? WHERE id = ?", [
		JSON.stringify(case_items),
		JSON.stringify(ui_data),
		new Date(Date.now() + 1000 * 60 * 60 * 24 * 3), // 3 days
		tier,
	]);

	connection.release();
	console.log(res);

	return case_items;
}
