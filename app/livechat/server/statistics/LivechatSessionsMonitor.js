import moment from 'moment';
import { Meteor } from 'meteor/meteor';

import { callbacks } from '../../../callbacks/server';
import { LivechatSessions, Sessions, Users } from '../../../models/server';

const formatDate = (dateTime = new Date()) => ({
	date: parseInt(moment(dateTime).format('YYYYMMDD')),
});

export class LivechatSessionsMonitor {
	constructor() {
		this._handleMeteorConnection = this._handleMeteorConnection.bind(this);
		this._handleAgentStatusChanged = this._handleAgentStatusChanged.bind(this);
		this._handleUserStatusLivechatChanged = this._handleUserStatusLivechatChanged.bind(this);
	}

	start() {
		this._setupListeners();
	}

	_setupListeners() {
		Meteor.onConnection(this._handleMeteorConnection);
		callbacks.add('livechat.agentStatusChanged', this._handleAgentStatusChanged);
		callbacks.add('livechat.setUserStatusLivechat', this._handleUserStatusLivechatChanged);
	}

	_handleMeteorConnection(connection) {
		const session = Sessions.findOne({ sessionId: connection.id });
		if (!session) {
			return;
		}
		const user = Users.findOneById(session.userId);
		if (user && user.status !== 'offline' && user.statusLivechat === 'available') {
			this._createOrUpdateSession(user._id);
		}
		connection.onClose(() => {
			if (session) {
				this._updateSessionWhenAgentStop(session.userId);
			}
		});
	}

	_handleAgentStatusChanged({ userId, status }) {
		const user = Users.findOneById(userId);
		if (!user || user.statusLivechat !== 'available') {
			return;
		}

		if (status !== 'offline') {
			this._createOrUpdateSession(userId);
		} else {
			this._updateSessionWhenAgentStop(userId);
		}
	}

	_handleUserStatusLivechatChanged({ userId, status }) {
		const user = Users.findOneById(userId);
		if (user && user.status === 'offline') {
			return;
		}

		if (status === 'available') {
			this._createOrUpdateSession(userId);
		}
		if (status === 'not-available') {
			this._updateSessionWhenAgentStop(userId);
		}
	}

	_createOrUpdateSession(userId) {
		const data = { ...formatDate(), agentId: userId };
		LivechatSessions.createOrUpdate(data);
	}

	_updateSessionWhenAgentStop(userId) {
		const data = { ...formatDate(), agentId: userId };
		const livechatSession = LivechatSessions.findOne(data);
		if (livechatSession) {
			const stopedAt = new Date();
			const availableTime = moment(stopedAt).diff(moment(new Date(livechatSession.lastStartedAt)), 'seconds');
			LivechatSessions.updateLastStoppedAt({ ...data, availableTime, lastStopedAt: stopedAt });
			LivechatSessions.updateServiceHistory({ ...data, historyObject: { startedAt: livechatSession.lastStartedAt, stopedAt } });
		}
	}
}