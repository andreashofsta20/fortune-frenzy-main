export interface Entry {
	id: string;
	chance: number;
	claimed: number;
}

function generateBasedOnChances(entries: Entry[], totalCount: number, id?: string): Entry[] {
	const entryCounts = entries.map((entry) => {
		const weightedCount = math.floor((entry.chance / 100) * totalCount);
		return math.max(weightedCount, 2);
	});

	const fullArray: Entry[] = [];
	entries.forEach((entry, index) => {
		for (let i = 0; i < entryCounts[index]; i++) {
			fullArray.push({ ...entry });
		}
	});

	function distributeWithoutConsecutive(array: Entry[]): Entry[] {
		const result: Entry[] = [];
		const remaining = [...array];

		while (remaining.size() > 0) {
			const lastAdded = result[result.size() - 1];
			const validChoices = remaining.filter((entry) => entry.id !== lastAdded?.id);
			const pool = validChoices.size() > 0 ? validChoices : remaining;
			const chosenIndex = math.floor(math.random() * pool.size());
			const chosen = pool[chosenIndex];
			result.push(chosen);

			let added = false;
			const newRemaining: Entry[] = [];
			for (const entry of remaining) {
				if (!added && entry.id === chosen.id) {
					added = true;
				} else {
					newRemaining.push(entry);
				}
			}

			remaining.clear();
			for (const entry of newRemaining) {
				remaining.push(entry);
			}
		}

		return result;
	}

	const distributedResult = distributeWithoutConsecutive(fullArray);

	if (distributedResult.size() > 15) {
		let hasEntry = false;
		for (let i = 15; i < distributedResult.size(); i++) {
			if (entries.some((e) => e.id === distributedResult[i].id)) {
				hasEntry = true;
				break;
			}
		}

		if (!hasEntry) {
			const randomEntry = entries[math.floor(math.random() * entries.size())];
			const insertIndex = math.floor(math.random() * (distributedResult.size() - 15)) + 15;
			const newDistributedResult: Entry[] = [];

			for (let i = 0; i < distributedResult.size(); i++) {
				if (i === insertIndex) {
					newDistributedResult.push({ ...randomEntry });
				}
				newDistributedResult.push(distributedResult[i]);
			}

			return newDistributedResult;
		}
	}

	if (id) {
		const targetEntry = entries.find((entry) => entry.id === id);
		if (targetEntry) {
			const insertionIndex = math.floor(math.random() * math.max(distributedResult.size() - 50, 1)) + 50;
			const newDistributedResult: Entry[] = [];

			for (let i = 0; i < distributedResult.size(); i++) {
				if (i === insertionIndex) {
					newDistributedResult.push({ ...targetEntry });
				}
				newDistributedResult.push(distributedResult[i]);
			}

			return newDistributedResult;
		}
	}

	return distributedResult;
}

export default generateBasedOnChances;
