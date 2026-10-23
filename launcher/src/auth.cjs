'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function authError(code) {
  const errors = {
    RESOURCE_EXHAUSTED: 'Firebase временно ограничил запросы (429). Сохранённый вход не потерян; повторим автоматически через несколько минут.',
    UNAVAILABLE: 'Firebase временно недоступен. Повторим восстановление входа автоматически.',
    EMAIL_EXISTS: 'Этот email уже зарегистрирован. Войдите или восстановите пароль.',
    INVALID_EMAIL: 'Проверьте адрес электронной почты.',
    INVALID_LOGIN_CREDENTIALS: 'Неверный email или пароль.',
    EMAIL_NOT_FOUND: 'Неверный email или пароль.',
    INVALID_PASSWORD: 'Неверный email или пароль.',
    USER_DISABLED: 'Аккаунт отключён администратором.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Слишком много попыток. Попробуйте позже.',
    OPERATION_NOT_ALLOWED: 'Регистрация по email пока не включена в Firebase.',
    INVALID_REFRESH_TOKEN: 'Сессия истекла. Войдите снова.',
    TOKEN_EXPIRED: 'Сессия истекла. Войдите снова.',
    USER_NOT_FOUND: 'Аккаунт больше не существует. Войдите снова.',
    PERMISSION_DENIED: 'Нет доступа к профилю Firestore. Обратитесь к администратору.',
    WEAK_PASSWORD: 'Используйте более надёжный пароль: минимум 8 символов.'
  };
  return errors[code.split(' : ')[0]] || 'Не удалось выполнить запрос к Firebase. Попробуйте ещё раз.';
}
class AuthService {
  constructor(config, storage, fetcher = fetch) {
    this.config = config;
    this.storage = storage;
    const cooldown=new Map();
    this.fetcher=async(url,options)=>{
      const host=new URL(url).hostname;
      if((cooldown.get(host)||0)>Date.now()){const error=new Error(authError('RESOURCE_EXHAUSTED'));error.code='RESOURCE_EXHAUSTED';error.httpStatus=429;throw error;}
      const response=await fetcher(url,options);
      if(response.status===429)cooldown.set(host,Date.now()+300000);
      return response;
    };
    this.session = null;
    this.member = null;
    this.remember = false;
  }
  async request(url, { method = 'POST', body, token, form = false } = {}) {
    let response;
    try {
      response = await this.fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
        ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      }, ...(body ? { body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) } : {}) });
    } catch (error) { if(error.code==='RESOURCE_EXHAUSTED')throw error;const failure=new Error('Не удалось подключиться к Firebase. Проверьте интернет.');failure.code='NETWORK';throw failure; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.error?.status || data.error?.message || 'UNKNOWN';
      const error = new Error(authError(response.status===429?'RESOURCE_EXHAUSTED':data.error?.message || code));
      error.code = code; error.httpStatus = response.status;
      throw error;
    }
    return data;
  }
  authURL(method) { return `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${this.config.apiKey}`; }
  documentName(uid) { return `projects/${this.config.projectId}/databases/(default)/documents/members/${encodeURIComponent(uid)}`; }
  publicUser() {
    if (!this.session?.uid || !this.session?.email) return null;
    return { uid: this.session.uid, email: this.session.email, nickname: this.member?.nickname || this.session.nickname || 'Игрок', status: this.member?.status || (this.restorePending?'unavailable':'pending') };
  }
  async persist() {
    if (this.remember && this.session) await this.storage.save({ refreshToken: this.session.refreshToken });
    else await this.storage.clear();
  }
  async register({ email, password, nickname, remember = true }) {
    email = String(email || '').trim(); nickname = String(nickname || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) throw new Error('Ник: от 3 до 16 латинских букв, цифр или знаков _.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('Пароль должен содержать от 8 до 128 символов.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Введите корректный email.');
    const result = await this.request(this.authURL('signUp'), { body: { email, password, returnSecureToken: true } });
    this.acceptSession(result, nickname); this.remember = remember === true;
    await this.persist();
    // The Auth account survives a temporary Firestore error; a later login repairs the missing profile.
    await this.request(this.authURL('update'), { body: { idToken: this.session.idToken, displayName: nickname, returnSecureToken: false } });
    await this.ensureMember(nickname);
    return this.publicUser();
  }
  acceptSession(data, nickname) {
    this.member = null;
    this.session = { uid: data.localId, email: data.email, nickname: nickname || data.displayName || 'Игрок', idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000 };
  }
  async login({ email, password, nickname, remember = true }) {
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 128) throw new Error('Введите email и пароль.');
    const result = await this.request(this.authURL('signInWithPassword'), { body: { email: email.trim(), password, returnSecureToken: true } });
    this.acceptSession(result); this.remember = remember === true;
    await this.persist();
    try { await this.ensureMember(nickname || this.session.nickname); } catch(error) { this.deferProfile(error); throw error; }
    return this.publicUser();
  }
  deferProfile(error) {
    this.restorePending=error.httpStatus===429||error.httpStatus>=500||error.code==='NETWORK';
    this.restoreAt=Date.now()+(error.httpStatus===429?300000:60000);
  }
  async restore() {
    this.restorePending=false;
    if (!this.session?.uid) {
      const saved = await this.storage.load();
      if (!saved?.refreshToken) return;
      this.session = { refreshToken: saved.refreshToken, expiresAt: 0 };
      this.remember = true;
    }
    try { await this.refresh(); await this.ensureMember(); }
    catch (error) {
      const invalid=['INVALID_REFRESH_TOKEN','TOKEN_EXPIRED','USER_NOT_FOUND','USER_DISABLED'].includes(error.code);
      if(invalid){this.session=null;this.member=null;await this.storage.clear();}
      this.restorePending=!invalid&&(error.httpStatus===429||error.httpStatus>=500||error.code==='NETWORK');
      this.restoreAt=Date.now()+(error.httpStatus===429?300000:60000);
      throw error;
    }
  }
  async refresh(force = false) {
    if (!this.session) throw new Error('Войдите в аккаунт Astral, чтобы играть.');
    if (!force && this.session.expiresAt > Date.now() + 60000) return;
    const result = await this.request(`https://securetoken.googleapis.com/v1/token?key=${this.config.apiKey}`, { form: true, body: { grant_type: 'refresh_token', refresh_token: this.session.refreshToken } });
    this.session.idToken = result.id_token;
    this.session.refreshToken = result.refresh_token;
    this.session.uid = result.user_id;
    this.session.expiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
    const lookup = await this.request(this.authURL('lookup'), { body: { idToken: result.id_token } });
    const account = lookup.users?.[0];
    if (!account?.email || account.disabled) { await this.logout(); throw new Error('Аккаунт недоступен. Войдите снова.'); }
    this.session.email = account.email;
    this.session.nickname = account.displayName || 'Игрок';
    await this.persist();
  }
  async getMember() {
    const doc = await this.request('https://firestore.googleapis.com/v1/' + this.documentName(this.session.uid), { method: 'GET', token: this.session.idToken });
    this.member = { nickname: doc.fields?.nickname?.stringValue, status: doc.fields?.status?.stringValue };
    return this.member;
  }
  async ensureMember(nickname = this.session?.nickname) {
    try { return await this.getMember(); }
    catch (error) { if (error.httpStatus !== 404) throw error; }
    if (typeof nickname !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(nickname)) throw new Error('Завершите игровой профиль: выберите ник Minecraft.');
    const safeName = nickname;
    try {
      await this.request(`https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents:commit`, {
        token: this.session.idToken, body: { writes: [{ update: { name: this.documentName(this.session.uid), fields: {
          email: { stringValue: this.session.email }, nickname: { stringValue: safeName }, status: { stringValue: 'active' }
        } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }, {
          update: { name: `projects/${this.config.projectId}/databases/(default)/documents/nicknames/${safeName.toLowerCase()}`, fields: { uid: { stringValue: this.session.uid } } }, currentDocument: { exists: false }
        }] }
      });
    } catch (error) {
      if (error.httpStatus !== 409) throw error;
      try { return await this.getMember(); }
      catch { throw new Error('Этот ник уже занят. Укажите другой ник в форме входа; аккаунт email уже создан.'); }
    }
    return this.getMember();
  }
  async requireAccess() {
    await this.refresh(true);
    const member = await this.getMember();
    if (member.status !== 'active') throw new Error('Доступ к игре приостановлен. Обратитесь к администратору Astral.');
    return this.publicUser();
  }
  async resetPassword(email) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Сначала введите корректный email.');
    await this.request(this.authURL('sendOobCode'), { body: { requestType: 'PASSWORD_RESET', email: email.trim() } });
  }
  async logout() { this.restorePending=false;this.session = null; this.member = null; this.remember = false; await this.storage.clear(); }
}
function secureTokenStorage(file, safeStorage) {
  return {
    async load() {
      if (!safeStorage.isEncryptionAvailable()) return null;
      try { return JSON.parse(safeStorage.decryptString(await fs.readFile(file))); }
      catch { return null; }
    },
    async save(value) {
      if (!safeStorage.isEncryptionAvailable()) return;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', safeStorage.encryptString(JSON.stringify(value)));
      await fs.rename(file + '.tmp', file);
    },
    async clear() { await fs.rm(file, { force: true }); }
  };
}
module.exports = { AuthService, secureTokenStorage, authError };
