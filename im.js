(function(Strophe, undefined) {
'use strict';

var N = function() {};

var BOSH_SERVICE = 'http://www.xxx.com/http-bind';
var BOSH_NODE = '@xxx.com';

/**
 * IM main class
 * 
 * @class IM
 * @param {String} token The token after user authenticated.
 * @constructor
 * @example
 *     var key = '464400014128';
 *     var secret = 'fzv3h2v5aso26yjh6tv3qlh6fysfpx8w';
 *     var IM = new Service.IM(key, secret);
 */
var IM = function(key, secret, token) {
    this._connection = new Strophe.Connection(BOSH_SERVICE);

    this._roster = this._connection.roster;
    this._messaging = this._connection.Messaging;
    this._vcard = this._connection.vCard;

    this._jid = null;
    this._token = token;
};

/**
The connection status.

-   ConnectStatus.ERROR
-   ConnectStatus.CONNECTING
-   ConnectStatus.CONNFAIL
-   ConnectStatus.AUTHENTICATING
-   ConnectStatus.AUTHFAIL
-   ConnectStatus.CONNECTED
-   ConnectStatus.DISCONNECTED
-   ConnectStatus.DISCONNECTING
-   ConnectStatus.ATTACHED

@property ConnectStatus
@type Integer
**/
IM.prototype.ConnectStatus = Strophe.Status;

/**
The authenticate status.

-   AuthStatus.OK
-   AuthStatus.UNKOWN_ERROR
-   AuthStatus.HTTP_REQUIRED
-   AuthStatus.PARAM_REQUIRED
-   AuthStatus.DATA_ERROR
-   AuthStatus.DB_ERROR
-   AuthStatus.USER_NOT_ACTIVATED
-   AuthStatus.USER_REGISTERED
-   AuthStatus.USER_NOT_EXIST
-   AuthStatus.USER_ALREDY_ACTIVE
-   AuthStatus.ACTIVATION_CODE_INVALID
-   AuthStatus.ACTIVATION_CODE_EXPIRED
-   AuthStatus.AUTH_ERROR
-   AuthStatus.TOKEN_INVALID
-   AuthStatus.TOKEN_VALIDATION_FAIL
-   AuthStatus.CONNECT_AUTH_ERROR
-   AuthStatus.USER_CANCEL_CONNECT

@property AuthStatus
@type Integer
**/
IM.prototype.AuthStatus = {
    OK:                      0,
    UNKOWN_ERROR:            1,
    HTTP_REQUIRED:           2,
    PARAM_REQUIRED:          3,
    DATA_ERROR:              4,
    DB_ERROR:                5,
    USER_NOT_ACTIVATED:      10,
    USER_REGISTERED:         11,
    USER_NOT_EXIST:          12,
    USER_ALREDY_ACTIVE:      13,
    ACTIVATION_CODE_INVALID: 14,
    ACTIVATION_CODE_EXPIRED: 15,
    AUTH_ERROR:              16,
    TOKEN_INVALID:           17,
    TOKEN_VALIDATION_FAIL:   18,
    CONNECT_AUTH_ERROR:      20,
    USER_CANCEL_CONNECT:     21
};

IM.prototype._getJid = function(email, callback, errorCallback) {
    var jid, $self = this;
    callback = callback || N;
    errorCallback = errorCallback || N;

    if (jid = this._getLocJid(email)) { callback({ status: this.AuthStatus.OK, data: { msgerid: jid } }); return; }

    account.getMsgerId(this._token, email,
        function(result) {
            if (result.data.msgerid) result.data.msgerid += BOSH_NODE;
            callback(result);
        },
    'json');
};

IM.prototype._getLocJid = function(email) {
    var roster, jid;
    roster = this._getRoster();
    $.each(roster, function(index, value) {
        if (value.EMAIL === email) jid = value.JID;
    });
    return jid;
};

IM.prototype._getLocEmail = function(locJid) {
    var roster, email;
    roster = this._getRoster();
    $.each(roster, function(index, value) {
        if (value.JID === locJid) email = value.EMAIL;
    });
    return email;
};

IM.prototype._getLocVCard = function(locJid) {
    var roster, vCard;
    roster = this._getRoster();
    $.each(roster, function(index, value) {
        if (value.JID === locJid) vCard = value;
    });
    return vCard;
};

IM.prototype._getVcard = function(jid, callback) {
    var vCard;
    callback = callback || N;
    if (vCard = this._getLocVCard(jid)) { callback(vCard); return; }
    this._vcard.get(jid, function(result) {
        callback(result);
    });
    //this._vcard.get(jid, callback);
};

IM.prototype._addRoster = function(user) {
    var roster;
    roster = this._getRoster();
    roster.push(user);
    this._setRoster(roster);
};

IM.prototype._getRoster = function() {
    var jid, email, roster = [];
    if (!this._jid) return roster;
    jid = Strophe.MD5.hexdigest('Enterprise' + this._jid.split('@')[0]).toLocaleUpperCase();
    if (!localStorage[jid]) return roster;
    roster = JSON.parse(localStorage[jid]).roster;
    return roster;
};

IM.prototype._setRoster = function(roster) {
    var jid;
    if (!this._jid) return;
    jid = Strophe.MD5.hexdigest('Enterprise' + this._jid.split('@')[0]).toLocaleUpperCase();
    localStorage[jid] = JSON.stringify({ roster: roster });
};

/**
 * Starts the connection process.
 * As the connection process proceeds, the user supplied callback will be triggered multiple times with status updates.      
 * The callback should take two arguments - the status code and the error condition.
 * The status code will be one of the values in the IM.Status constants.  The error condition will be one of the  *  * conditions defined in RFC 3920 or the condition ‘strophe-parsererror’.
 * Please see XEP 124 for a more detailed explanation of the optional parameters below.
 * 
 * @method connect
 * @param {string} email The user’s email.
 * @param {string} pass The user’s password.
 * @param {Callback} [callback] The connect callback function.
 * @param {Integer} callback.ConnectStatus
 * @param {Integer} wait The optional HTTPBIND wait value.  This is the time the server will wait before returning an empty result for a request.  The default setting of 60 seconds is recommended.  Other settings will require tweaks to the Strophe.TIMEOUT value.
 * @param {Integer} hold The optional HTTPBIND hold value.  This is the number of connections the server will hold at one time.  This should almost always be set to 1 (the default).
**/
IM.prototype.connect = function(email, pass, callback, wait, hold) {
    var $self = this;
    pass = Strophe.MD5.hexdigest(pass + 'Enterprise').toLocaleUpperCase();
    callback = callback || N;
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._jid = result.data.msgerid;
            $self._connection.connect($self._jid, pass, function(status) {
                if (status === $self.ConnectStatus.CONNECTED) {
                    $self._connection.send(Strophe.$pres().tree());
                }
                callback(status);
            }, wait, hold);
        } else {
            callback($self.ConnectStatus.AUTHFAIL);
        }
    });
};

/**
 * Start the graceful disconnection process.
 * This function starts the disconnection process.  This process starts by sending unavailable presence and sending BOSH body of type terminate.  A timeout handler makes sure that disconnection happens even if the BOSH server does not respond.
 * The user supplied connection callback will be notified of the progress as this process happens.
 * 
 * @method disconnect
**/
IM.prototype.disconnect = function() {
    this._connection.disconnect();
};

/**
 * Get the friends roster.
 * 
 * @method get
 * @param {Callback} [callback] The result callback function.
 * @param {Array} callback.roster
**/
IM.prototype.get = function(callback) {
    var $self = this;
    var callbackNum = 0;
    var nullObject = true;
    var rosterList = [];
    callback = callback || N;
    this._roster.get(function(result) {
        $.each(result, function(value) {
            nullObject = false;
            callbackNum++;
            $self._getVcard(value, function(result) {
                callbackNum--;
                if (result) rosterList.push(result);
                if (callbackNum === 0) {
                    callback(rosterList);
                    $self._setRoster(rosterList);
                }
            });
        });
        if (nullObject) {
            $self._setRoster([]);
            callback(rosterList);
        }
    });
};

/**
 * Subscribe to the user's with Email.
 * 
 * @method subscribe
 * @param {String} email The user's email.
**/
IM.prototype.subscribe = function(email) {
    var $self = this;
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._roster.subscribe(result.data.msgerid);
        }
    });
};

/**
 * Unsubscribe the user's with Email.
 * 
 * @method unsubscribe
 * @param {String} email The user's email.
**/
IM.prototype.unsubscribe = function(email) {
    var $self = this;
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._roster.unsubscribe(result.data.msgerid);
        }
    });
};

/**
 *Authorize the user with Email to subscribe to the authenticated user's presence.
 * 
 * @method authorize
 * @param {String} email The user's email.
**/
IM.prototype.authorize = function(email) {
    var $self = this;
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._roster.authorize(result.data.msgerid);
        }
    });
};

/**
 * Unauthorize the user with Email to subscribe to the authenticated user's presence.
 *  
 * @method unauthorize
 * @param {String} email The user's email.
**/
IM.prototype.unauthorize = function(email) {
    var $self = this;
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._roster.unauthorize(result.data.msgerid);
        }
    });
};

/**
 * Update the authenticated user's roster, if not exsit, add a new user.
 * 
 * @method update
 * @param {String} email The user's Email.
 * @param {String} name The user's Name.
 * @param {Array} groups Groups a list of groups the user belongs to.
 * @param {Callback} [callback]
 * @param {Integer} callback.Success
 * @param {Integer} [callback.AuthStatus] Exsit when auth failed.
**/
IM.prototype.update = function(email, name, groups, callback) {
    var $self = this;
    callback = callback || N;
    name = name || '';
    groups = groups || [];
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._roster.update(result.data.msgerid, name, groups, callback);
        } else {
            callback(false, result.status);
        }
    });
};

/**
 * Remove the user with Email from the user roster.
 * 
 * @method remove
 * @param {String} email The user's Email.
 * @param {Callback} [callback]
 * @param {Integer} callback.Success
 * @param {Integer} [callback.AuthStatus] Exsit when auth failed.
**/
IM.prototype.remove = function(email, callback) {
    var $self = this;
    callback = callback || N;
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._roster.remove(result.data.msgerid, callback);
        } else {
            callback(false, result.status);
        }
    });
};

/**
 * Bind events on the roster.
 * All events below:
 * 
 *     ## presence
 *     Always trigger an `presence` event, when recieve presence.
 *     ## presence:available
 *     Always trigger an `presence:available` event, when another user is available.
 *     ## presence:unavailable
 *     Always trigger an `presence:unavailable` event, when another user is unavailable.
 *     ## presence:subscribe
 *     Always trigger an `presence:subscribe` event, when another user subscribe you.
 *     ## presence:subscribed
 *     Always trigger an `presence:subscribed` event, when another user subscribed you.
 *     ## presence:unsubscribe
 *     Alway trigger an `presence:unsubscribe` event, when another user unsubscribe you.
 *     ## presence:unsubscribed
 *     Always trigger an `presence:unsubscribed` event, when another user unsubscribed you.
 * 
 *     ## roster:suggestion
 *     Always trigger an `roster:suggestion` event.
 *     ## roster:suggestion:add
 *     Trigger an `roster:suggestion:add` event when a suggestion to add a user is received.
 *     ## roster:suggestion:delete
 *     Trigger an `roster:suggestion:delete` event when a suggestion to delete a user is received.
 *     ## roster:suggestion:modify
 *     Trigger an `roster:suggestion:modify` event when a suggestion to modify a user's properties in the roster is received.
 * 
 * @method onRoster
 * @param {String} eventName The event name.
 * @param {Callback} callback The result callback function.
 * @param {Object} callback.result.
**/
IM.prototype.onRoster = function(eventName, callback) {
    var $self = this;
    this._roster.on('xmpp:' + eventName, function(result) {
        $self._getVcard(result.jid.split('/')[0], function(respond) {
            result.email = respond.EMAIL;
            delete result.jid;
            callback(result);
        });
    });
};

/**
 * Off events on the roster.
 * All events below:
 * 
 *     ## presence
 *     Always trigger an `presence` event, when recieve presence.
 *     ## presence:available
 *     Always trigger an `presence:available` event, when another user is available.
 *     ## presence:unavailable
 *     Always trigger an `presence:unavailable` event, when another user is unavailable.
 *     ## presence:subscriptionrequest
 *     Always trigger an `presence:subscriptionrequest` event, when another user subscribe you.
 * 
 * @method offRoster
 * @param {String} eventName The event name.
 * @param {Callback} callback
**/
IM.prototype.offRoster = function(eventName, callback) {
    this._roster.off('xmpp:' + eventName, callback);
};

/**
 * Send message to other user.
 * 
 * @method send
 * @param {String} emailTo Who send message to.
 * @param {String} body The message to send.
 * @param {String} html_body The message with html content to send.
 * @param {Callback} [callback]
 * @param {Integer} callback.AuthStatus
 *     
**/
IM.prototype.send = function(emailTo, body, html_body, callback) {
    var $self = this;
    callback = callback || N;
    this._getJid(emailTo, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._messaging.send(result.data.msgerid, body, html_body);
        }
        callback(result.status);
    });
};

/**
 * Bind events on the messaging.
 * All events below:
 * 
 *     ## message
 *     Always trigger an `message` event, when recieve message.
 * 
 * @method onMessaging
 * @param {String} eventName The event name.
 * @param {Callback} callback
 * @param {Object} callback.result.
**/
IM.prototype.onMessaging = function(eventName, callback) {
    var $self = this;
    this._messaging.on('xmpp:' + eventName, function(result) {
        $self._getVcard(result.jid.split('/')[0], function(respond) {
            result.email = respond.Email;
            delete result.jid;
            callback(result);
        });
    });
};

/**
 * Off events on the messaging.
 * All events below:
 * 
 *     ## message
 *     Always trigger an `message` event, when recieve message.
 * 
 * @method offMessaging
 * @param {String} eventName The event name.
 * @param {Callback} callback
**/
IM.prototype.offMessaging = function(eventName, callback) {
    this._messaging.off('xmpp:' + eventName, callback);
};

IM.prototype.getVcard = function(email, callback) {
    var $self = this;
    this._getJid(email, function(result) {
        if (result.status === $self.AuthStatus.OK) {
            $self._getVcard(result.data.msgerid, function(respond) {
                callback(respond);
            });
        } else {
            callback(result.status);
        }
    });
};

window.IM = IM;

}(Strophe));
