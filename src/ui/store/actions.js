import Account from '../../lib/Account'
import browser from '../../lib/browser-api'
import { mutations } from './mutations'
import Logger from '../../lib/Logger'

export const actions = {
  LOAD_LOCKED: 'LOAD_UNLOCKED',
  UNLOCK: 'UNLOCK',
  SET_KEY: 'SET_KEY',
  UNSET_KEY: 'UNSET_KEY',
  LOAD_ACCOUNTS: 'LOAD_ACCOUNTS',
  CREATE_ACCOUNT: 'CREATE_ACCOUNT',
  DELETE_ACCOUNT: 'DELETE_ACCOUNT',
  RESET_ACCOUNT: 'RESET_ACCOUNT',
  STORE_ACCOUNT: 'STORE_ACCOUNT',
  TRIGGER_SYNC: 'TRIGGER_SYNC',
  CANCEL_SYNC: 'CANCEL_SYNC',
  DOWNLOAD_LOGS: 'DOWNLOAD_LOGS',
  START_LOGIN_FLOW: 'START_LOGIN_FLOW',
  STOP_LOGIN_FLOW: 'STOP_LOGIN_FLOW'
}
export const actionsDefinition = {
  async [actions.LOAD_LOCKED]({ commit, dispatch, state }) {
    const background = await browser.runtime.getBackgroundPage()
    commit(mutations.SET_LOCKED, !background.controller.unlocked)
    commit(mutations.SET_SECURED, !!background.controller.key || !background.controller.unlocked)
  },
  async [actions.UNLOCK]({commit, dispatch, state}, key) {
    const background = await browser.runtime.getBackgroundPage()
    try {
      await background.controller.unlock(key)
    } catch (e) {
      console.error(e.message)
      throw e
    }
    commit(mutations.SET_LOCKED, false)
  },
  async [actions.SET_KEY]({commit, dispatch, state}, key) {
    const background = await browser.runtime.getBackgroundPage()
    await background.controller.setKey(key)
  },
  async [actions.UNSET_KEY]({commit, dispatch, state}) {
    const background = await browser.runtime.getBackgroundPage()
    await background.controller.unsetKey()
  },
  async [actions.LOAD_ACCOUNTS]({ commit, dispatch, state }) {
    const accountsArray = await Account.getAllAccounts()
    const accounts = {}
    accountsArray.forEach((acc) => {
      accounts[acc.id] = {
        data: acc.getData(),
        id: acc.id,
        label: acc.getLabel(),
      }
    })
    await commit(mutations.LOAD_ACCOUNTS, accounts)
  },
  async [actions.CREATE_ACCOUNT]({commit, dispatch, state}, type) {
    const account = await Account.create(Account.getDefaultValues(type))
    await dispatch(actions.LOAD_ACCOUNTS)
    return account.id
  },
  async [actions.DELETE_ACCOUNT]({commit, dispatch, state}, id) {
    const account = await Account.get(id)
    await account.delete()
    commit(mutations.REMOVE_ACCOUNT, id)
  },
  async [actions.RESET_ACCOUNT]({commit, dispatch, state}, id) {
    const account = await Account.get(id)
    await account.storage.initCache()
    await account.storage.initMappings()
  },
  async [actions.STORE_ACCOUNT]({ commit, dispatch, state }, { id,data }) {
    const account = await Account.get(id)
    await account.setData(data)
    commit(mutations.STORE_ACCOUNT_DATA, {id, data})
  },
  async [actions.TRIGGER_SYNC]({ commit, dispatch, state }, accountId) {
    const background = await browser.runtime.getBackgroundPage()
    background.syncAccount(accountId)
  },
  async [actions.CANCEL_SYNC]({ commit, dispatch, state }, accountId) {
    const background = await browser.runtime.getBackgroundPage()
    await background.controller.cancelSync(accountId)
  },
  async [actions.DOWNLOAD_LOGS]({ commit, dispatch, state }) {
    await Logger.downloadLogs()
  },
  async [actions.START_LOGIN_FLOW]({commit, dispatch, state}, rootUrl) {
    commit(mutations.SET_LOGIN_FLOW_STATE, true)
    let res = await fetch(`${rootUrl}/index.php/login/v2`, {method: 'POST', headers: {'User-Agent': 'Floccus bookmarks sync'}})
    if (res.status !== 200 || !state.loginFlow.isRunning) {
      commit(mutations.SET_LOGIN_FLOW_STATE, false)
      throw new Error(browser.i18n.getMessage('LabelLoginFlowError'))
    }
    let json = await res.json()
    try {
      await browser.tabs.create({ url: json.login })
      do {
        await new Promise(resolve => setTimeout(resolve, 1000))
        res = await fetch(json.poll.endpoint, { method: 'POST', body: `token=${json.poll.token}`, headers: {'Content-type': 'application/x-www-form-urlencoded'} })
      } while (res.status === 404 && state.loginFlow.isRunning)
      commit(mutations.SET_LOGIN_FLOW_STATE, false)
    } catch (e) {
      commit(mutations.SET_LOGIN_FLOW_STATE, false)
      throw e
    }
    if (res.status !== 200) {
      throw new Error(browser.i18n.getMessage('LabelLoginFlowError'))
    }
    json = await res.json()
    return {username: json.loginName, password: json.appPassword}
  },
  async [actions.STOP_LOGIN_FLOW]({commit}) {
    commit(mutations.SET_LOGIN_FLOW_STATE, false)
  }
}
