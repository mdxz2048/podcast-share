const apiBase = process.env.WORKER_API_BASE_URL ?? "http://api:4000";
const tickIntervalMs = Number(process.env.WORKER_TICK_INTERVAL_MS ?? 60000);

async function tickSchedules() {
	try {
		const res = await fetch(`${apiBase}/internal/schedules/tick`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: "{}"
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(`[worker] schedule tick failed: ${res.status} ${text}`);
			return;
		}

		const json = await res.json();
		console.log(`[worker] schedule tick ok: checked=${json.checked}, triggered=${json.triggered}, failed=${json.failed}`);
	} catch (error) {
		console.error("[worker] schedule tick error", error);
	}
}

console.log(`[worker] started, apiBase=${apiBase}, intervalMs=${tickIntervalMs}`);
void tickSchedules();
setInterval(() => {
	void tickSchedules();
}, tickIntervalMs);
