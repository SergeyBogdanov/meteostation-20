$(document).ready(() => {

    function convertToMmHg(value) {
        let result = value;
        if ($.isNumeric(value)) {
            result = value / 133.3223684;
        }
        return result;
    }

    function generateTableRow(data) {
        const $row = $('<tr/>');
        $row.append($('<td/>').text((data.MessageDate || '').toString()));
        $row.append($('<td/>').text(data.DeviceId));
        $row.append($('<td/>').addClass('number').text(data.IotData.temp_internal));
        $row.append($('<td/>').addClass('number').text(data.IotData.humidity_internal));
        $row.append($('<td/>').addClass('number').text(convertToMmHg(data.IotData.pressure_internal)));
        return $row;
    }

    function displayHistoryData(data) {
        if (Array.isArray(data)) {
            console.log(data);
            $('table#historyData>tbody>tr').remove();
            const $tableBody = $('table#historyData>tbody');
            for (const entity of data) {
                $tableBody.append(generateTableRow(entity));
            }
        }
    }

    function requestHistoryData(periodStartMs, periodEndMs) {
        const normalizedStartMs = periodStartMs < periodEndMs ? periodStartMs : periodEndMs;
        const normalizedEndMs = periodStartMs < periodEndMs ? periodEndMs : periodStartMs;
        $.ajax({ url: `/history/${(normalizedEndMs - normalizedStartMs) / (60 * 1000)}` }).done(displayHistoryData);
    }

    requestHistoryData(Date.now() - (24 * 60 * 60 * 1000), Date.now());
});