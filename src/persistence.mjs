import { serializeBackup } from './review-state.mjs';
export const PENDING_KEY = 'gaocang-public-pending-v2';

export class Persistence {
  constructor(token, revision, status) {
    this.token = token; this.revision = revision; this.status = status;
    this.pending = null; this.running = null; this.timer = null; this.blocked = false;
  }
  async request(path, data, method = 'POST') {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Gaocang-Token': this.token }, ...(method === 'GET' ? {} : { body: JSON.stringify(data) }) });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || '本机保存失败'); error.status = response.status; throw error; }
    return result;
  }
  schedule(state) {
    if(this.mutating) throw new Error('正在导入，请稍候');
    this.pending = JSON.parse(serializeBackup(state));
    try { localStorage.setItem(PENDING_KEY, serializeBackup(state)); } catch {}
    this.status('正在保存…', 'pending');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush().catch(() => {}), 350);
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.blocked) throw new Error('另一窗口有更新。请先导出本页记录，再重新载入。');
    if (this.running) { await this.running; if (this.pending) return this.flush(); return; }
    if (!this.pending) return;
    const saving = this.pending;
    this.pending = null;
    this.running = this.request('/api/state', { baseRevision: this.revision, state: saving }).then(result => {
      this.revision = result.revision;
      if (!this.pending) {
        try { localStorage.removeItem(PENDING_KEY); } catch {}
        this.status('已保存到本机', 'saved');
      }
    }).catch(error => {
      if (!this.pending) this.pending = saving;
      if (error.status === 409) this.blocked = true;
      this.status(error.status === 409 ? '另一窗口有更新 · 请导出后重新载入' : '未保存到本机 · 点击重试', 'error');
      throw error;
    }).finally(() => { this.running = null; });
    await this.running;
    if (this.pending) return this.flush();
  }
  hasPending() { return Boolean(this.pending || this.running); }
  async mutate(path,data,apply) {
    if(this.mutating)throw new Error('正在导入，请稍候');
    this.mutating=true;
    try {
      await this.flush();
      const result=await this.request(path,{...data,baseRevision:this.revision});
      this.revision=result.revision;
      apply(result);
      return result;
    } finally {this.mutating=false;}
  }
}
