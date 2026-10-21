import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sessionId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const attendantId = '55555555-5555-4555-8555-555555555555';
const contactId = '33333333-3333-4333-8333-333333333333';
const outboundId = '66666666-6666-4666-8666-666666666666';
const mediaId = '88888888-8888-4888-8888-888888888888';

const listen = (server) => new Promise((resolvePort) => server.listen(0, '127.0.0.1', () => resolvePort(server.address().port)));
const close = (server) => new Promise((resolveClose) => server.close(resolveClose));
const freePort = async () => { const server = http.createServer(); const port = await listen(server); await close(server); return port; };

test('autenticação, leitura dos três serviços e envio idempotente', async () => {
  let sends = 0;
  let assignment = 'WhatsApp';
  let sentText = '';
  let routedTarget = '';
  let archiveReady = false;
  const reservations = new Set();
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(await new Response(req).text());
      const attendant = body.email === 'attendant@example.test';
      return json({ access_token: attendant ? 'attendant-access' : 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
    }
    if (url.pathname === '/auth/v1/user') return json({ id: req.headers.authorization === 'Bearer attendant-access' ? attendantId : userId });
    if (url.pathname === '/rest/v1/panel_operators') {
      if (req.method === 'PATCH') return json([{ user_id: userId, display_name: 'Operador Teste', signature: 'Vilarinho', role: 'admin', active: true }]);
      if (url.searchParams.get('active') === 'eq.true') return json([{ user_id: userId, display_name: 'Operador Teste', role: 'admin', active: true }, { user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: true }]);
      return json(url.searchParams.get('user_id') === `eq.${attendantId}` ? [{ user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: true }] : [{ user_id: userId, display_name: 'Operador Teste', signature: 'Vilarinho', role: 'admin', active: true }]);
    }
    if (url.pathname === '/rest/v1/chat_sessions') return json([
      { id: sessionId, channel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contact_id: contactId, phone: '5562999999999@s.whatsapp.net', status: 'atendimento_humano', ai_enabled: false, created_at: '2026-10-02T12:00:00Z' },
      { id: '77777777-7777-4777-8777-777777777777', channel_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', contact_id: contactId, phone: '5562999999999@s.whatsapp.net', status: 'qualificando', ai_enabled: true, created_at: '2026-09-20T12:00:00Z' },
    ]);
    if (url.pathname === '/rest/v1/contacts') return json([{ id: contactId, name: 'Cliente Teste', phone: '5562999999999', metadata: {} }]);
    if (url.pathname === '/rest/v1/human_handoffs') {
      if (req.method === 'PATCH') { assert.equal(url.searchParams.get('assigned_to'), 'eq.WhatsApp'); assignment = 'Operador Teste'; return json([{ id: 'h1', session_id: sessionId, status: 'accepted', assigned_to: assignment }]); }
      return json([{ id: 'h1', session_id: sessionId, status: 'accepted', assigned_to: assignment, created_at: '2026-10-02T12:00:00Z' }]);
    }
    if (url.pathname === '/rest/v1/contact_tags') return json([{ contact_id: contactId, tag_id: 't1' }]);
    if (url.pathname === '/rest/v1/tags') return json([{ id: 't1', slug: 'inquilino', name: 'Inquilino', color: '#22A06B' }]);
    if (url.pathname === '/rest/v1/chat_messages') {
      if (req.method === 'PATCH') return json({});
      if (url.searchParams.get('id') === `eq.${mediaId}`) return json([{ id: mediaId, provider_message_id: 'AUDIO-1', media_mime_type: 'audio/ogg', metadata: { instance: 'Teste' } }]);
      return json([{ id: 'm1', session_id: sessionId, sender_type: 'client', direction: 'inbound', content: 'Olá', created_at: '2026-10-02T12:00:00Z' }, { id: mediaId, session_id: sessionId, message_type: 'audio', provider_message_id: 'AUDIO-1', metadata: { instance: 'Teste' } }]);
    }
    if (url.pathname === '/rest/v1/chat_media_archive') return json(archiveReady ? [{ storage_path: 'Teste/AUDIO-1', mime_type: 'audio/ogg', size_bytes: 14 }] : []);
    if (url.pathname === '/rest/v1/panel_channels') return json([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', instance_name: 'Teste', display_name: 'Teste', ai_enabled: true, active: true }]);
    if (url.pathname === '/storage/v1/object/authenticated/eva-media/Teste/AUDIO-1') { res.writeHead(200, { 'Content-Type': 'audio/ogg' }); res.end('archived-media'); return; }
    if (url.pathname === '/rest/v1/panel_audit_log') return json({});
    if (url.pathname === '/rest/v1/property_interests') return json([]);
    if (url.pathname === '/rest/v1/agent_events') return json([]);
    if (url.pathname === '/rest/v1/panel_outbound') return json(url.searchParams.has('session_id') ? [] : [{ id: outboundId, session_id: sessionId, body: 'Pendente', status: 'uncertain', created_at: '2026-10-02T12:00:00Z' }]);
    if (url.pathname === '/rest/v1/properties') return json([{ source_property_id: 'R-1', title: 'Galpão', city: 'Goiânia', area: 200 }]);
    if (url.pathname === '/instance/connectionState/Teste') return json({ instance: { state: 'open' } });
    if (url.pathname === '/instance/fetchInstances') return json([{ name: 'Teste', connectionStatus: 'open', ownerJid: '5562999999999@s.whatsapp.net' }]);
    if (url.pathname === '/chat/fetchProfilePictureUrl/Teste') return json({ profilePictureUrl: 'https://example.test/avatar.jpg' });
    if (url.pathname === '/chat/findMessages/Teste') return json({ messages: { records: [{ key: { id: 'AUDIO-1' } }] } });
    if (url.pathname === '/chat/getBase64FromMediaMessage/Teste') return json({ mimetype: 'audio/ogg', base64: Buffer.from('media').toString('base64') });
    if (url.pathname === '/rest/v1/rpc/panel_takeover_and_reserve_outbound') {
      const body = JSON.parse(await new Response(req).text());
      if (body.p_body?.includes('Mensagem de teste')) assert.equal(body.p_body, '*Vilarinho:*\nMensagem de teste');
      const created = !reservations.has(body.p_request_key);
      reservations.add(body.p_request_key);
      return json({ id: 'out1', status: created ? 'reserved' : 'sent', created });
    }
    if (url.pathname === '/rest/v1/rpc/panel_confirm_outbound') return json({ status: 'sent', provider_message_id: 'WA-1' });
    if (url.pathname === '/rest/v1/rpc/panel_route_session') { const body = JSON.parse(await new Response(req).text()); routedTarget = body.p_target; return json({ target: routedTarget, assigned_to: 'Outra Pessoa' }); }
    if (url.pathname === '/rest/v1/rpc/panel_reconcile_outbound') return json({ status: 'failed' });
    if (url.pathname === '/message/sendText/Teste') { sentText = JSON.parse(await new Response(req).text()).text; sends++; return json({ key: { id: 'WA-1' } }); }
    if (url.pathname === '/message/sendWhatsAppAudio/Teste') { sends++; return json({ key: { id: 'WA-AUDIO-1' } }); }
    if (url.pathname === '/message/sendMedia/Teste') { sends++; return json({ key: { id: 'WA-FILE-1' } }); }
    json({ message: `Unknown ${url.pathname}` }, 404);
  });
  const upstreamPort = await listen(upstream);
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, '../dist/index.mjs')], {
    cwd: resolve(here, '..'), stdio: 'ignore', env: {
      ...process.env, API_PORT: String(port), SUPABASE_AGENT_URL: `http://127.0.0.1:${upstreamPort}`,
      SUPABASE_AGENT_ANON_KEY: 'test-anon', SUPABASE_AGENT_SERVICE_ROLE_KEY: 'test-service',
      SUPABASE_CATALOG_URL: `http://127.0.0.1:${upstreamPort}`, SUPABASE_CATALOG_SERVICE_ROLE_KEY: 'test-catalog',
      EVOLUTION_API_URL: `http://127.0.0.1:${upstreamPort}`, EVOLUTION_API_KEY: 'test-evo', EVOLUTION_INSTANCE: 'Teste',
    },
  });
  const base = `http://127.0.0.1:${port}/api`;
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { healthy = (await fetch(`${base}/healthz`)).ok; } catch { /* server starting */ }
      if (healthy) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.equal(healthy, true, 'API started');
    assert.equal((await (await fetch(`${base}/setup`)).json()).configured, true);
    assert.equal((await fetch(`${base}/conversations`)).status, 401);
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: 'test' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const get = (path) => fetch(`${base}${path}`, { headers: { Cookie: cookie } });
    const conversations = await (await get('/conversations')).json();
    assert.equal(conversations.conversations.length, 2, 'Mesmo contato em canais distintos deve gerar duas conversas');
    assert.equal(conversations.conversations[0].contact.name, 'Cliente Teste');
    assert.equal(conversations.conversations[0].tags[0].slug, 'inquilino');
    assert.equal((await (await get('/operators')).json()).operators.length, 2);
    const signature = await fetch(`${base}/operators/me`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: 'Vilarinho' }) });
    assert.equal((await signature.json()).operator.signature, 'Vilarinho');
    const detail = await (await get(`/conversations/${sessionId}`)).json();
    assert.equal(detail.messages[0].content, 'Olá');
    assert.equal((await fetch(`${base}/conversations/${sessionId}/avatar`, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 302);
    const media = await get(`/conversations/${sessionId}/media/${mediaId}`);
    assert.equal(media.status, 200);
    assert.equal(await media.text(), 'media');
    archiveReady = true;
    const archivedMedia = await get(`/conversations/${sessionId}/media/${mediaId}`);
    assert.equal(archivedMedia.status, 200);
    assert.equal(await archivedMedia.text(), 'archived-media');
    assert.equal((await (await get('/connection/instances')).json()).instances[0].name, 'Teste');
    const edit = await fetch(`${base}/conversations/${sessionId}/contact`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Cliente Teste', email: 'teste@example.test', notes: 'Importante', fields: { Preferencia: 'Galpão' } }) });
    assert.equal(edit.status, 200);
    const catalog = await (await get('/properties')).json();
    assert.equal(catalog.properties[0].city, 'Goiânia');
    assert.equal(catalog.properties[0].id, 'R-1');
    assert.equal((await (await get('/connection')).json()).data.instance.state, 'open');
    assert.equal((await (await get('/alerts')).json()).outbound[0].status, 'uncertain');
    const claim = await fetch(`${base}/conversations/${sessionId}/claim`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await claim.json()).assigned_to, 'Operador Teste');
    const reconcile = () => fetch(`${base}/alerts/outbound/${outboundId}/reconcile`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'failed' }) });
    assert.equal((await (await reconcile()).json()).status, 'failed');
    const requestKey = '44444444-4444-4444-8444-444444444444';
    const send = () => fetch(`${base}/conversations/${sessionId}/reply`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Mensagem de teste', requestKey }) });
    assert.equal((await (await send()).json()).status, 'sent');
    assert.equal((await (await send()).json()).status, 'sent');
    assert.equal(sends, 1);
    assert.equal(sentText, '*Vilarinho:*\nMensagem de teste');
    const transfer = await fetch(`${base}/conversations/${sessionId}/route`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'operator', targetUserId: attendantId }) });
    assert.equal((await transfer.json()).target, 'operator');
    assert.equal(routedTarget, 'operator');
    const audio = await fetch(`${base}/conversations/${sessionId}/audio`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestKey: '99999999-9999-4999-8999-999999999999', mimeType: 'audio/ogg', base64: Buffer.from('recording').toString('base64') }) });
    assert.equal((await audio.json()).status, 'sent');
    assert.equal(sends, 2);
    const image = await fetch(`${base}/conversations/${sessionId}/file`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'image', mimeType: 'image/png', fileName: 'foto.png', base64: Buffer.from('image').toString('base64') }) });
    assert.equal((await image.json()).status, 'sent');
    assert.equal(sends, 3);
    const attendantLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'attendant@example.test', password: 'test' }) });
    assert.equal(attendantLogin.status, 200);
    const attendantCookie = attendantLogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const attendantGet = (path) => fetch(`${base}${path}`, { headers: { Cookie: attendantCookie } });
    assert.equal((await (await attendantGet('/conversations')).json()).conversations.length, 2);
    assert.equal((await attendantGet(`/conversations/${sessionId}`)).status, 200);
    assert.equal((await fetch(`${base}/conversations/${sessionId}/claim`, { method: 'POST', headers: { Cookie: attendantCookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await attendantGet('/alerts')).status, 403);
    assert.equal((await fetch(`${base}/alerts/outbound/${outboundId}/reconcile`, { method: 'POST', headers: { Cookie: attendantCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'failed' }) })).status, 403);
    assert.equal((await attendantGet('/connection/qr')).status, 403);
  } finally { child.kill(); await close(upstream); }
});
