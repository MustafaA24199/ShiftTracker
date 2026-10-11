
function num(n) {
	var i = parseInt(n);
	return (Number.isNaN(i) ? 0 : i);
}

function change(id, n) {
	$(id).html(num(n).toLocaleString());
}

const PLANNER_INPUT_IDS = [
	"projected_volume",
	"desired_finish_time",
	"break_start_time",
	"break_duration_minutes",
	"total_volume",
	"manual_total_volume",
	"total_inducted_manual",
	"manual_total_inducted"
];

const PLANNER_STORAGE_PREFIX = "mustafaShiftTracker.";

function plannerStorageKey(id) {
	return `${PLANNER_STORAGE_PREFIX}${id}`;
}

function loadPersistedPlannerInputs() {
	PLANNER_INPUT_IDS.forEach(id => {
		const $field = $(`#${id}`);
		if (!$field.length) return;

		const savedValue = localStorage.getItem(plannerStorageKey(id));
		if (savedValue !== null) {
			$field.val(savedValue);
		}
	});
}

function savePersistedPlannerInput(id) {
	const $field = $(`#${id}`);
	if (!$field.length) return;

	localStorage.setItem(plannerStorageKey(id), $field.val());
}

function bindPersistedPlannerInputs() {
	PLANNER_INPUT_IDS.forEach(id => {
		const $field = $(`#${id}`);
		if (!$field.length) return;

		$field.on("input change keyup", () => {
			savePersistedPlannerInput(id);
		});
	});
}

function textNumber(selector) {
	return num($(selector).text().replace(/,/g, ""));
}

const cap = () => {
	const manualProjectedVolume = num($("#projected_volume").val());

	// If the user enters a projected volume, use that as the planning override.
	if (manualProjectedVolume > 0) return manualProjectedVolume;

	// If the projected volume field is blank, use Predicted Dispatch (LMCP) from the API/UI.
	const predictedDispatch = textNumber("#predicted_dispatch");
	return predictedDispatch || 0;
};

function clockTimeToDate(timeValue, baseDate) {
	if (!timeValue) return null;

	const [hour, minute] = timeValue.split(":").map(Number);
	const date = new Date(baseDate);
	date.setHours(hour, minute, 0, 0);
	return date;
}

function finishTimeToDate(timeValue, now) {
	const finish = clockTimeToDate(timeValue, now);
	if (!finish) return null;

	// If the selected finish time has already passed today, treat it as tomorrow.
	if (finish <= now) finish.setDate(finish.getDate() + 1);
	return finish;
}

function breakTimeToDate(timeValue, now, finish) {
	const breakStart = clockTimeToDate(timeValue, now);
	if (!breakStart || !finish) return null;

	// If the break start already passed, only treat it as tomorrow when the finish
	// time is also tomorrow and that future break still lands before the finish.
	if (breakStart <= now) {
		const tomorrowBreak = new Date(breakStart);
		tomorrowBreak.setDate(tomorrowBreak.getDate() + 1);
		if (tomorrowBreak > now && tomorrowBreak < finish) return tomorrowBreak;
	}

	return breakStart;
}

function minutesBetween(start, end) {
	return (end - start) / (1000 * 60);
}

function overlapMinutes(startA, endA, startB, endB) {
	const overlapStart = Math.max(startA.getTime(), startB.getTime());
	const overlapEnd = Math.min(endA.getTime(), endB.getTime());
	return Math.max((overlapEnd - overlapStart) / (1000 * 60), 0);
}

function addProductiveMinutes(start, productiveMinutesNeeded, breakStart, breakDurationMinutes) {
	let finish = new Date(start.getTime() + productiveMinutesNeeded * 60 * 1000);

	if (!breakStart || breakDurationMinutes <= 0) return finish;

	const breakEnd = new Date(breakStart.getTime() + breakDurationMinutes * 60 * 1000);

	// If we are currently inside the break, no packages move until the break ends.
	if (start >= breakStart && start < breakEnd) {
		return new Date(breakEnd.getTime() + productiveMinutesNeeded * 60 * 1000);
	}

	// If the predicted working time crosses a future break, add the break duration.
	if (start < breakStart && finish > breakStart) {
		finish = new Date(finish.getTime() + breakDurationMinutes * 60 * 1000);
	}

	return finish;
}

function formatClockTime(date) {
	let hours = date.getHours();
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const ampm = hours >= 12 ? "PM" : "AM";
	hours = hours % 12 || 12;
	return `${hours}:${minutes} ${ampm}`;
}

function updateFinishPlanner() {
	const projectedVolume = cap();
	const totalInducted = textNumber("#total_inducted");
	const actualInductFph = State?.inductRate || textNumber("#induct_rate_actual");
	const remainingVolume = Math.max(projectedVolume - totalInducted, 0);

	change("#planner_remaining_volume", remainingVolume);

	const now = new Date();
	const desiredFinishTime = $("#desired_finish_time").val();
	const finishTime = finishTimeToDate(desiredFinishTime, now);

	const breakStartInput = $("#break_start_time").val();
	const breakDurationMinutes = num($("#break_duration_minutes").val());
	const breakStart = breakTimeToDate(breakStartInput, now, finishTime);
	const breakEnd = breakStart ? new Date(breakStart.getTime() + breakDurationMinutes * 60 * 1000) : null;

	let totalMinutesLeft = finishTime ? minutesBetween(now, finishTime) : 0;
	let remainingBreakMinutes = 0;

	if (breakStart && breakEnd && breakDurationMinutes > 0 && finishTime) {
		remainingBreakMinutes = overlapMinutes(now, finishTime, breakStart, breakEnd);
	}

	const productiveMinutesLeft = Math.max(totalMinutesLeft - remainingBreakMinutes, 0);

	if (projectedVolume > 0 && remainingVolume > 0 && productiveMinutesLeft > 0) {
		const targetFph = Math.ceil(remainingVolume / (productiveMinutesLeft / 60));
		change("#planner_target_fph", targetFph);
	} else {
		$("#planner_target_fph").html("--");
	}

	if (remainingVolume > 0 && actualInductFph > 0) {
		const productiveMinutesNeeded = (remainingVolume / actualInductFph) * 60;
		const predictedFinish = addProductiveMinutes(now, productiveMinutesNeeded, breakStart, breakDurationMinutes);
		$("#planner_predicted_finish").html(formatClockTime(predictedFinish));
	} else {
		$("#planner_predicted_finish").html("--");
	}
}


async function update() {

	$("#loading").toggle();

	// fetch_sc2_planned()
	fetch_sc2_backlog()

	await Promise.all([
		fetch_sc2_received(),
		// fetch_sc2_stowed(),

		updatePlannedCount(),
		updateStowedCount(),

		fetch_sc2_fixit(),

		updateScanCompliance(),
		updateSortActual(),
		updateInductActual(),
		updateLineHauls(),

		updateWIP()
	])

	// updateWip();

	updateFinishPlanner();

	$("#loading").toggle();
}

var SC2, CYC

async function updateManualOverrides() {
	$("#manualStationCode").val(SC2.node);

	await updateManualCycleSelection(SC2.node);

	$("#manualStationCode").on("change", async () => updateManualCycleSelection($("#manualStationCode").val()));

	$("#manualUpdate").on("click", () => {
		const stationCode = $("#manualStationCode").val();
		const cycle = $("#manualCycleCode option:selected").text();
		const cycle_id = $("#manualCycleCode option:selected").val();
		updateManualCycleSelection(stationCode)
		updateSc2(stationCode, cycle, cycle_id);
	});
}

async function updateManualCycleSelection(station) {

	const selectBox = $("#manualCycleCode");
	selectBox.empty();

	let cycles = await getAllCycles(station);

	if (cycles.length < 1) {
		cycles = [
			{ "cycleId": "eeb34597-2386-4aa7-92a9-3918a2160dc1", "cycleName": "RTS_1" },
			{ "cycleId": "ce5d1e05-5d6f-4203-a867-b4eaa0554ccc", "cycleName": "RTS_2" },
			{ "cycleId": "e4ee0631-aa79-4fa9-a46d-ce5ced20214a", "cycleName": "CYCLE_0" },
			{ "cycleId": "dfc3989b-67cf-4005-ad2d-4049f56ba9e8", "cycleName": "CYCLE_1" },
			{ "cycleId": "478a0a92-b64f-454c-88bb-ef5b032e8e5b", "cycleName": "RECOVERY_1" },
			{ "cycleId": "7bbd531f-64c3-4ea9-8216-55a65cf0fbc0", "cycleName": "CRTN_PICKUP_1" },
			{ "cycleId": "e31a14cf-8b2e-45d7-a703-579d384ab10b", "cycleName": "AD_HOC_2" },
			{ "cycleId": "17344411-99c1-4530-bddc-bb950c8185b0", "cycleName": "RTS_3" },
			{ "cycleId": "a79ca9b1-77d1-4b2e-b5f9-9920d00ea145", "cycleName": "FER" },
			{ "cycleId": "34d64e17-3e72-45da-897b-036a06da6ff1", "cycleName": "AD_HOC_1" },
			{ "cycleId": "8cde3688-1a61-45e2-b9ef-72482bb9668d", "cycleName": "SAME_DAY" },
			{ "cycleId": "aca147f1-6766-4559-94a6-bc664cfd1c06", "cycleName": "AD_HOC_3" }
		];
	}

	const sortByName = (a, b) => a.cycleName.localeCompare(b.cycleName);
	cycles.sort(sortByName).map(cycle => selectBox.append($("<option>", { text: cycle.cycleName, value: cycle.cycleId })));
	$("#manualCycleCode").val(SC2.cycle_id);

}

function updateSc2(stationCode, cycle, cycle_id) {
	SC2 = {
		node: stationCode,
		cycle: cycle,
		cycle_id: cycle_id
	}

	CYC = {
		stationCode: SC2.node,
		cycleId: SC2.cycle
	}

	$("#sc2_node").html(SC2.node);
	$("#sc2_cycle").html(SC2.cycle);

	$("#better-dwelling").attr("href", `https://logistics.amazon.com/dwellings?start=0&station=${SC2.node}&cycle=${SC2.cycle}`);

	update();
}

async function initialize() {
	$("#loading").toggle();

	const stationCode = await getStationCode();
	const cycle = await getCurrentCycle();
	const cycle_id = await getCycleId(stationCode, cycle);

	$("#loading").toggle();

	updateSc2(stationCode, cycle, cycle_id);

	updateManualOverrides();
}

$(async () => {
	loadPersistedPlannerInputs();

	await initialize()

	bindPersistedPlannerInputs();

	//$("#reinitialize").click(initialize)
	$("#projected_volume, #desired_finish_time, #break_start_time, #break_duration_minutes, #total_volume, #manual_total_volume, #total_inducted_manual, #manual_total_inducted").on("change keyup input", update);
	window.setInterval(update, 30 * 1000);

})
