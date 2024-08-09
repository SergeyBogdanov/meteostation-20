$(document).ready(() => {

    function padStringLeft(str, padSymbol, paddedLength) {
        str = (str || '').toString();
        while (str.length < paddedLength) {
            str = padSymbol + str;
        }
        return str;
    }

    function convertDateToString(date) {
        return `${date.getFullYear()}-${padStringLeft(date.getMonth() + 1, '0', 2)}-${padStringLeft(date.getDate(), '0', 2)}`;
    }

    function convertStringToDate(stringDate) {
        const dateNumber = Date.parse(stringDate);
        return $.isNumeric(dateNumber) ? new Date(dateNumber) : new Date();
    }

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
        $.ajax({ url: `/deep_history/${normalizedStartMs}-${normalizedEndMs}` }).done(displayHistoryData);
    }

    function makeHistoryDataRequest() {
        const fromDate = convertStringToDate($('#fromDate').val());
        const toDate = new Date(convertStringToDate($('#toDate').val()).getTime() + (24 * 60 * 60 * 1000));
        requestHistoryData(fromDate.getTime(), toDate.getTime());
    }

    $('#fromDate').val(convertDateToString(new Date(Date.now() - (24 * 60 * 60 * 1000))));
    $('#toDate').val(convertDateToString(new Date()));
    $('#makeRequest').click(makeHistoryDataRequest);

    makeHistoryDataRequest(); //
});