import type { DemoServices } from './contracts';

// Local-only adapter. Replace these methods with typed API clients when backend integration begins.
const pause = () => new Promise<void>((resolve) => window.setTimeout(resolve, 180));
export const demoServices: DemoServices = {
  async assume() { await pause(); },
  async reply() { await pause(); return { id: `local-${Date.now()}`, kind: 'human', text: '', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), status: 'Enviado' }; },
  async returnToEva() { await pause(); },
  async acknowledgeIncident() { await pause(); },
};