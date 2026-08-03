const State = {
	inductRate: 0,
	sortRate: 0
};

const PROXY_API_GATEWAY_URL = "https://logistics.amazon.ca/station/proxyapigateway/data";

let bosonApiUsageKey = null;
let bosonApiUsageKeyPromise = null;

const basicRequestHeaders = {
	"Accept": "*/*",
	"Accept-Language": "en-US,en;q=0.5",
	"Content-Type": "application/json",
	"X-Requested-With": "XMLHttpRequest"
};

function normalizeResourcePath(resourcePath) {
	return String(resourcePath || "").replace(/^\/+/, "");
}

function extractBosonApiUsageKey(responseText) {
	if (!responseText) return null;

	const patterns = [
		/boson\.apiUsageKey["']?\s*,\s*["']([^"']+)["']/i,
		/["']boson\.apiUsageKey["']\s*:\s*["']([^"']+)["']/i,
		/apiUsageKey["']?\s*[:=,]\s*["']([^"']+)["']/i
	];

	for (const pattern of patterns) {
		const match = responseText.match(pattern);
		if (match && match[1]) return match[1];
	}

	return null;
}

async function getBosonApiUsageKey(forceRefresh = false) {
	if (bosonApiUsageKey && !forceRefresh) return bosonApiUsageKey;
	if (bosonApiUsageKeyPromise && !forceRefresh) return bosonApiUsageKeyPromise;

	bosonApiUsageKeyPromise = (async () => {
		try {
			await fetch("https://midway-auth.amazon.com", {
				method: "GET",
				credentials: "include"
			}).catch(err => {
				console.warn("[Shift Tracker] Midway preflight warning:", err);
			});

			const warmupResponse = await fetch("https://logistics.amazon.ca/station/dashboard/ageing", {
				method: "GET",
				credentials: "include",
				cache: "no-store"
			});

			const responseText = await warmupResponse.text();
			const apiUsageKey = extractBosonApiUsageKey(responseText);

			if (apiUsageKey) {
				console.log("[Shift Tracker] Boson API usage key found.");
				bosonApiUsageKey = apiUsageKey;
				return apiUsageKey;
			}

			console.warn("[Shift Tracker] Boson API usage key not found. Continuing without key.");
			bosonApiUsageKey = "";
			return "";
		} catch (err) {
			console.error("[Shift Tracker] Failed to initialize Boson auth:", err);
			bosonApiUsageKey = "";
			return "";
		} finally {
			bosonApiUsageKeyPromise = null;
		}
	})();

	return bosonApiUsageKeyPromise;
}

async function bosonProxyRequest({ resourcePath, httpMethod = "post", processName, requestBody }, retry = true) {
	const apiUsageKey = await getBosonApiUsageKey(false);
	const headers = { ...basicRequestHeaders };

	if (apiUsageKey) {
		headers["x-api-usage-key"] = apiUsageKey;
		headers["x-api-key"] = apiUsageKey;
	}

	const payload = {
		resourcePath: normalizeResourcePath(resourcePath),
		httpMethod,
		processName,
		requestBody
	};

	try {
		return await $.ajax({
			url: PROXY_API_GATEWAY_URL,
			headers,
			method: "POST",
			contentType: "application/json",
			dataType: "json",
			xhrFields: {
				withCredentials: true
			},
			data: JSON.stringify(payload)
		});
	} catch (err) {
		const status = err?.status;
		const responseText = err?.responseText || "";

		console.error("[Shift Tracker] Boson proxy request failed:", {
			status,
			resourcePath: payload.resourcePath,
			processName,
			responseText: responseText.slice(0, 500)
		});

		if (retry && [400, 401, 403, 404].includes(status)) {
			console.warn("[Shift Tracker] Refreshing Boson API key and retrying:", payload.resourcePath);
			await getBosonApiUsageKey(true);
			return bosonProxyRequest({ resourcePath, httpMethod, processName, requestBody }, false);
		}

		throw err;
	}
}

async function getStationCode() {
	const success = r => r.match(/option value="([\w]{4,})" selected/)?.at(1);
	return $.get("https://logistics.amazon.ca/station/dashboard/overviewv2", "html").then(success);
}

async function getAllCycles(stationCode) {
	const success = r => r.cycleInfoList;
	return new Promise((resolve, reject) => {
		$.get("https://logistics.amazon.ca/station/station-plan/data", { stationCode }, "json")
			.then(success)
			.then(resolve)
			.catch(() => resolve([]));
	});
}

async function getCurrentCycle() {
	const success = r => r.currentCycle;
	return $.get("https://logistics.amazon.ca/station/dashboard/nextcycle/data", "json").then(success);
}

async function getCycleId(stationCode, cycle) {
	const success = r => r.cycleInfoList.find(c => c.cycleName == cycle).cycleId;
	return $.get("https://logistics.amazon.ca/station/station-plan/data", { stationCode }, "json").then(success);
}

function getMetricTrend(oldValue, newValue) {
	if (newValue > oldValue) {
		return '<sup class="text-success">&#9650;</sup>';
	} else if (oldValue > newValue) {
		return '<sup class="text-danger">&#9660;</sup>';
	} else {
		return '';
	}
}

async function updateWIP() {
	let wipUpper, wipLower, wipCurrent;

	const success = () => {
		const $wip = $("#wip");
		const tooltip = `Target: ${wipLower}/${wipUpper}`;

		$wip.removeClass("text-success").removeClass("text-danger");

		$wip.html(`
			<span data-bs-toggle="tooltip" data-bs-title="${tooltip}">
				${wipCurrent}
			</span>
		`);

		if (wipCurrent > wipUpper || wipCurrent < wipLower) {
			$wip.addClass("text-danger");
		} else {
			$wip.addClass("text-success");
		}

		$(".tooltip").hide();
		$('[data-bs-toggle="tooltip"]').tooltip({ html: false });
	};

	const wipTargets = r => {
		wipUpper = parseInt(r?.[0]?.targetMap?.STOW_WIP_UPPER ?? 15);
		wipLower = parseInt(r?.[0]?.targetMap?.STOW_WIP_LOWER ?? 30);
	};

	const wipActual = r => {
		wipCurrent = parseInt(r?.value ?? "?");
	};

	const payload = {
		stationCode: SC2.node,
		planIdentifier: "GLOBAL"
	};

	return Promise.all([
		$.get("https://logistics.amazon.ca/station/flow/station-target/data", payload, "json").then(wipTargets),
		$.get("https://logistics.amazon.ca/station/flow/stow-wip/data", CYC, "json").then(wipActual),
	]).then(success);
}

async function updateSortActual() {
	const success = r => {
		const fph = parseInt(r.value);
		const trend = getMetricTrend(State.sortRate, fph);

		$("#sort_rate_actual").html(`${trend}${fph.toLocaleString()}`);
		State.sortRate = fph;
	};

	return $.get("https://logistics.amazon.ca/station/flow/sort/data", CYC, "json").then(success);
}

async function updateInductActual() {
	const success = r => {
		const fph = parseInt(r.value);
		const trend = getMetricTrend(State.inductRate, fph);

		$("#induct_rate_actual").html(`${trend}${fph.toLocaleString()}`);
		State.inductRate = fph;
	};

	return $.get("https://logistics.amazon.ca/station/flow/induct/data", CYC, "json").then(success);
}

async function updateScanCompliance() {
	const success = r => $("#scan_compliance").html(r[0].metricValue);
	return $.get("https://logistics.amazon.ca/station/pulse-metric/flow_scan_compliance/data", CYC, "json").then(success);
}

async function updateStowedCount() {
	const success = r => change("#STOWED", r.groupedPackageMetrics.Total.currentStowedCount);

	const r = await bosonProxyRequest({
		resourcePath: "svs/packages/metrics",
		httpMethod: "post",
		processName: "stow",
		requestBody: {
			filters: {
				NODE: [SC2.node],
				CYCLE: [SC2.cycle]
			},
			groupBy: "NONE",
			metrics: [
				"CURRENT_STOWED_COUNT",
				"CURRENT_STOW_BUFFERED_COUNT"
			]
		}
	});

	success(r);
}

const LineHaulStatus = {
	PENDING_DEPART: '<image height="20px" width="25px" src="/icons/truck-loading.png">',
	ARRIVED: '<image height="20px" width="25px" src="/icons/green-checkmark.png">',
	IN_TRANSIT: '<image height="20px" width="25px" src="/icons/IN_TRANSIT.png">'
};

async function updateLineHauls() {
	const truncate = (s, n = 10) => (s.length > n) ? s.slice(0, n - 1) + '&hellip;' : s;

	const success = r => {
		const $linehauls = $('#linehauls tbody');
		$linehauls.html('');

		const runs = (r.lineHauls || []).sort((a, b) => {
			return new Date(a.lineHaulTime.plannedTime) - new Date(b.lineHaulTime.plannedTime);
		});

		for (const run of runs) {
			const d = new Date(run.lineHaulTime.plannedTime);
			const addZero = d => d < 10 ? `0${d}` : `${d}`;
			const orZero = n => n < 1 ? "-" : n.toLocaleString();

			$linehauls.append(`
				<tr>
					<td class="align-middle">${LineHaulStatus[run.lineHaulStatus] || ""}</td>
					<th>
						${truncate(run.origin)}
						<a href="https://trans-logistics.amazon.com/fmc/execution/search/${run.lineHaulId}">
							<pre class="mb-0">${run.lineHaulId}</pre>
						</a>
					</th>
					<th class="align-middle text-end">${orZero(run.volume)}</th>
					<th class="align-middle text-end">${addZero(d.getHours())}:${addZero(d.getMinutes())}</th>
				</tr>
			`);
		}
	};

	const r = await bosonProxyRequest({
		resourcePath: "ivs/getNodeLineHaulList",
		httpMethod: "post",
		processName: "induct",
		requestBody: {
			nodeId: SC2.node,
			groupBy: ""
		}
	});

	success(r);
}

async function updatePlannedCount() {
	const success = r => change("#current_cycle_planned", r.groupedPackageMetrics[SC2.node].plannedCount);

	const r = await bosonProxyRequest({
		resourcePath: "svs/packages/metrics",
		httpMethod: "post",
		processName: "stow",
		requestBody: {
			filters: {
				NODE: [SC2.node],
				CYCLE_ID: [SC2.cycle_id]
			},
			groupBy: "NODE",
			metrics: [
				"PLANNED_COUNT"
			]
		}
	});

	success(r);
}

async function fetch_sc2_received() {
	const rdata = await bosonProxyRequest({
		resourcePath: "ivs/getPackageMetric",
		httpMethod: "post",
		processName: "induct",
		requestBody: {
			nodeId: SC2.node,
			filters: {
				Cycle: [SC2.cycle]
			},
			groupBy: "Node",
			metricList: [
				"CURRENT_CYCLE_RECEIVED",
				"OTHER_CYCLE_RECEIVED",
				"UNPLANNED_CURRENT_CYCLE_INDUCTED",
				"PENDING_DEPART_FROM_UPSTREAM",
				"PENDING_DEPART_FROM_UPSTREAM_UNPLANNED",
				"IN_TRANSIT_FROM_UPSTREAM",
				"IN_TRANSIT_FROM_UPSTREAM_UNPLANNED",
				"PENDING_INDUCT",
				"PENDING_INDUCT_UNPLANNED",
				"PENDING_RE_INDUCT",
				"PENDING_RE_INDUCT_UNPLANNED",
				"INDUCTED_AT_STATION",
				"PLANNED_MANIFESTED",
				"PLANNED_CURRENT_CYCLE_INDUCTED",
				"SIDELINE"
			]
		}
	});

	const fdata = id => rdata?.groupedPackageMetrics?.[id]?.[SC2.node] ?? 0;

	const received = {
		AT_STATION: fdata("INDUCTED_AT_STATION"),
		PENDING_DEPART: fdata("PENDING_DEPART_FROM_UPSTREAM"),
		PLANNED_MANIFESTED: fdata("PLANNED_MANIFESTED"),
		SIDELINE: fdata("SIDELINE"),
		CURRENT_CYCLE_RECEIVED: fdata("CURRENT_CYCLE_RECEIVED"),
		OTHER_CYCLE_RECEIVED: fdata("OTHER_CYCLE_RECEIVED"),
		UNPLANNED_CURRENT_CYCLE_INDUCTED: fdata("UNPLANNED_CURRENT_CYCLE_INDUCTED"),
		PLANNED_CURRENT_CYCLE_INDUCTED: fdata("PLANNED_CURRENT_CYCLE_INDUCTED"),
		PENDING_INDUCT: fdata("PENDING_INDUCT") + fdata("PENDING_INDUCT_UNPLANNED")
	};

	const total_arrived = received.CURRENT_CYCLE_RECEIVED + received.OTHER_CYCLE_RECEIVED;
	const total_inducted = received.UNPLANNED_CURRENT_CYCLE_INDUCTED + received.PLANNED_CURRENT_CYCLE_INDUCTED;

	change("#AT_STATION", received.AT_STATION);
	change("#arrived_sidelined", received.SIDELINE);
	change("#predicted_dispatch", received.PLANNED_MANIFESTED);
	change("#total_inducted", total_inducted);
	change("#total_arrived_actual", total_arrived);

	if (received.PENDING_INDUCT > 0) {
		change("#pending_induct", received.PENDING_INDUCT);
	} else if (typeof cap === "function" && cap() > 0) {
		change("#pending_induct", Math.max(cap() - total_inducted, 0));
	}
}

async function fetch_sc2_fixit() {
	const qdate = (h, m, s) => {
		const d = new Date();

		d.setUTCHours(h);
		d.setUTCMinutes(m);
		d.setUTCSeconds(s);
		d.setUTCMilliseconds(0);

		return d.getTime() / 1000;
	};

	const qstart = qdate(0, 30, 0);
	const qstop = qdate(16, 0, 0);

	const rdata = await bosonProxyRequest({
		resourcePath: "nevs/nevs/getExceptionShipments",
		httpMethod: "post",
		processName: "exceptions",
		requestBody: {
			categories: [
				"STOW_SCANNED_TO_PROBLEM_SOLVE_BIN",
				"STOW_WRONG_AISLE_CLUSTER",
				"STOW_DAMAGED",
				"STOW_MISSING",
				"PICK_MISSING",
				"PICK_DAMAGED",
				"CUSTOMER_CANCELED",
				"CUSTOMER_RESCHEDULED",
				"CUSTOMER_ADDRESS_CHANGE",
				"PACKAGE_ROUTE_INVALID",
				"DAMAGED_PACKAGE",
				"CUBE_OUT",
				"PICK_SCANNED_TO_PROBLEM_SOLVE_BIN",
				"DRIVER_LEFT_BEHIND",
				"MISSORT",
				"DRIVER_REJECTED",
				"MISSING",
				"DAMAGED_LABEL",
				"WRONG_CARRIER",
				"WRONG_STATION_SAME_CITY",
				"PICK_LEFT_BEHIND",
				"DISPATCH_LEFT_BEHIND",
				"WRONG_PLANNED_STATION"
			],
			startDate: qstart,
			endDate: qstop,
			shipmentDetailsRequired: false,
			targetStatus: "OPEN",
			stationCode: SC2.node
		}
	});

	const fixit = rdata?.exceptionShipments?.length ?? 0;
	change("#fixit_queue", fixit);
}

async function fetch_sc2_backlog() {
	const rdata = await bosonProxyRequest({
		resourcePath: "svs/packages/metrics",
		httpMethod: "post",
		processName: "stow",
		requestBody: {
			groupBy: "CLUSTER",
			filters: {
				NODE: [SC2.node],
				DRS: ["FALSE"],
				CYCLE: [SC2.cycle],
				CYCLE_ID: [SC2.cycle_id]
			},
			metrics: [
				"MINUTES_OF_WORK",
				"STOW_RATE",
				"SCAN_COMPLIANCE",
				"PROBLEM_SOLVE_COUNT",
				"PLANNED_COUNT",
				"STOW_VS_PLAN",
				"STOWED_COUNT",
				"CURRENT_INDUCTED_COUNT"
			],
			isAggregationRequired: true
		}
	});

	const $backlog = $('#backlog_clusters tbody');
	$backlog.html('');

	console.log("[Shift Tracker] Backlog response:", rdata);

	for (const [key, v] of Object.entries(rdata.groupedPackageMetrics || {})) {
		if (v.currentInductedCount === 0) continue;

		$backlog.append(`
			<tr>
				<th class="text-center" scope="row">${key}</th>
				<td class="text-end">${v.currentInductedCount.toLocaleString()}</td>
				<td class="text-end">${v.minutesOfWork.toFixed(1)}</td>
				<td class="text-end">${v.scanCompliance.toFixed(2)}</td>
			</tr>
		`);
	}
}