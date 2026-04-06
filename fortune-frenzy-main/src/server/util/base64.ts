function toBase64(data: string): string {
	const b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	return (
		(
			data.gsub(".", (x) => {
				let r = "";
				const byte = string.byte(x)[0];
				for (let i = 8; i >= 1; i--) {
					r += (byte % 2 ** i) - (byte % 2 ** (i - 1)) > 0 ? "1" : "0";
				}
				return r;
			})[0] + "0000"
		).gsub("%d%d%d?%d?%d?%d?", (x) => {
			if (x.size() < 6) return "";
			let c = 0;
			for (let i = 1; i <= 6; i++) {
				c += x.sub(i, i) === "1" ? 2 ** (6 - i) : 0;
			}
			return b.sub(c + 1, c + 1);
		})[0] + ["", "==", "="][data.size() % 3]
	);
}

function fromBase64(data: string): string {
	const b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	data = data.gsub(`[^${b}=]`, "")[0];
	return data
		.gsub(".", (x) => {
			if (x === "=") return "";
			let r = "";
			const f = b.find(x)[0]! - 1;
			for (let i = 6; i >= 1; i--) {
				r += (f % 2 ** i) - (f % 2 ** (i - 1)) > 0 ? "1" : "0";
			}
			return r;
		})[0]
		.gsub("%d%d%d?%d?%d?%d?%d?%d?", (x) => {
			if (x.size() !== 8) return "";
			let c = 0;
			for (let i = 1; i <= 8; i++) {
				c += x.sub(i, i) === "1" ? 2 ** (8 - i) : 0;
			}
			return string.char(c);
		})[0];
}

export default function Base64(data: string, method: "encode" | "decode") {
	switch (method) {
		case "encode":
			return toBase64(data);
		case "decode":
			return fromBase64(data);
	}
}
