const { AzureNamedKeyCredential, TableClient, odata } = require("@azure/data-tables");

const LastKeysStoragePartitionKey = 'LastKeysStorage';
const LastKeysStorageRowKey = 'Latest';

class PersistStorage {

    constructor(accountName, accountKey, tableName, entityName) {
        this.accountName = accountName;
        this.credential = new AzureNamedKeyCredential(accountName, accountKey);
        this.tableName = tableName;
        this.entityName = entityName.toString();
    }

    connect() {
        try {
            this.client = new TableClient(`https://${this.accountName}.table.core.windows.net/`, this.tableName, this.credential);
        } catch (err) {
            console.error('An error is detected on connection: [%s]', err);
        }
    }

    async storeData(data) {
        let result = undefined;
        if (this.client) {
            const newKeyValue = (await this.getLastKeyValue()) + 1;
            result = await this.client.createEntity({
                partitionKey: this.entityName,
                rowKey: '' + newKeyValue,
                payload: JSON.stringify(data)
            });
            await this.setLastKeyValue(newKeyValue);
        }
    }

    async getHistoryData(depthMinutes) {
        let result = undefined;
        if (this.client) {
            let filterDate = new Date(Date.now() - depthMinutes * 60 * 1000);
            const tableEntities = await this.client.listEntities({
                queryOptions: {
                    filter: odata`Timestamp ge datetime${filterDate.toJSON()} and PartitionKey eq ${this.entityName}`
                }
            });
            result = [];
            for await (const entity of tableEntities) {
                result.push(JSON.parse(entity.payload));
            }
            result.sort((a, b) => a.MessageDate > b.MessageDate ? 1 : -1);
            result = result.filter((item, i) => (i + 1) >= result.length ||
                (item.MessageDate != result[i + 1].MessageDate || item.DeviceId != result[i + 1].DeviceId));
        }
        return result;
    }

    async getLastKeyValue() {
        let result = 0;
        if (this.client) {
            let lastKeysEntity = await this.getSafeKeyHolderEntity();
            result = (lastKeysEntity || {})[this.entityName + 'Key'] || 0;
        }
        return result;
    }

    async setLastKeyValue(keyValue) {
        let result = undefined;
        if (this.client) {
            let lastKeysEntity = await this.getSafeKeyHolderEntity();
            lastKeysEntity[this.entityName + 'Key'] = keyValue;
            try {
                result = await this.client.upsertEntity(lastKeysEntity, 'Replace');
            } catch (err) {
                console.error('Some error has risen [%s]', err);
            }
        }
        return result && result.ETag;
    }

    async getSafeKeyHolderEntity() {
        let result = undefined;
        if (this.client) {
            try {
                result = await this.client.getEntity(LastKeysStoragePartitionKey, LastKeysStorageRowKey);
            } catch {
                result = {
                    partitionKey: LastKeysStoragePartitionKey,
                    rowKey: LastKeysStorageRowKey,
                };
            }
            if (!result[this.entityName + 'Key']) {
                result[this.entityName + 'Key'] = 0;
            }
        }
        return result;
    }
};

module.exports = PersistStorage;