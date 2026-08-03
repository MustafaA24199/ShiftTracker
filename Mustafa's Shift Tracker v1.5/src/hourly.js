$(async () => {
	const oneMinute = 60 * 1000
	const hours = [2, 3, 4, 5, 6, 7, 8]
	const minutes = [30]

	const $hourly = $("#hourly_tracker")

	const resetIf = () => {
		const lastUpdate = $hourly.data("last_update")

		if (lastUpdate === undefined) return

		const now = new Date()
		const previous = new Date(lastUpdate)

		if (
			now.getDate() !== previous.getDate() ||
			(now.getHours() - previous.getHours()) > 7
		) {
			$hourly.empty()
		}
	}

	window.setInterval(async () => {
		const now = new Date()

		if (
			hours.includes(now.getHours()) &&
			minutes.includes(now.getMinutes())
		) {
			await update()

			const hourly = {
				time: now.getHours() + ":" + now.getMinutes(),
				atStation: $("#AT_STATION").html(),
				readyForDeparture: $("#STOWED").html(),
				totalInducted: $("#total_inducted").html()
			}

			resetIf()

			$hourly.append(`
				<tr>
				  <th scope="row">${hourly.time}</th>
				  <td class="text-end">${hourly.atStation}</td>
				  <td class="text-end">${hourly.readyForDeparture}</td>
				  <td class="text-end">${hourly.totalInducted}</td>
				</tr>
			`)

			$hourly.data("last_update", now.getTime())
		}
	}, oneMinute)
})