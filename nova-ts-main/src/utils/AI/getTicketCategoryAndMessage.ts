import OpenAI from "openai";

let client: OpenAI;

async function runAssistant(content: string) {
	console.log("Running assistant with content:", content);
	try {
		const thread = await client.beta.threads.create();
		const thread_id = thread.id;

		await client.beta.threads.messages.create(thread_id, {
			role: "user",
			content,
		});

		await client.beta.threads.runs.create(thread_id, {
			assistant_id: "asst_nEqlB2LTdlhuugLUXwQYNtk9",
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

export async function getTicketCategoryAndMessage(
	content: string,
): Promise<{ category: string; message: string; title: string }> {
	if (!client) {
		client = new OpenAI({
			apiKey: process.env.OPENAI_KEY,
		});
	}

	const assistantResponse = await runAssistant(content);
	console.log("Assistant response:", assistantResponse);
	if (!assistantResponse || !assistantResponse[0])
		return {
			message:
				"You will now be redirected to the general support team, and you can expect a response within 24 to 72 hours. Please ensure that your DMs are open to receive updates from our team.",
			category: "general_support",
			title: "General Support",
		};

	if (assistantResponse[0].type === "text") {
		return JSON.parse(assistantResponse[0].text.value);
	} else {
		return {
			message:
				"You will now be redirected to the general support team, and you can expect a response within 24 to 72 hours. Please ensure that your DMs are open to receive updates from our team.",
			category: "general_support",
			title: "General Support",
		};
	}
}
