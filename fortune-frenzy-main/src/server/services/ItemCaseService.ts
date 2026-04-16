import { Service, OnInit, OnStart } from "@flamework/core";
import { Request } from "server/util/packeter";
import { setDecimalPlaces } from "shared/util/number-utils";
import { Case, CasesResponse, OpenCaseResponse } from "typings/APIResponses";
import { ItemManagementService } from "./ItemManagementService";
import { PlayerManagementService } from "./PlayerManagementService";
import { Events } from "server/network";
import log from "shared/util/log";
import { CommerceService } from "./CommerceService";
import { MarketplaceService } from "@rbxts/services";

@Service()
export class ItemCaseService implements OnStart {
	constructor(
		private ItemManagementService: ItemManagementService,
		private PlayerManagementService: PlayerManagementService,
		private CommerceService: CommerceService,
	) {}

	public Cases = new Map<string, Case>();
	private caseOpenCount = new Map<string, number>(); // Key format: "userId:caseId"
	private lastLuckyRoll = new Map<string, number>(); // Key format: "userId:caseId", Value: number of opens since last lucky roll
	private pendingDevProducts = new Map<Player, [string, boolean]>();
	private readonly CLEANUP_INTERVAL = 300; // 5 minutes in seconds

	async onStart() {
		const start_time = tick();
		log("warn", "⌛ [ItemCaseService] Starting...");
		await this.refreshCases();

		task.spawn(() => {
			while (task.wait(this.CLEANUP_INTERVAL)) {
				this.cleanupCaseOpenCount();
			}
		});

		game.GetService("Players").PlayerRemoving.Connect((player: Player) => this.handlePlayerLeave(player));
		log("print", `✅ [ItemCaseService] Started in ${setDecimalPlaces(tick() - start_time)}ms`);
	}

	private cleanupCaseOpenCount() {
		const currentPlayers = new Set(
			game
				.GetService("Players")
				.GetPlayers()
				.map((p: Player) => tostring(p.UserId)),
		);
		const keysToRemove: string[] = [];

		this.caseOpenCount.forEach((_, key) => {
			const [userId] = key.split(":");
			if (!currentPlayers.has(userId)) {
				keysToRemove.push(key);
			}
		});

		keysToRemove.forEach((key) => {
			this.caseOpenCount.delete(key);
			this.lastLuckyRoll.delete(key);
		});
	}

	private handlePlayerLeave(player: Player) {
		const userId = tostring(player.UserId);
		const userIdPrefix = `${userId}:`;
		this.caseOpenCount.forEach((_, key) => {
			if (key.match(`^${userIdPrefix}`)[0]) {
				this.caseOpenCount.delete(key);
				this.lastLuckyRoll.delete(key);
			}
		});
	}

	async refreshCases() {
		const cases_response = await new Request("GET", "/cases").GetResponse<CasesResponse>();

		if (!cases_response.Success || !cases_response.Response?.data) {
			log(
				"warn",
				`[ItemCaseService] Failed to refresh cases (Success=${cases_response.Success}, Code=${cases_response.Code})`,
			);
			task.delay(5, () => {
				this.refreshCases().catch((e) => warn("[ItemCaseService] refreshCases retry failed:", e));
			});
			return;
		}

		this.Cases.clear();
		const response = cases_response.Response;
		for (const item of response.data) {
			this.Cases.set(item.id, item);
		}

		// Tell all connected clients about the new cases
		Events.CaseUpdate.broadcast(response.data);

		// Re-register developer product callbacks for the refreshed cases
		this.CommerceService.registerDevProductFunction(
			response.data.map((item) => tonumber(item.dev_product) ?? 0),
			(player, productId, purchased, profile) => {
				if (purchased) {
					let caseId = response.data.find((item) => tonumber(item.dev_product) === productId)?.id;
					if (!caseId) {
						const pending = this.pendingDevProducts.get(player);
						const pendingCase = pending ? this.Cases.get(pending[0]) : undefined;
						if (pending && tonumber(pendingCase?.dev_product) === productId) {
							caseId = pending[0];
						}
					}
					if (!caseId) return;
					this.pendingDevProducts.set(player, [caseId, true]);
				} else {
					this.pendingDevProducts.delete(player);
				}
			},
		);

		// Schedule the next automatic refresh based on the soonest next_rotation value
		let earliestRotation: number | undefined;
		for (const [, caseData] of this.Cases) {
			const dt = DateTime.fromIsoDate(caseData.next_rotation);
			if (dt) {
				const ts = dt.UnixTimestamp;
				if (earliestRotation === undefined || ts < earliestRotation) earliestRotation = ts;
			}
		}

		if (earliestRotation !== undefined) {
			const delaySeconds = math.max(0, earliestRotation - os.time());
			task.delay(delaySeconds + 1, () => this.refreshCases());
		}
	}

	private openCaseStatuses = new Map<Player, string>();
	async openCase(
		player: Player,
		case_id: string,
		flag?: "lucky" | "robux",
	): Promise<{ status: "error" | "success"; message?: string; code?: number | string }> {
		if (this.openCaseStatuses.has(player)) return { status: "error", message: "You are already opening a case" };
		const case_data = this.Cases.get(case_id);
		if (!case_data) return { status: "error", message: "Invalid case" };

		const vipStatus = await this.CommerceService.isSubscribed(player, "VIP");
		if (case_data.vip_only === true && !vipStatus.isSubscribed) {
			return { status: "error", message: "VIP subscription required for this case" };
		}

		if (flag === "robux") {
			const devProductId = tonumber(case_data.dev_product) ?? 0;
			if (devProductId <= 0) {
				this.openCaseStatuses.delete(player);
				return { status: "error", message: "This case is not available for Robux opening" };
			}

			const pending = this.pendingDevProducts.get(player);
			if (pending) return { status: "error", message: "You are already opening a case" };
			this.pendingDevProducts.set(player, [case_id, false]);
			MarketplaceService.PromptProductPurchase(player, devProductId);

			let polling = true;
			let confirmed = false;
			const maxWaitSec = 170;
			let waited = 0;
			while (polling && waited < maxWaitSec) {
				task.wait(1);
				waited++;
				const pending = this.pendingDevProducts.get(player);
				if (!pending) {
					polling = false;
					confirmed = false;
					continue;
				}

				if (pending[1] === true) {
					polling = false;
					confirmed = true;
					continue;
				}
			}

			if (waited >= maxWaitSec) {
				this.pendingDevProducts.delete(player);
				return { status: "error", message: "Purchase confirmation timed out" };
			}

			if (!confirmed) return { status: "error", message: "You did not confirm the purchase" };
			this.pendingDevProducts.delete(player);
		}

		this.openCaseStatuses.set(player, "opening");
		try {
			const case_data = this.Cases.get(case_id);
			if (!case_data) {
				this.openCaseStatuses.delete(player);
				return { status: "error", message: "Invalid case" };
			}

			const online_profile = await this.PlayerManagementService.getOnlineProfile(player);
			if (!online_profile) {
				this.openCaseStatuses.delete(player);
				return { status: "error", code: 404 };
			}

			if (online_profile.Data.Cash < case_data.price && flag !== "robux") {
				this.openCaseStatuses.delete(player);
				return { status: "error", code: 403 };
			}

			const userId = player.UserId;
			const countKey = `${userId}:${case_id}`;
			const currentCount = this.caseOpenCount.get(countKey) ?? 0;
			const hasLuckyGamepass = await this.CommerceService.hasGamepass(player, "LUCKY_ITEMS");

			let isLuckyCase = false;
			if (flag === "lucky") {
				const diamondsPrice = math.max(10, math.ceil(case_data.price / 5000));
				if (diamondsPrice > 0 && online_profile.Data.Gems >= diamondsPrice) {
					isLuckyCase = true;
				}
			} else if (hasLuckyGamepass) {
				isLuckyCase = (currentCount + 1) % 5 === 0;
			} else {
				const opensSinceLastLucky = this.lastLuckyRoll.get(countKey) ?? 15;
				if (opensSinceLastLucky >= 20 && math.random() <= 0.2) {
					isLuckyCase = true;
					this.lastLuckyRoll.set(countKey, 0);
				} else {
					this.lastLuckyRoll.set(countKey, opensSinceLastLucky + 1);
				}
			}

			const cashTransactionId = await this.PlayerManagementService.addCash(
				player,
				flag === "robux" ? 0 : -case_data.price,
				{
					transactionType: Enum.AnalyticsEconomyTransactionType.Gameplay.Name,
					stockKeepingUnit: `ItemCase`,
				},
			);

			let diamondsTransactionId: string | undefined;
			if (flag === "lucky") {
				const diamondsPrice = math.max(10, math.ceil(case_data.price / 5000));
				if (diamondsPrice > 0) {
					diamondsTransactionId = await this.PlayerManagementService.addDiamonds(player, -diamondsPrice, {
						transactionType: Enum.AnalyticsEconomyTransactionType.Gameplay.Name,
						stockKeepingUnit: `ItemCase`,
					});
				}
			}

			const request = await new Request(`POST`, `/cases/open/${case_id}`, undefined, {
				user_id: tostring(player.UserId),
				lucky: flag === "lucky",
				vip_subscribed: vipStatus.isSubscribed,
			}).GetResponse();

			const response = request.Response as OpenCaseResponse;

			if (!request.Success || !response || !response.result) {
				log("warn", `[ItemCaseService] openCase failed: player=${player.UserId}, case_id=${case_id}, code=${request.Code}, error=${response?.error}`);
				this.PlayerManagementService.rollbackAddCash(cashTransactionId);
				if (diamondsTransactionId) this.PlayerManagementService.rollbackAddDiamonds(diamondsTransactionId);
				this.openCaseStatuses.delete(player);
				return { status: "error", code: request.Code };
			}

			this.caseOpenCount.set(countKey, currentCount + 1);
			this.PlayerManagementService.refreshInventory(player, 5);
			this.Cases.set(response.case.id, response.case);
			log("info", `[ItemCaseService] openCase success: player=${player.UserId}, case_id=${case_id}, wonItem=${response.result.id}`);
			Events.CaseUpdate.broadcast([response.case]);
			const ico = await this.CommerceService.hasGamepass(player, "INSTANT_CASE_OPENING");
			let speed = ico ? 1 : 5;
			if (flag === "lucky") speed = 5;

			task.delay(speed, () => this.openCaseStatuses.delete(player));
			this.PlayerManagementService.confirmAddCash(cashTransactionId);
			if (diamondsTransactionId) this.PlayerManagementService.confirmAddDiamonds(diamondsTransactionId);

			const wonItem = this.ItemManagementService.ItemInfo.get(response.result.id);
			const wonItemName = wonItem?.name ?? "an item";
			this.PlayerManagementService.recordMinigamePlay(
				player,
				"Item Cases",
				case_data.price,
				`Opened ${case_data.id} and won ${wonItemName}`,
			);

			return { status: "success", code: 200, message: `${response.result.id}|${speed}|${isLuckyCase}` };
		} catch (error) {
			this.openCaseStatuses.delete(player);
			return { status: "error", message: "Unexpected error occurred" };
		}
	}
}
