(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const DEFAULT_DATA_CONNECTION_RECEIVER = 'dcr';

    const RequestType = Object.freeze({
        Read: 1,
        Write: 2,
        Subscribe: 3,
        Unsubscribe: 4,
        Notify: 5
    });

    class ServerDataConnection {
        constructor(receiver) {
            this._connection = connection;
            this._receiver = receiver ?? DEFAULT_DATA_CONNECTION_RECEIVER;
            this._subscribers = {};
            connection.Register(this._receiver, (data, onResponse, onError) => {
                switch (data.type) {
                    case RequestType.Notify:
                        const subscriber = this._subscribers[data.key];
                        if (subscriber) {
                            subscriber();
                        }
                        break;
                }
            });
        }

        Read(key, onResponse, onError) {
            this._connection.Send(this._receiver, { type: RequestType.Read, key }, onResponse, onError);
        }

        Write(key, value) {
            this._connection.Send(this._receiver, { type: RequestType.Write, key, value });
        }

        Subscribe(key, subscriber) {
            if (typeof key !== 'string') {
                throw new Error(`Invalid subscription key type: ${(typeof key)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for subscription key ${key} is not a function`);
            } else if (this._subscribers[key] !== undefined) {
                throw new Error(`Key ${key} is already subscribed`);
            }
            this._subscribers[key] = subscriber;
            this._connection.Send(this._receiver, { type: RequestType.Subscribe, key });
        }

        Unsubscribe(key, subscriber) {
            if (typeof key !== 'string') {
                throw new Error(`Invalid unsubscription key type: ${(typeof key)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for unsubscription key ${key} is not a function`);
            } else if (this._subscribers[key] === undefined) {
                throw new Error(`Key ${key} is already subscribed`);
            } else if (this._subscribers[key] !== subscriber) {
                throw new Error(`Unexpected subscriber for key ${key} to unsubscribe`);
            }
            delete this._subscribers[key];
            this._connection.Send(this._receiver, { type: RequestType.Unsubscribe, key });
        }
    }

    class ClientDataConnection {
        constructor(connection, receiver) {
            this._connection = connection;
            this._receiver = receiver ?? DEFAULT_DATA_CONNECTION_RECEIVER;
            this._subscribers = {};
            connection.Register(this._receiver, (data, onResponse, onError) => {
                switch (data.type) {
                    case RequestType.Notify:
                        const subscriber = this._subscribers[data.key];
                        if (subscriber) {
                            subscriber();
                        }
                        break;
                }
            });
        }

        Read(key, onResponse, onError) {
            this._connection.Send(this._receiver, { type: RequestType.Read, key }, onResponse, onError);
        }

        Write(key, value) {
            this._connection.Send(this._receiver, { type: RequestType.Write, key, value });
        }

        Subscribe(key, subscriber) {
            if (typeof key !== 'string') {
                throw new Error(`Invalid subscription key type: ${(typeof key)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for subscription key ${key} is not a function`);
            } else if (this._subscribers[key] !== undefined) {
                throw new Error(`Key ${key} is already subscribed`);
            }
            this._subscribers[key] = subscriber;
            this._connection.Send(this._receiver, { type: RequestType.Subscribe, key });
        }

        Unsubscribe(key, subscriber) {
            if (typeof key !== 'string') {
                throw new Error(`Invalid unsubscription key type: ${(typeof key)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for unsubscription key ${key} is not a function`);
            } else if (this._subscribers[key] === undefined) {
                throw new Error(`Key ${key} is already subscribed`);
            } else if (this._subscribers[key] !== subscriber) {
                throw new Error(`Unexpected subscriber for key ${key} to unsubscribe`);
            }
            delete this._subscribers[key];
            this._connection.Send(this._receiver, { type: RequestType.Unsubscribe, key });
        }
    }

    if (isNodeJS) {
        module.exports = { ServerDataConnection };
    } else {
        root.ClientDataConnection = ClientDataConnection;
    }
}(globalThis));
