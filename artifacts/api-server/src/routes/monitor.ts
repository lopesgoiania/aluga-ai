import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { agentRest, agentRpc, evolution } from '../lib/upstream';

const router = Router();
const matchesSecret = (provided: string, expected: string) => {
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

router.get('/internal/monitor-connections', async (req, res, next) => {
  // The separate monitor secret takes precedence; the existing server-to-server
  // service key keeps the monitor deployable until that secret is configured.
  const secret = process.env.PANEL_MONITOR_SECRET?.trim() || process.env.SUPABASE_AGENT_SERVICE_ROLE_KEY?.trim();
  if (!secret) { res.status(503).json({ error: 'Monitor não configurado' }); return; }
  if (!matchesSecret(String(req.get('authorization') ?? ''), `Bearer ${secret}`)) { res.status(401).json({ error: 'Não autorizado' }); return; }
  try {
    const channels = await agentRest('panel_channels', { params: { select: 'id,instance_name', active: 'eq.true' } });
    const previous = await agentRest('panel_channel_health', { params: { select: 'channel_id,notification_sent_at', limit: '100' } });
    let instances: any[] = []; let upstreamError = '';
    try { const rows = await evolution('/instance/fetchInstances'); instances = Array.isArray(rows) ? rows : []; }
    catch (error) { upstreamError = error instanceof Error ? error.message : 'Evolution indisponível'; }
    const results = [];
    for (const channel of channels as any[]) {
      const instance = instances.find((item) => item.name === channel.instance_name);
      const state = upstreamError ? 'unreachable' : instance?.connectionStatus ?? 'missing';
      const health = await agentRpc('panel_record_channel_health', { p_channel_id: channel.id, p_state: state, p_error: upstreamError || null });
      const wasNotified = (previous as any[]).find((item) => item.channel_id === channel.id)?.notification_sent_at;
      const webhookUrl = process.env.PANEL_ALERT_WEBHOOK_URL?.trim();
      if (health.incident_open && !wasNotified && webhookUrl) {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(process.env.PANEL_ALERT_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.PANEL_ALERT_WEBHOOK_SECRET}` } : {}) },
            body: JSON.stringify({ event: 'whatsapp_disconnected', instance: channel.instance_name, state, detectedAt: new Date().toISOString() }),
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
          await agentRest('panel_channel_health', { method: 'PATCH', params: { channel_id: `eq.${channel.id}` }, body: { notification_sent_at: new Date().toISOString(), last_notification_error: null } });
        } catch (error) {
          await agentRest('panel_channel_health', { method: 'PATCH', params: { channel_id: `eq.${channel.id}` }, body: { last_notification_error: String(error instanceof Error ? error.message : 'Falha ao notificar').slice(0, 300) } });
        }
      }
      results.push({ instance: channel.instance_name, state, incidentOpen: health.incident_open, consecutiveFailures: health.consecutive_failures });
    }
    res.json({ checked: results.length, incidents: results.filter((item) => item.incidentOpen).length, channels: results });
  } catch (error) { next(error); }
});

export default router;
