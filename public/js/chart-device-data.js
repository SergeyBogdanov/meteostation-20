/* eslint-disable max-classes-per-file */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
$(document).ready(() => {
  // if deployed to a site supporting SSL, use wss://
  const protocol = document.location.protocol.startsWith('https') ? 'wss://' : 'ws://';
    let webSocket = null;//new WebSocket(protocol + location.host);

  // A class for holding the last N points of telemetry for a device
  class DeviceData {
    constructor(deviceId) {
      this.deviceId = deviceId;
      this.maxLen = 50;
      this.timeData = new Array(this.maxLen);
      this.temperatureData = new Array(this.maxLen);
      this.humidityData = new Array(this.maxLen);
      this.pressureData = new Array(this.maxLen);
    }

    addData(time, temperature, humidity, pressure) {
      this.timeData.push(time);
      this.temperatureData.push(temperature);
      this.humidityData.push(humidity || null);
      this.pressureData.push(pressure);

      if (this.timeData.length > this.maxLen) {
        this.timeData.shift();
        this.temperatureData.shift();
        this.humidityData.shift();
        this.pressureData.shift();
      }
    }
  }

  // All the devices in the list (those that have been sending telemetry)
  class TrackedDevices {
    constructor() {
      this.devices = [];
    }

    // Find a device based on its Id
    findDevice(deviceId) {
      for (let i = 0; i < this.devices.length; ++i) {
        if (this.devices[i].deviceId === deviceId) {
          return this.devices[i];
        }
      }

      return undefined;
    }

      addDevice(deviceId) {
          const newDeviceData = new DeviceData(deviceId);
          this.devices.push(newDeviceData);
          return newDeviceData;
      }

    getDevicesCount() {
      return this.devices.length;
    }
  }

    const trackedDevices = new TrackedDevices();

    function generateDatasetDescription(label, fillcolor, backgroundColor) {
        return {
            fill: false,
            label: label,
            yAxisID: label,
            borderColor: fillcolor,
            pointBoarderColor: fillcolor,
            backgroundColor: backgroundColor,
            pointHoverBackgroundColor: fillcolor,
            pointHoverBorderColor: fillcolor,
            spanGaps: true,
        };
    }

  // Define the chart axes
  const chartData = {
      datasets: [
          generateDatasetDescription('Temperature', 'rgba(255, 204, 0, 1)', 'rgba(255, 204, 0, 0.4)'),
          generateDatasetDescription('Humidity', 'rgba(24, 120, 240, 1)', 'rgba(24, 120, 240, 0.4)')
    ]
  };

  const chartOptions = {
    scales: {
      yAxes: [{
        id: 'Temperature',
        type: 'linear',
        scaleLabel: {
          labelString: 'Temperature (ºC)',
          display: true,
        },
        position: 'left',
        ticks: {
          suggestedMin: 0,
          suggestedMax: 100,
          beginAtZero: true
        }
      },
      {
        id: 'Humidity',
        type: 'linear',
        scaleLabel: {
          labelString: 'Humidity (%)',
          display: true,
        },
        position: 'right',
        ticks: {
          suggestedMin: 0,
          suggestedMax: 100,
          beginAtZero: true
        }
      }]
    }
  };

  const secondChartData = {
      datasets: [
          generateDatasetDescription('Pressure', 'rgba(255, 128, 0, 1)', 'rgba(255, 128, 0, 0.4)')
    ]
  };

  const secondChartOptions = {
    scales: {
      yAxes: [{
        id: 'Pressure',
        type: 'linear',
        scaleLabel: {
          labelString: 'Pressure (mm Hg)',
          display: true,
        },
        position: 'left',
//        ticks: {
//          suggestedMin: 700,
//          suggestedMax: 790,
//          //beginAtZero: true
//        }
      }]
    }
  };

  // Get the context of the canvas element we want to select
  const ctx = document.getElementById('iotChart').getContext('2d');
  const myLineChart = new Chart(
    ctx,
    {
      type: 'line',
      data: chartData,
      options: chartOptions,
      });

  const ctxPressure = document.getElementById('pressureChart').getContext('2d');
  const pressureChart = new Chart(
      ctxPressure,
    {
      type: 'line',
        data: secondChartData,
        options: secondChartOptions,
    });

  // Manage a list of devices in the UI, and update which device data the chart is showing
  // based on selection
  let needsAutoSelect = true;
  const deviceCount = document.getElementById('deviceCount');
  const listOfDevices = document.getElementById('listOfDevices');
  function OnSelectionChange() {
    const device = trackedDevices.findDevice(listOfDevices[listOfDevices.selectedIndex].text);
    chartData.labels = device.timeData;
    chartData.datasets[0].data = device.temperatureData;
    chartData.datasets[1].data = device.humidityData;
    myLineChart.update();
    secondChartData.labels = device.timeData;
    secondChartData.datasets[0].data = device.pressureData;
    pressureChart.update();
  }
    listOfDevices.addEventListener('change', OnSelectionChange, false);

    function storeDeviceData(deviceData, messageData) {
        deviceData.addData(messageData.MessageDate, messageData.IotData.temp_internal, messageData.IotData.humidity_internal, (messageData.IotData.pressure_internal / 133.3223684));
    }

    function addDataPoint(messageData) {
        // find or add device to list of tracked devices
        const existingDeviceData = trackedDevices.findDevice(messageData.DeviceId);

        if (existingDeviceData) {
            storeDeviceData(existingDeviceData, messageData);
        } else {
            const newDeviceData = trackedDevices.addDevice(messageData.DeviceId);
            const numDevices = trackedDevices.getDevicesCount();
            deviceCount.innerText = numDevices === 1 ? `${numDevices} device` : `${numDevices} devices`;
            storeDeviceData(newDeviceData, messageData);

            // add device to the UI list
            const node = document.createElement('option');
            const nodeText = document.createTextNode(messageData.DeviceId);
            node.appendChild(nodeText);
            listOfDevices.appendChild(node);

            // if this is the first device being discovered, auto-select it
            if (needsAutoSelect) {
                needsAutoSelect = false;
                listOfDevices.selectedIndex = 0;
                OnSelectionChange();
            }
        }
    }

    function setUpWebSocket() {
        webSocket = new WebSocket(protocol + location.host);

        // When a web socket message arrives:
        // 1. Unpack it
        // 2. Validate it has date/time and temperature
        // 3. Find or create a cached device to hold the telemetry data
        // 4. Append the telemetry data
        // 5. Update the chart UI
        webSocket.onmessage = function onMessage(message) {
            try {
                const messageData = JSON.parse(message.data);
                console.log(messageData);

                // time and either temperature or humidity are required
                if (!messageData.MessageDate || (!messageData.IotData.temp_internal && !messageData.IotData.humidity_internal)) {
                    return;
                }

                addDataPoint(messageData);

                myLineChart.update();
                pressureChart.update();
            } catch (err) {
                console.error(err);
            }
        };
        webSocket.onclose = () => {
            console.log('The WebSocket just closed. Trying to reopen');
            setUpWebSocket();
        };
    }
    setUpWebSocket();

    function displayHistoryData(dataArray) {
        if (Array.isArray(dataArray)) {
            for (const data of dataArray) {
                addDataPoint(data);
            }
            myLineChart.update();
            pressureChart.update();
        }
    }

    function requestHistoryData() {
        $.ajax({ url: `/history/${24 * 60}` }).done(displayHistoryData);
    }

    requestHistoryData();
});
