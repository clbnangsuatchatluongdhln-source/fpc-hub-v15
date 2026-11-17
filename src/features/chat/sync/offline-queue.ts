import type { Message } from '../types';
import type { SendMessageInput } from '../service/messages';

export interface QueuedMessage {
  clientId: string;
  userId: string;
  conversationId: string;
  input: SendMessageInput;
  createdAt: string;
}

let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('fpc-chat-outbox', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('messages', { keyPath: 'clientId' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = null; };
      resolve(request.result);
    };
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}

export async function writeOutbox(row: QueuedMessage, remove = false): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('messages', 'readwrite');
    const store = transaction.objectStore('messages');
    if (remove) store.delete(row.clientId); else store.put(row);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readOutbox(userId: string): Promise<QueuedMessage[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('messages', 'readonly');
    const request = transaction.objectStore('messages').getAll();
    transaction.oncomplete = () => resolve((request.result as QueuedMessage[])
      .filter(row => row.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.clientId.localeCompare(b.clientId)));
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function startOutbox(userId: string, isCurrentUser: () => boolean,
  send: (row: QueuedMessage) => Promise<Message | null>,
  onSent: (message: Message) => void, onError: () => void,
  storage = { read: readOutbox, remove: (row: QueuedMessage) => writeOutbox(row, true) }
): { flush: () => Promise<void>; stop: () => void } {
  let stopped = false;
  let running = false;
  const flush = async () => {
    if (stopped || running || !navigator.onLine || !isCurrentUser()) return;
    running = true;
    try {
      const blockedConversations = new Set<string>();
      for (const row of await storage.read(userId)) {
        if (stopped || !isCurrentUser() || !navigator.onLine) break;
        if (blockedConversations.has(row.conversationId)) continue;
        const message = await send(row);
        if (stopped || !isCurrentUser()) break;
        if (!message) { blockedConversations.add(row.conversationId); continue; }
        await storage.remove(row);
        if (!stopped && isCurrentUser()) onSent(message);
      }
    } catch { if (!stopped && isCurrentUser()) onError(); }
    finally { running = false; }
  };
  const online = () => { void flush(); };
  const timer = window.setInterval(online, 15000);
  window.addEventListener('online', online);
  return { flush, stop: () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', online);
  } };
}
