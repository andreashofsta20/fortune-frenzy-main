import OpenAI from "openai";

let client: OpenAI;

async function runAssistant(content: string) {
	try {
		const thread = await client.beta.threads.create();
		const thread_id = thread.id;

		await client.beta.threads.messages.create(thread_id, {
			role: "user",
			content,
		});

		await client.beta.threads.runs.create(thread_id, {
			assistant_id: "asst_p2pE5zsiJ8kg1mZn2TVZmVRz",
		});

		const assistantResponse = await waitForAssistantResponse(thread_id);

		return assistantResponse;
	} catch (error) {
		console.error("Error during assistant interaction:", error);
	}
}

async function waitForAssistantResponse(thread_id: string) {
	let messages;
	while (true) {
		messages = await client.beta.threads.messages.list(thread_id);
		const assistantMessage = messages.data.find((msg) => msg.role === "assistant");

		if (assistantMessage && assistantMessage.content[0]) {
			return assistantMessage.content;
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

export async function getGrammarCorrectedString(
	content: string,
): Promise<{ message: string; professionalism_rating: number }> {
	if (!client) {
		client = new OpenAI({
			apiKey: process.env.OPENAI_KEY,
		});
	}

	const assistantResponse = await runAssistant(content);
	if (!assistantResponse || !assistantResponse[0])
		return {
			message: content,
			professionalism_rating: -1,
		};

	if (assistantResponse[0].type === "text") {
		return JSON.parse(assistantResponse[0].text.value);
	} else {
		return {
			message: content,
			professionalism_rating: -1,
		};
	}
}
