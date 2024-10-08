const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const superagent = require('superagent');
const EventHubReader = require('./scripts/event-hub-reader.js');
const PersistStorage = require('./scripts/persist-storage');

const iotHubConnectionString = process.env.IotHubConnectionString;
if (!iotHubConnectionString) {
  console.error(`Environment variable IotHubConnectionString must be specified.`);
  return;
}
console.log(`Using IoT Hub connection string [${iotHubConnectionString}]`);

const eventHubConsumerGroup = process.env.EventHubConsumerGroup;
if (!eventHubConsumerGroup) {
  console.error(`Environment variable EventHubConsumerGroup must be specified.`);
  return;
}
console.log(`Using event hub consumer group [${eventHubConsumerGroup}]`);

const storageAccountName = process.env.StorageAccountName;
if (!storageAccountName) {
    console.error(`Environment variable StorageAccountName must be specified.`);
    return;
}

const storageAccountKey = process.env.StorageAccountAccessKey;
if (!storageAccountKey) {
    console.error(`Environment variable StorageAccountAccessKey must be specified.`);
    return;
}
console.log(`Using storage [${storageAccountName}], [${storageAccountKey}]`);

const eventRelyServerUrl = process.env.EventRelayServerPingAddress;
if (!eventRelyServerUrl) {
    console.error(`Environment variable EventRelayServerPingAddress must be specified.`);
//    return;
}
console.log(`Using event relay server on [${eventRelyServerUrl}]`);

const storage = new PersistStorage(storageAccountName, storageAccountKey, 'MeteostationMessages', 'MeteoData');
storage.connect();

async function respondHistoryData(req, res, next) {
    let historyDepthMin = parseInt(req.params.depth) || 0;
    let historicalData = await storage.getHistoryData(historyDepthMin);
    res.json(historicalData || []);
}

async function respondDeepHistoryData(req, res, next) {
    const historyFrom = parseInt(req.params.from) || 0;
    const historyTo = parseInt(req.params.to) || 0;
    let historicalData = undefined;
    if (historyFrom && historyTo) {
        historicalData = await storage.getDeepHistoryData(historyFrom, historyTo);
    }
    res.json(historicalData || []);
}

let lastPingRelayServerTime = 0;

function makePingRelayServer() {
    const isPingPossible = !!eventRelyServerUrl;
    if (isPingPossible) {
        superagent.get(eventRelyServerUrl)
            .query({ issued: Date.now() })
            .end((err) => {
                console.log(`Ping event relay server [${eventRelyServerUrl}] is completed`);
                if (!err) {
                    lastPingRelayServerTime = Date.now();
                }
            });
    }
    return isPingPossible;
}

function pingRelayServer(req, res, next) {
    const pingSent = makePingRelayServer() ? 'yes' : 'no';
    res.send(`Ping operation is completed. Ping request has sent: ${pingSent}`);
}

// Redirect requests to the public subdirectory to the root
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/history/:depth', respondHistoryData);
app.get('/deep_history/:from-:to', respondDeepHistoryData);
app.get('/ping_relay', pingRelayServer);
app.use((req, res /* , next */) => {
  res.redirect('/');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        console.log(`Broadcasting data ${data}`);
        client.send(data);
      } catch (e) {
        console.error(e);
      }
    }
  });
};

server.listen(process.env.PORT || '3000', () => {
  console.log('Listening on %d.', server.address().port);
});

const eventHubReader = new EventHubReader(iotHubConnectionString, eventHubConsumerGroup);

(async () => {
  await eventHubReader.startReadMessage((message, date, deviceId) => {
    try {
      const payload = {
        IotData: message,
        MessageDate: date || Date.now().toISOString(),
        DeviceId: deviceId,
      };

      wss.broadcast(JSON.stringify(payload));
      //storage.storeData(payload);
    } catch (err) {
      console.error('Error broadcasting: [%s] from [%s].', err, message);
    }
  });
})().catch();

makePingRelayServer();
setInterval(() => {
    if ((Date.now() - lastPingRelayServerTime) > 2.5 * 60 * 1000) {
        makePingRelayServer();
    }
}, 3 * 60 * 1000);