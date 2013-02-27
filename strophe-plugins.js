// Add and modified by Yixia.
(function ($, _, Strophe) {
    var N = function() {};

    var $build = Strophe.$build;
    var $msg = Strophe.$msg;
    var $iq = Strophe.$iq;
    var $pres = Strophe.$pres;

    var eventSplitter = /\s+/;
    var Events = {
        on: function(events, callback, context) {
            var calls, event, list;
            if (!callback) return this;
            events = events.split(eventSplitter);
            calls = this._callbacks || (this._callbacks = {});
            while (event = events.shift()) {
                list = calls[event] || (calls[event] = []);
                list.push(callback, context);
            }
            return this;
        },
        off: function(events, callback, context) {
            var event, calls, list, i;
            if (!(calls = this._callbacks)) return this;
            if (!(events || callback || context)) {
                delete this._callbacks;
                return this;
            }
            events = events ? events.split(eventSplitter) : _.keys(calls);
            while (event = events.shift()) {
                if (!(list = calls[event]) || !(callback || context)) {
                    delete calls[event];
                    continue;
                }
                for (i = list.length - 2; i >= 0; i -= 2) {
                    if (!(callback && list[i] !== callback || context && list[i + 1] !== context)) {
                        list.splice(i, 2);
                    }
                }
            }
            return this;
        },
        trigger: function(events) {
            var event, calls, list, i, length, args, all, rest;
            if (!(calls = this._callbacks)) return this;
            rest = [];
            events = events.split(eventSplitter);
            for (i = 1, length = arguments.length; i < length; i++) {
                rest[i - 1] = arguments[i];
            }
            while (event = events.shift()) {
                if (all = calls.all) all = all.slice();
                if (list = calls[event]) list = list.slice();
                if (list) {
                    for (i = 0, length = list.length; i < length; i += 2) {
                        list[i].apply(list[i + 1] || this, rest);
                    }
                }
                if (all) {
                    args = [event].concat(rest);
                    for (i = 0, length = all.length; i < length; i += 2) {
                        all[i].apply(all[i + 1] || this, args);
                    }
                }
            }
            return this;
        }
    };

    Strophe.addConnectionPlugin('roster', {
        _connection: null,

        init: function (conn) {
            this._connection = conn;
            Strophe.addNamespace('ROSTERX', 'http://jabber.org/protocol/rosterx');
            _.extend(this, Events);
        },

        // **get** resolves with a dictionary of the authenticated user's roster.
        get: function (callback) {
            var roster,
                iq = $iq({type: 'get',  id: this._connection.getUniqueId('roster')})
                    .c('query', {xmlns: Strophe.NS.ROSTER}),
                callback = callback || N;

            this._connection.sendIQ(iq, function (result) {
                roster = {};
                $.each($('item', result), function (idx, item) {
                    roster[item.getAttribute('jid')] = {
                        subscription: item.getAttribute('subscription'),
                        name: item.getAttribute('name'),
                        groups: $.map($('group', item), function (group, idx) { return $(group).text(); })
                    };
                });
                callback(roster);
            }, function() {
                callback();
            });
        },

        // **subscribe** to the user's with JID `jid` presence
        subscribe: function (jid) {
            this._connection.send($pres({to: jid, type: "subscribe"}));
        },

        // **unsubscribe** from the user's with JID `jid` presence
        unsubscribe: function (jid) {
            this._connection.send($pres({to: jid, type: "unsubscribe"}));
        },

        // **authorize** the user with JID `jid` to subscribe to the authenticated user's presence
        authorize: function (jid) {
            this._connection.send($pres({to: jid, type: "subscribed"}));
        },

        // **unauthorize** the user with JID `jid` to subscribe to the authenticated user's presence
        unauthorize: function (jid) {
            this._connection.send($pres({to: jid, type: "unsubscribed"}));
        },

        // **update** the authenticated user's roster. Takes as arguments `jid` the JID of the user to update,
        // `name` the "nick" given to the user, and `groups` a list of groups the user belongs to.
        update: function (jid, name, groups, callback) {
            var i,
                iq = $iq({type: 'set', id: this._connection.getUniqueId('roster')})
                    .c('query', {xmlns: Strophe.NS.ROSTER})
                    .c('item', {jid: jid, name: name}),
                callback = callback || N;

            for (i = 0; i < groups.length; i++) {
                iq.c('group').t(groups[i]).up();
            }
            this._connection.sendIQ(iq, function() {
                callback(true);
            }, callback);
        },

        remove: function(jid, callback) {
            var iq = $iq({type: 'set', id: this._connection.getUniqueId('roster')})
                    .c('query', {xmlns: Strophe.NS.ROSTER})
                    .c('item', {jid: jid, subscription: 'remove'}),
                callback = callback || N;

            this._connection.sendIQ(iq, function() {
                callback(true);
            }, callback);
        },

        statusChanged: function (status, condition) {
            if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
                // Subscribe to Presence
                this._connection.addHandler(this._onReceivePresence.bind(this), null, 'presence', null, null, null);
                // Subscribe to Roster Item exchange messages
                this._connection.addHandler(this._onRosterSuggestion.bind(this), Strophe.NS.ROSTERX, 'message', null);
            }
        },

        // **_onReceivePresence** will capture all presence events.
        // It will re-trigger to subscribers more specific events, see inline comments.
        _onReceivePresence : function (presence) {
            var jid = presence.getAttribute('from'),
                type = presence.getAttribute('type'),
                show = (presence.getElementsByTagName('show').length !== 0) ? Strophe.getText(presence.getElementsByTagName('show')[0]) : null,
                status =  (presence.getElementsByTagName('status').length !== 0) ? Strophe.getText(presence.getElementsByTagName('status')[0]) : null,
                priority = (presence.getElementsByTagName('priority').length !== 0) ? Strophe.getText(presence.getElementsByTagName('priority')[0]) : null;

            // Always trigger an `xmpp:presence` event, regardless of the type of the event.
            this.trigger('xmpp:presence', {
                jid: jid,
                type: type,
                show: show,
                status: status,
                priority: priority
            });

            switch (type) {
                // Trigger an `xmpp:presence:available` event when a user becomes available.
                case null:
                    this.trigger('xmpp:presence:available', {
                        jid: jid,
                        show: show,
                        status: status,
                        priority: priority
                    });
                    break;
                // Trigger an `xmpp:presence:unavailable` event when a user becomes unavailable.
                case 'unavailable':
                    this.trigger('xmpp:presence:unavailable', {jid: jid});
                    break;
                // Trigger an `xmpp:presence:subscriptionrequest` event when a user requests to subscribe to the
                // authenticated user's presence.
                case 'subscribe':
                    this.trigger('xmpp:presence:subscribe', {jid: jid});
                    break;

                case 'unsubscribe':
                    this.trigger('xmpp:presence:unsubscribe', {jid: jid});
                    break;

                case 'subscribed':
                    this.trigger('xmpp:presence:subscribed', {jid: jid});
                    break;

                case 'unsubscribed':
                    this.trigger('xmpp:presence:unsubscribed', {jid: jid});
                    break;

                default:
                    break;
            }
            return true;
        },

        // **_onRosterSuggestion** captures Roster Item exchange events.
        // It will re-trigger to subscribers more specific events, see inline comments.
        _onRosterSuggestion: function (msg) {
            var self = this,
                from = $(msg).attr('from'),
                suggestion,
                groups;

            $.each($('item', msg), function (idx, item) {
                suggestion = {from: from};
                _.each(item.attributes, function (attr) {
                    suggestion[attr.name] = attr.value;
                });
                groups = _.map($('groups', item), function (group) { return group.textContent;});
                if (groups.length) {
                    suggestion.groups = groups;
                }

                // Always trigger an `xmpp:roster:suggestion` event.
                self.trigger('xmpp:roster:suggestion', suggestion);

                switch (suggestion.action) {
                    // Trigger an `xmpp:roster:suggestion:add` event when a suggestion
                    // to add a user is received.
                    case 'add':
                        self.trigger('xmpp:roster:suggestion:add', suggestion);
                        break;
                    // Trigger an `xmpp:roster:suggestion:delete` event when a suggestion
                    // to delete a user is received.
                    case 'delete':
                        self.trigger('xmpp:roster:suggestion:delete', suggestion);
                        break;
                    // Trigger an `xmpp:roster:suggestion:modify` event when a suggestion
                    // to modify a user's properties in the roster is received.
                    case 'modify':
                        self.trigger('xmpp:roster:suggestion:modify', suggestion);
                        break;
                    default:
                        break;
                }
            });
            return true;
        }
    });

    Strophe.addConnectionPlugin('Messaging', {

        _connection: null,

        init: function (conn) {
            this._connection = conn;
            Strophe.addNamespace('XHTML_IM', 'http://jabber.org/protocol/xhtml-im');
            Strophe.addNamespace('XHTML', 'http://www.w3.org/1999/xhtml');
            _.extend(this, Events);
        },

        // Register message notifications when connected
        statusChanged: function (status, condition) {
            if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
                this._connection.addHandler(this._onReceiveChatMessage.bind(this), null, 'message', 'chat');
            }
        },

        // Upon message receipt trigger an `xmpp:message` event.
        _onReceiveChatMessage: function (message) {
            var body, html_body;
            if ($('body', message).length === 2) {
                body = $('body', message).first().text();
                html_body = $('html > body', message).html();
            } else if ($('body', message).length === 1) {
                if ($('html > body', message).length === 1) {
                    html_body = $('html > body', message).html();
                } else {
                    body = $('body', message).first().text();
                }
            }
            this.trigger('xmpp:message', {jid: message.getAttribute('from'),
                type: message.getAttribute('type'),
                body: body,
                html_body: html_body});
            return true;
        },

        // **send** sends a message. `body` is the plaintext contents whereas `html_body` is the html version.
        send: function (to, body, html_body) {
            var msg = $msg({to: to, type: 'chat'});

            if (body) {
                msg.c('body', {}, body);
            }

            if (html_body) {
                msg.c('html', {xmlns: Strophe.NS.XHTML_IM})
                    .c('body', {xmlns: Strophe.NS.XHTML})
                    .h(html_body);
            }

            this._connection.send(msg.tree());
        }
    });

    Strophe.addConnectionPlugin('vCard', {
        _connection: null,

        init: function (conn) {
            this._connection = conn;
            Strophe.addNamespace('vCard', 'vcard-temp');
        },

        // **_buildvCard** builds an XML vCard from an object.
        _buildvCard: function (dict, parent) {
            var builder;
            if (typeof parent === 'undefined') {
                builder = $build('vCard', {xmlns: Strophe.NS.vCard, version: '2.0'});
            } else {
                builder = $build(parent);
            }
            _.each(dict, function (val, key) {
                if (typeof val === 'object') {
                    builder.cnode(this._buildvCard(val, key)).up();
                } else if (val) {
                    builder.c(key, {}, val);
                } else {
                    builder.c(key).up();
                }
            }, this);
            return builder.tree();
        },

        // **_parsevCard** parses a vCard in XML format and returns an object.
        _parsevCard: function (xml) {
            var i,
                dict = {},
                self = this,
                jqEl;
            xml = _.isArray(xml) ? xml[0].childNodes : xml.childNodes;
            for (i = 0; i < xml.length; i++) {
                jqEl = xml[i];
                if (jqEl.childElementCount) {
                    dict[jqEl.nodeName] = self._parsevCard(jqEl);
                } else {
                    dict[jqEl.nodeName] = jqEl.textContent;
                }
            }
            return dict;
        },

        // **get** returns the parsed vCard of the user identified by `jid`.
        get: function (jid, callback) {
            var self = this,
                iq = $iq({type: 'get', to: jid, id: this._connection.getUniqueId('vCard')})
                    .c('vCard', {xmlns: Strophe.NS.vCard}).tree(),
                callback = callback || N;

            this._connection.sendIQ(iq, function (response) {
                var result = $('vCard', response);
                if (result.length > 0) {
                    callback(self._parsevCard(result));
                } else {
                    callback();
                }
            }, function() {
                callback();
            });
        },

        // **set** sets the vCard of the authenticated user by parsing `vcard`.
        set: function (vcard, callback) {
            var iq = $iq({type: 'set', id: this._connection.getUniqueId('vCard')})
                    .cnode(this._buildvCard(vcard)),
                callback = callback || N;

            this._connection.sendIQ(iq, function() {
                callback(true);
            }, callback);
        },

        // **base64Image** returns the Base64-encoded image from a `url`.
        base64Image: function (url, callback) {
            var img = new Image();
            $(img).error(callback);
            $(img).load(function () {
                var ctx,
                    canvas = document.createElement('canvas');

                canvas.width = img.width;
                canvas.height = img.height;
                ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                callback(canvas.toDataURL('image/png'));
            }).attr('src', url);
        }
    });
})($, _, Strophe);
// Modified end.