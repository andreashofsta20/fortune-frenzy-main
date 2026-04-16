// forum + localStorage (kun vanlige a-z i funksjonsnavn sa ikke tegnkoding ødelegger)
(function () {
	"use strict";

	var lagringsNokkel = "skole_im1a_forum_v2";
	try {
		localStorage.removeItem("skole_im1a_forum_v1");
	} catch (e) {}

	function hentAltFraDisk() {
		try {
			var raw = localStorage.getItem(lagringsNokkel);
			if (!raw) return { threads: [] };
			var obj = JSON.parse(raw);
			return obj && Array.isArray(obj.threads) ? obj : { threads: [] };
		} catch (e) {
			return { threads: [] };
		}
	}

	function lagreTilDisk(data) {
		localStorage.setItem(lagringsNokkel, JSON.stringify(data));
	}

	function lagUnikId() {
		return "t-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
	}

	function finnTradMedId(liste, id) {
		for (var i = 0; i < liste.length; i++) {
			if (liste[i].id === id) return liste[i];
		}
		return null;
	}

	function hentAlleTrader() {
		var arr = hentAltFraDisk().threads.slice();
		arr.sort(function (a, b) {
			return new Date(b.createdAt) - new Date(a.createdAt);
		});
		return arr;
	}

	function hentTrad(id) {
		return finnTradMedId(hentAltFraDisk().threads, id);
	}

	function lagNyTradInnlegg(tittel, innlegg, hvem) {
		tittel = (tittel || "").trim();
		innlegg = (innlegg || "").trim();
		if (tittel.length < 2) {
			return { ok: false, msg: "Tittelen må være minst 2 tegn." };
		}
		if (innlegg.length < 1) {
			return { ok: false, msg: "Skriv litt tekst i innlegget." };
		}
		var alt = hentAltFraDisk();
		var ny = {
			id: lagUnikId(),
			title: tittel,
			body: innlegg,
			author: hvem,
			createdAt: new Date().toISOString(),
			replies: [],
		};
		alt.threads.push(ny);
		lagreTilDisk(alt);
		return { ok: true, thread: ny };
	}

	function skrivSvarPaTrad(tradId, tekst, hvem) {
		tekst = (tekst || "").trim();
		if (tekst.length < 1) {
			return { ok: false, msg: "Skriv et svar." };
		}
		var alt = hentAltFraDisk();
		var tr = finnTradMedId(alt.threads, tradId);
		if (!tr) {
			return { ok: false, msg: "Fant ikke tråden." };
		}
		if (!Array.isArray(tr.replies)) tr.replies = [];
		tr.replies.push({
			author: hvem,
			body: tekst,
			createdAt: new Date().toISOString(),
		});
		lagreTilDisk(alt);
		return { ok: true };
	}

	function visTidNorsk(iso) {
		try {
			var d = new Date(iso);
			return d.toLocaleString("nb-NO", {
				dateStyle: "short",
				timeStyle: "short",
			});
		} catch (e) {
			return iso;
		}
	}

	function slettAltLokalt() {
		try {
			localStorage.removeItem(lagringsNokkel);
			localStorage.removeItem("skole_im1a_forum_v1");
			return true;
		} catch (e) {
			return false;
		}
	}

	window.ForumGreier = {
		hentAlle: hentAlleTrader,
		hentTrad: hentTrad,
		lagNyTrad: function (tittel, innlegg, hvem) {
			if (!hvem || !String(hvem).trim()) hvem = "Anonym";
			return lagNyTradInnlegg(tittel, innlegg, String(hvem).trim());
		},
		skrivSvar: function (tradId, tekst, hvem) {
			if (!hvem || !String(hvem).trim()) hvem = "Anonym";
			return skrivSvarPaTrad(tradId, tekst, String(hvem).trim());
		},
		visTid: visTidNorsk,
		slettAlt: slettAltLokalt,
	};
})();
