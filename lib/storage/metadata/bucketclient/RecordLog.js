'use strict'; // eslint-disable-line

const http = require('http');
const stream = require('stream');
const url = require('url');

const errors = require('../../../errors');

class ListRecordStream extends stream.Transform {
    constructor(logger) {
        super({ objectMode: true });
        this.logger = logger;
        this.buffers = [];
    }

    _transform(data, encoding, callback) {
        this.buffers.push(data);
        callback();
    }

    _flush(callback) {
        const jsonContents = this.buffers.join('');
        const logArray = JSON.parse(jsonContents);
        logArray.forEach(item => {
            // log entries are serialized JSON objects, need to
            // deserialize first
            const itemObj = JSON.parse(item);
            itemObj.entries.forEach(entry => {
                // eslint-disable-next-line no-param-reassign
                entry.type = entry.type || 'put';
            });
            this.logger.debug('processing log item', { itemObj });
            this.push(itemObj);
        });
        this.push(null);
        this.buffers = undefined;
        callback();
    }
}


/**
 * @class
 * @classdesc Proxy object to access raft log API
 */
class RecordLogProxy {

    constructor(params) {
        this.url = params.url;
        this.logger = params.logger;
    }

    /**
     * Prune the oldest records in the record log
     *
     * Note: not implemented yet
     *
     * @param {Object} params - params object
     * @param {Function} cb - callback when done
     * @return {undefined}
     */
    pruneRecords(params, cb) {
        setImmediate(() => cb(errors.NotImplemented));
    }

    /**
     * Read a series of log records from raft
     *
     * @param {Object} [params] - params object
     * @param {Number} [params.startSeq] - fetch starting from this
     *   sequence number
     * @param {Number} [params.limit] - maximum number of log records
     *   to return
     * @return {undefined}
     */
    readRecords(params) {
        const recordStream = new ListRecordStream(this.logger);
        const urlObject = url.parse(this.url);
        if (params) {
            urlObject.query = {};
            if (params.startSeq !== undefined) {
                urlObject.query.start = params.startSeq;
            }
            if (params.limit !== undefined) {
                urlObject.query.limit = params.limit;
            }
        }
        const urlStr = url.format(urlObject);
        const req = http.request(urlStr);
        req.on('response', response => {
            response.on('error', err => {
                this.logger.error(
                    'Error fetching record log from metadata',
                    { error: err });
                recordStream.emit('error', err);
            });
            response.pipe(recordStream);
        });
        req.on('error', err => {
            this.logger.error(
                'Error sending record log request', { error: err });
            recordStream.emit('error', err);
        });
        req.end();
        return recordStream;
    }
}

module.exports = {
    RecordLogProxy,
};