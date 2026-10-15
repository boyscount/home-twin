// แจ้งเตือนจริงผ่าน Telegram Bot — ส่งรูปใบหน้า + ปุ่ม "รู้จัก / ไม่รู้จัก" เข้ากลุ่มครอบครัว
// เรียก Bot API จากเบราว์เซอร์โดยตรง (ส่งเป็น FormData ซึ่งไม่ต้องมี CORS preflight จึงไม่ต้องมีเซิร์ฟเวอร์)
// token เก็บไว้ใน localStorage ของเครื่องนี้เท่านั้น ไม่ได้อยู่ในโค้ดหรือใน repo
import { store } from './bus.js';

export class Telegram {
  constructor() {
    const c = store.get('tgCfg', {});
    this.token = c.token || ''; this.chatId = c.chatId || '';
    this.offset = 0; this.polling = false;
    this.msgByTag = new Map();   // tag → { chatId, messageId }
    this.nameAsk = new Map();    // messageId ของคำถาม "ชื่ออะไร" → tag
    this.handlers = {};
  }

  get ready() { return !!(this.token && this.chatId); }
  on(evt, fn) { this.handlers[evt] = fn; }
  save(token, chatId) {
    this.token = token.trim(); this.chatId = String(chatId).trim();
    store.set('tgCfg', { token: this.token, chatId: this.chatId });
  }
  clear() { this.stop(); this.token = ''; this.chatId = ''; store.set('tgCfg', {}); }

  async api(method, params = {}, signal) {
    if (!this.token) throw new Error('ยังไม่ได้ใส่ Bot token');
    const fd = new FormData();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (v instanceof Blob) fd.append(k, v, 'face.jpg');
      else fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const r = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, { method: 'POST', body: fd, signal });
    const j = await r.json();
    if (!j.ok) throw new Error(j.description || 'Telegram error');
    return j.result;
  }

  me() { return this.api('getMe'); }

  // หา chat ที่บอทอยู่ (ให้ทักบอทหรือพิมพ์อะไรสักอย่างในกลุ่มก่อน)
  async findChats() {
    const ups = await this.api('getUpdates', { timeout: 0, allowed_updates: ['message', 'my_chat_member'] });
    const chats = new Map();
    for (const u of ups) {
      const c = u.message?.chat || u.my_chat_member?.chat;
      if (c) chats.set(c.id, { id: c.id, name: c.title || [c.first_name, c.last_name].filter(Boolean).join(' '), type: c.type });
    }
    return [...chats.values()];
  }

  async sendAlert({ tag, img, caption }) {
    const blob = await (await fetch(img)).blob();
    const msg = await this.api('sendPhoto', {
      chat_id: this.chatId, photo: blob, caption,
      reply_markup: { inline_keyboard: [[{ text: '✅ รู้จัก', callback_data: 'allow:' + tag }, { text: '🚨 ไม่รู้จัก', callback_data: 'deny:' + tag }]] },
    });
    this.msgByTag.set(tag, { chatId: msg.chat.id, messageId: msg.message_id, caption });
    return msg;
  }

  async sendPhoto(img, caption) {
    const blob = await (await fetch(img)).blob();
    return this.api('sendPhoto', { chat_id: this.chatId, photo: blob, caption });
  }

  sendText(text) { return this.api('sendMessage', { chat_id: this.chatId, text }); }

  // อัปเดตข้อความแจ้งเตือนเดิม (ลบปุ่ม + บอกผล) เพื่อให้ทุกคนในกลุ่มเห็นว่าใครตอบแล้ว
  async resolve(tag, line) {
    const m = this.msgByTag.get(tag); if (!m) return;
    await this.api('editMessageCaption', { chat_id: m.chatId, message_id: m.messageId, caption: `${m.caption}\n\n${line}`, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  }

  async askName(tag, by) {
    const msg = await this.api('sendMessage', {
      chat_id: this.chatId,
      text: `${by} กด “รู้จัก” — คนนี้ชื่ออะไร?\nกด Reply ข้อความนี้แล้วพิมพ์ชื่อ (เช่น ลุงสมชาย ข้างบ้าน)`,
      reply_markup: { force_reply: true, input_field_placeholder: 'ชื่อคนนี้' },
    });
    this.nameAsk.set(msg.message_id, tag);
  }

  // long polling — รับการกดปุ่มและข้อความตอบกลับ ตราบใดที่หน้าเว็บนี้เปิดอยู่
  start() {
    if (this.polling || !this.ready) return;
    this.polling = true;
    this.ctrl = new AbortController();
    const loop = async () => {
      while (this.polling) {
        try {
          const ups = await this.api('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['callback_query', 'message'] }, this.ctrl.signal);
          for (const u of ups) { this.offset = u.update_id + 1; this.handle(u); }
          this.handlers.status?.('online');
        } catch (e) {
          if (!this.polling) break;
          this.handlers.status?.('error', e.message);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    };
    loop();
  }
  stop() { this.polling = false; this.ctrl?.abort(); }

  handle(u) {
    const cq = u.callback_query;
    if (cq) {
      const [action, tag] = (cq.data || '').split(':');
      const by = cq.from.first_name || cq.from.username || 'สมาชิก';
      this.api('answerCallbackQuery', { callback_query_id: cq.id, text: action === 'allow' ? 'บันทึกว่ารู้จัก — กรุณาตอบชื่อ' : 'แจ้งเตือนภัยแล้ว' }).catch(() => {});
      this.handlers.answer?.({ tag, allow: action === 'allow', by });
      return;
    }
    const m = u.message;
    const askId = m?.reply_to_message?.message_id;
    if (askId && this.nameAsk.has(askId) && m.text) {
      const tag = this.nameAsk.get(askId); this.nameAsk.delete(askId);
      this.handlers.name?.({ tag, name: m.text.trim().slice(0, 40), by: m.from.first_name || 'สมาชิก' });
    }
  }
}
