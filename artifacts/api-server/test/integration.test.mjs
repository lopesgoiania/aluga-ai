import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sessionId = '11111111-1111-4111-8111-111111111111';
const reviewSessionId = '12121212-1212-4121-8121-121212121212';
const userId = '22222222-2222-4222-8222-222222222222';
const attendantId = '55555555-5555-4555-8555-555555555555';
const contactId = '33333333-3333-4333-8333-333333333333';
const outboundId = '66666666-6666-4666-8666-666666666666';
const mediaId = '88888888-8888-4888-8888-888888888888';
const textId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const teamId = '99999999-9999-4999-8999-999999999999';
const otherTeamId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherSessionId = '77777777-7777-4777-8777-777777777777';
const invitedId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const listen = (server) => new Promise((resolvePort) => server.listen(0, '127.0.0.1', () => resolvePort(server.address().port)));
const close = (server) => new Promise((resolveClose) => server.close(resolveClose));
const freePort = async () => { const server = http.createServer(); const port = await listen(server); await close(server); return port; };

test('autenticação, leitura dos três serviços e envio idempotente', async () => {
  let sends = 0;
  let assignment = 'WhatsApp';
  let sentText = '';
  let quotedId = '';
  let deletedText = false;
  let originalContent = 'Mensagem original para auditoria';
  let routedTarget = '';
  let archiveReady = false;
  let outboundArchives = 0;
  let disconnected = false;
  let healthFailures = 0;
  let knowledgeLink = null;
  let attendantRemoved = false;
  let invitationsSent = 0;
  let createdWithPassword = 0;
  let passwordUpdates = 0;
  let profileImageAvailable = true;
  let profileLookups = 0;
  let autoAdmission = false;
  let autoSchedule = { mode: 'always', startTime: '18:00', endTime: '08:00' };
  let sessionPhone = '5562999999999@s.whatsapp.net';
  const internalMessages = [];
  let storedInternalAudio = '';
  const reservations = new Set();
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(await new Response(req).text());
      if (body.password === 'senha-incorreta') return json({ message: 'Invalid login credentials' }, 400);
      const attendant = body.email === 'attendant@example.test';
      return json({ access_token: attendant ? 'attendant-access' : 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
    }
    if (url.pathname === '/auth/v1/user') {
      if (req.method === 'PUT') { const body = JSON.parse(await new Response(req).text()); assert.equal(body.password, 'senha-segura-123'); }
      return json({ id: req.headers.authorization === 'Bearer attendant-access' ? attendantId : userId });
    }
    if (url.pathname === '/auth/v1/admin/users') {
      if (req.method === 'POST') { const body = JSON.parse(await new Response(req).text()); assert.equal(body.email_confirm, true); assert.equal(body.password, 'senha-inicial-123'); createdWithPassword++; return json({ id: invitedId, email: body.email }); }
      return json({ users: [{ id: userId, email: 'admin@example.test', email_confirmed_at: '2026-10-01T00:00:00Z' }, { id: attendantId, email: 'attendant@example.test', invited_at: '2026-10-20T00:00:00Z', email_confirmed_at: attendantRemoved ? '2026-10-21T00:00:00Z' : null }] });
    }
    if (url.pathname === `/auth/v1/admin/users/${attendantId}` || url.pathname === `/auth/v1/admin/users/${userId}`) {
      if (req.method === 'PUT') { const body = JSON.parse(await new Response(req).text()); assert.ok(body.password); passwordUpdates++; return json({ id: url.pathname.endsWith(attendantId) ? attendantId : userId }); }
      return json({ id: url.pathname.endsWith(attendantId) ? attendantId : userId, email: url.pathname.endsWith(attendantId) ? 'attendant@example.test' : 'admin@example.test', invited_at: '2026-10-20T00:00:00Z' });
    }
    if (url.pathname === '/auth/v1/invite') {
      invitationsSent++;
      const body = JSON.parse(await new Response(req).text());
      return json({ id: body.email === 'attendant@example.test' ? attendantId : invitedId, email: body.email });
    }
    if (url.pathname === '/rest/v1/panel_operators') {
      if (req.method === 'PATCH') {
        if (url.searchParams.get('user_id') === `eq.${attendantId}`) { attendantRemoved = true; return json([{ user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: false }]); }
        return json([{ user_id: userId, display_name: 'Operador Teste', signature: 'Vilarinho', role: 'admin', active: true }]);
      }
      if (req.method === 'POST') { const body = JSON.parse(await new Response(req).text()); if (body.user_id === attendantId) attendantRemoved = false; return json([{ user_id: body.user_id, display_name: body.display_name, role: body.role, active: true }]); }
      if (url.searchParams.get('active') === 'eq.true') return json([{ user_id: userId, display_name: 'Operador Teste', role: 'admin', active: true }, { user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: true }]);
      if (url.searchParams.get('user_id') === `eq.${attendantId}`) return json([{ user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: !attendantRemoved }]);
      if (!url.searchParams.has('user_id')) return json([{ user_id: userId, display_name: 'Operador Teste', role: 'admin', active: true }, { user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: true }]);
      return json(url.searchParams.get('user_id') === `eq.${attendantId}` ? [{ user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: true }] : [{ user_id: userId, display_name: 'Operador Teste', signature: 'Vilarinho', role: 'admin', active: true }]);
    }
    if (url.pathname === '/rest/v1/chat_sessions') {
      const rows = [
      { id: sessionId, assigned_team_id: teamId, channel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contact_id: contactId, phone: sessionPhone, status: 'atendimento_humano', ai_enabled: false, created_at: '2026-10-02T12:00:00Z' },
      { id: reviewSessionId, channel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', assigned_team_id: teamId, contact_id: contactId, phone: sessionPhone, status: 'novo', ai_enabled: false, metadata: { ai_admission: 'unverified' }, created_at: '2026-10-22T12:00:00Z' },
      { id: otherSessionId, assigned_team_id: otherTeamId, channel_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', contact_id: contactId, phone: '5562999999999@s.whatsapp.net', status: 'qualificando', ai_enabled: true, created_at: '2026-09-20T12:00:00Z' },
      ]; return json(url.searchParams.has('id') ? rows.filter((row) => row.id === url.searchParams.get('id')?.slice(3)) : rows);
    }
    if (url.pathname === '/rest/v1/contacts') return json([{ id: contactId, name: 'Cliente Teste', phone: '5562999999999', metadata: {} }]);
    if (url.pathname === '/rest/v1/human_handoffs') {
      if (req.method === 'GET' && url.searchParams.has('assigned_to')) return json([]);
      if (req.method === 'PATCH') { assert.equal(url.searchParams.get('assigned_to'), 'eq.WhatsApp'); assignment = 'Operador Teste'; return json([{ id: 'h1', session_id: sessionId, status: 'accepted', assigned_to: assignment }]); }
      return json([{ id: 'h1', session_id: sessionId, status: 'accepted', assigned_to: assignment, created_at: '2026-10-02T12:00:00Z' }]);
    }
    if (url.pathname === '/rest/v1/contact_tags') return json([{ contact_id: contactId, tag_id: 't1' }]);
    if (url.pathname === '/rest/v1/tags') return json([{ id: 't1', slug: 'inquilino', name: 'Inquilino', color: '#22A06B' }]);
    if (url.pathname === '/rest/v1/chat_messages') {
      if (req.method === 'PATCH') { const body = JSON.parse(await new Response(req).text()); if (url.searchParams.get('id') === `eq.${textId}`) { assert.deepEqual(Object.keys(body), ['deleted_at_provider']); deletedText = true; } return json({}); }
      if (url.searchParams.get('id') === `eq.${mediaId}`) return json([{ id: mediaId, session_id: sessionId, direction: 'outbound', sender_type: 'human', provider_message_id: 'AUDIO-1', message_type: 'audio', media_mime_type: 'audio/ogg', metadata: { instance: 'Teste' } }]);
      if (url.searchParams.get('id') === `eq.${textId}`) return json([{ id: textId, session_id: sessionId, direction: 'outbound', sender_type: 'human', provider_message_id: 'WA-TEXT-1', message_type: 'text', content: originalContent, metadata: { source: 'panel' } }]);
      return json([{ id: 'm1', session_id: sessionId, sender_type: 'client', direction: 'inbound', content: 'Olá', created_at: '2026-10-02T12:00:00Z' }, { id: mediaId, session_id: sessionId, message_type: 'audio', provider_message_id: 'AUDIO-1', metadata: { instance: 'Teste' } }]);
    }
    if (url.pathname === '/rest/v1/chat_media_archive') return json(archiveReady ? [{ storage_path: 'Teste/AUDIO-1', mime_type: 'audio/ogg', size_bytes: 14 }] : []);
    if (url.pathname === '/rest/v1/panel_channels') return json([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', instance_name: 'Teste', display_name: 'Teste', ai_enabled: true, auto_admit_new_conversations: autoAdmission, auto_admit_schedule_mode: autoSchedule.mode, auto_admit_start_time: autoSchedule.startTime, auto_admit_end_time: autoSchedule.endTime, active: true }]);
    if (url.pathname === '/rest/v1/panel_teams') {
      if (req.method === 'PATCH') return json([{ id: teamId, name: 'Comercial', ai_enabled: true, active: true }]);
      return json([{ id: teamId, name: 'Comercial', ai_enabled: false, active: true }]);
    }
    if (url.pathname === '/rest/v1/panel_team_members') {
      if (req.method === 'POST') { const body = JSON.parse(await new Response(req).text()); return json(Array.isArray(body) ? body : [body]); }
      if (url.searchParams.get('user_id') === `eq.${attendantId}`) return json(url.searchParams.get('team_id') === `eq.${otherTeamId}` ? [] : [{ team_id: teamId, user_id: attendantId, active: true }]);
      return json([]);
    }
    if (url.pathname === '/rest/v1/panel_internal_messages') {
      if (req.method === 'POST') {
        const body = JSON.parse(await new Response(req).text());
        const row = { id: body.media_path ? mediaId : 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', created_at: '2026-10-22T12:00:00Z', ...body };
        internalMessages.push(row); return json([row]);
      }
      if (url.searchParams.has('id')) return json(internalMessages.filter((row) => row.id === url.searchParams.get('id')?.slice(3)));
      if (url.searchParams.has('team_id')) return json(internalMessages.filter((row) => row.team_id === url.searchParams.get('team_id')?.slice(3)));
      return json(internalMessages);
    }
    if (url.pathname.startsWith('/storage/v1/object/aluga-internal-chat/')) {
      storedInternalAudio = await new Response(req).text(); return json({ Key: url.pathname });
    }
    if (url.pathname.startsWith('/storage/v1/object/eva-media/')) { outboundArchives++; return json({ Key: url.pathname }); }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/aluga-internal-chat/')) {
      res.writeHead(200, { 'Content-Type': 'audio/webm' }); res.end(storedInternalAudio); return;
    }
    if (url.pathname === '/storage/v1/object/authenticated/eva-media/Teste/AUDIO-1') { res.writeHead(200, { 'Content-Type': 'audio/ogg' }); res.end('archived-media'); return; }
    if (url.pathname === '/rest/v1/panel_audit_log') return json({});
    if (url.pathname === '/rest/v1/property_interests') return json([]);
    if (url.pathname === '/rest/v1/agent_knowledge') {
      if (req.method === 'POST' || req.method === 'PATCH') {
        const body = JSON.parse(await new Response(req).text());
        assert.equal(body.audience, 'proprietario');
        return json([{ id: invitedId, title: body.title, content: body.content, audience: body.audience, status: 'draft', version: 1 }]);
      }
      const entries = [{ id: invitedId, title: 'Procedimento de captação', content: 'A equipe entra em contato com o proprietário.', audience: 'proprietario', status: 'approved', scope: 'global', source_type: 'manual', version: 1, updated_at: '2026-10-22T12:00:00Z' }, { id: textId, title: 'Transferência', content: 'Encaminhar ao comercial.', audience: 'all', status: 'approved', version: 1 }];
      return json(url.searchParams.has('id') ? entries.filter((entry) => url.searchParams.get('id')?.includes(entry.id)) : entries);
    }
    if (url.pathname === '/rest/v1/agent_knowledge_links') {
      if (req.method === 'POST') { knowledgeLink = { id: mediaId, ...JSON.parse(await new Response(req).text()) }; return json([knowledgeLink]); }
      if (req.method === 'PATCH') { knowledgeLink = { ...knowledgeLink, ...JSON.parse(await new Response(req).text()) }; return json([knowledgeLink]); }
      return json(knowledgeLink ? [knowledgeLink] : []);
    }
    if (url.pathname === '/rest/v1/agent_events') return json(url.searchParams.get('event_type') === 'eq.agent_decision' ? [{ id: invitedId, session_id: sessionId, created_at: '2026-10-22T12:00:00Z', payload: { knowledge_gap: true, combined_content: 'Qual é a taxa de administração?', handoff_reason: 'Sem fonte aprovada' } }] : []);
    if (url.pathname === '/rest/v1/agent_learning_scans') return json([{ session_id: sessionId, scanned_at: '2026-10-22T12:00:00Z' }]);
    if (url.pathname === '/rest/v1/agent_knowledge_suggestions') return json([{ id: invitedId, session_id: sessionId, suggested_title: 'Procedimento', status: 'pending', created_at: '2026-10-22T12:01:00Z' }]);
    if (url.pathname === '/rest/v1/panel_outbound') return json(url.searchParams.has('session_id') ? [] : [{ id: outboundId, session_id: sessionId, body: 'Pendente', status: 'uncertain', created_at: '2026-10-02T12:00:00Z' }]);
    if (url.pathname === '/rest/v1/properties') return json([{ source_property_id: 'R-1', title: 'Galpão', city: 'Goiânia', area: 200 }]);
    if (url.pathname === '/instance/connectionState/Teste') return json({ instance: { state: 'open' } });
    if (url.pathname === '/instance/fetchInstances') return json([{ name: 'Teste', connectionStatus: disconnected ? 'close' : 'open', ownerJid: '5562999999999@s.whatsapp.net' }]);
    if (url.pathname === '/rest/v1/panel_channel_health') return json([{ channel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: disconnected ? 'close' : 'open', incident_open: healthFailures >= 2, consecutive_failures: healthFailures }]);
    if (url.pathname === '/rest/v1/rpc/panel_record_channel_health') { const body = JSON.parse(await new Response(req).text()); healthFailures = body.p_state === 'open' ? 0 : healthFailures + 1; return json({ incident_open: healthFailures >= 2, consecutive_failures: healthFailures }); }
    if (url.pathname === '/instance/logout/Teste' && req.method === 'DELETE') { disconnected = true; return json({ status: 'SUCCESS' }); }
    if (url.pathname === '/chat/fetchProfilePictureUrl/Teste') { profileLookups++; return json({ profilePictureUrl: profileImageAvailable ? 'https://example.test/avatar.jpg' : '' }); }
    if (url.pathname === '/chat/findMessages/Teste') { const body = JSON.parse(await new Response(req).text()); const id = body.where.key.id; return json({ messages: { records: [{ key: { id, remoteJid: sessionPhone, fromMe: id !== 'AUDIO-1' }, message: { conversation: originalContent } }] } }); }
    if (url.pathname === '/chat/deleteMessageForEveryone/Teste') { const body = JSON.parse(await new Response(req).text()); assert.equal(body.fromMe, true); assert.equal(body.remoteJid, sessionPhone); deletedText = true; return json({ message: { protocolMessage: { type: 'REVOKE' } } }); }
    if (url.pathname === '/chat/getBase64FromMediaMessage/Teste') return json({ mimetype: 'audio/ogg', base64: Buffer.from('media').toString('base64') });
    if (url.pathname === '/rest/v1/rpc/panel_takeover_and_reserve_outbound') {
      const body = JSON.parse(await new Response(req).text());
      if (body.p_body?.includes('Mensagem de teste')) assert.equal(body.p_body, '*Vilarinho:*\nMensagem de teste');
      const created = !reservations.has(body.p_request_key);
      reservations.add(body.p_request_key);
      return json({ id: 'out1', status: created ? 'reserved' : 'sent', created });
    }
    if (url.pathname === '/rest/v1/rpc/panel_confirm_outbound') return json({ status: 'sent', provider_message_id: 'WA-1' });
    if (url.pathname === '/rest/v1/rpc/agent_record_provider_delete') return json({ recorded: true, matched: false });
    if (url.pathname === '/rest/v1/rpc/agent_register_media_archive') return json({ archived: true });
    if (url.pathname === '/rest/v1/rpc/panel_route_session') { const body = JSON.parse(await new Response(req).text()); routedTarget = body.p_target; return json({ target: routedTarget, assigned_to: 'Outra Pessoa' }); }
    if (url.pathname === '/rest/v1/rpc/panel_release_review_session') { routedTarget = 'reviewed_eva'; return json({ target: 'eva', reply_expected: true, pending: 1 }); }
    if (url.pathname === '/rest/v1/rpc/panel_configure_channel_auto_admission') {
      const body = JSON.parse(await new Response(req).text());
      assert.equal(body.p_operator_id, userId);
      autoAdmission = body.p_enabled;
      autoSchedule = { mode: body.p_mode, startTime: body.p_start, endTime: body.p_end };
      return json({ id: body.p_channel_id, auto_admit_new_conversations: autoAdmission, ...autoSchedule });
    }
    if (url.pathname === '/rest/v1/rpc/panel_reconcile_outbound') return json({ status: 'failed' });
    if (url.pathname === '/message/sendText/Teste') { const body = JSON.parse(await new Response(req).text()); sentText = body.text; quotedId = body.quoted?.key?.id ?? ''; sends++; return json({ key: { id: 'WA-1' } }); }
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
      PANEL_MONITOR_SECRET: 'test-monitor-secret',
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
    assert.deepEqual(await (await fetch(`${base}/auth/me`)).json(), { operator: null }, 'Visitante sem sessão deve abrir login sem erro 401');
    assert.equal((await fetch(`${base}/conversations`)).status, 401);
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: 'test' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const get = (path) => fetch(`${base}${path}`, { headers: { Cookie: cookie } });
    const post = (path, body, asCookie = cookie) => fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: asCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const acceptInvite = await fetch(`${base}/auth/accept-invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'attendant-access', refreshToken: 'test-refresh', password: 'senha-segura-123' }) });
    assert.equal((await acceptInvite.json()).operator.user_id, attendantId);
    const conversations = await (await get('/conversations')).json();
    assert.equal(conversations.conversations.length, 2, 'Mesmo contato em canais distintos deve gerar duas conversas');
    assert.equal(conversations.conversations[0].contact.name, 'Cliente Teste');
    assert.equal(conversations.conversations[0].tags[0].slug, 'inquilino');
    assert.equal((await (await get('/operators')).json()).operators.length, 2);
    assert.equal((await (await get('/internal/directory')).json()).operators.length, 2);
    assert.ok((await (await get('/internal/conversations')).json()).latest);
    assert.equal((await post('/internal/messages', { teamId, body: 'Aviso interno' })).status, 201);
    assert.equal((await (await get(`/internal/messages?teamId=${teamId}`)).json()).messages[0].body, 'Aviso interno');
    const internalAudio = await post('/internal/audio', { teamId, mimeType: 'audio/webm', durationSeconds: 2, base64: Buffer.from('audio-interno').toString('base64') });
    assert.equal(internalAudio.status, 201);
    assert.equal((await get(`/internal/media/${mediaId}`)).status, 200);
    assert.equal(await (await get(`/internal/media/${mediaId}`)).text(), 'audio-interno');
    const knowledge = await (await get('/knowledge')).json();
    assert.equal(knowledge.audienceEnabled, true);
    assert.equal(knowledge.entries[0].audience, 'proprietario');
    const gaps = await (await get('/knowledge/gaps')).json();
    assert.equal(gaps.gaps[0].question, 'Qual é a taxa de administração?');
    const learning = await (await get('/knowledge/learning')).json();
    assert.equal(learning.scans.length, 1);
    assert.equal(learning.suggestions[0].status, 'pending');
    assert.equal((await (await get('/knowledge/map')).json()).available, true);
    const link = await post('/knowledge/links', { fromId: invitedId, toId: textId, relation: 'hands_off_to' });
    assert.equal(link.status, 201);
    assert.equal((await link.json()).link.status, 'draft');
    assert.equal((await (await post(`/knowledge/links/${mediaId}/approve`, {})).json()).link.status, 'approved');
    assert.equal((await (await get('/knowledge/map')).json()).links.length, 1);
    const addKnowledge = await fetch(`${base}/knowledge`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Captação de imóvel', content: 'A equipe entra em contato com o proprietário.', audience: 'proprietario' }) });
    assert.equal(addKnowledge.status, 201);
    assert.equal((await addKnowledge.json()).entry.audience, 'proprietario');
    const invalidAudience = await fetch(`${base}/knowledge`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Inadequado', content: 'Teste', audience: 'todos' }) });
    assert.equal(invalidAudience.status, 400);
    const managed = await (await get('/operators/manage')).json();
    assert.equal(managed.operators.find((item) => item.user_id === attendantId).email, 'attendant@example.test');
    assert.equal(managed.operators.find((item) => item.user_id === attendantId).email_confirmed_at, null);
    const assignTeams = await fetch(`${base}/operators/${attendantId}/teams`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ teamIds: [teamId] }) });
    assert.equal(assignTeams.status, 200);
    assert.deepEqual((await assignTeams.json()).teamIds, [teamId]);
    const invite = await fetch(`${base}/operators/invite`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'novo@example.test', displayName: 'Novo Usuário', role: 'attendant', teamIds: [teamId] }) });
    assert.equal((await invite.json()).invitationSent, true);
    const invitationsBeforeDirect = invitationsSent;
    const direct = await fetch(`${base}/operators`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'direto@example.test', displayName: 'Direto', role: 'attendant', password: 'senha-inicial-123', teamIds: [teamId] }) });
    assert.equal(direct.status, 201);
    assert.equal((await direct.json()).operator.user_id, invitedId);
    assert.equal(createdWithPassword, 1);
    assert.equal(invitationsSent, invitationsBeforeDirect, 'Cadastro com senha não envia convite');
    const duplicate = await fetch(`${base}/operators/invite`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', displayName: 'Duplicado', role: 'admin' }) });
    assert.equal(duplicate.status, 409, 'Conta ativa não deve receber novo cadastro');
    const resend = await fetch(`${base}/operators/${attendantId}/resend-invite`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal((await resend.json()).sent, true);
    const reset = await fetch(`${base}/operators/${attendantId}/password`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'senha-temporaria-123' }) });
    assert.equal((await reset.json()).changed, true);
    const invalidOld = await fetch(`${base}/auth/change-password`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'senha-incorreta', newPassword: 'outra-senha-123' }) });
    assert.equal(invalidOld.status, 400);
    const change = await fetch(`${base}/auth/change-password`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'test', newPassword: 'outra-senha-123' }) });
    assert.equal((await change.json()).changed, true);
    assert.match(change.headers.getSetCookie().join('; '), /eva_access=;/);
    assert.equal(passwordUpdates, 2);
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
    assert.equal((await (await get('/channels')).json()).channels[0].auto_admit_new_conversations, false);
    const admissionPath = `/channels/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/auto-admission`;
    const admission = (enabled, asCookie = cookie, schedule = { mode: 'window', startTime: '18:00', endTime: '08:00' }) => fetch(`${base}${admissionPath}`, { method: 'PATCH', headers: { Cookie: asCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, ...schedule }) });
    assert.equal((await admission(true, cookie, { mode: 'window', startTime: '18:00', endTime: '18:00' })).status, 400, 'Janela sem duração não é válida');
    assert.equal((await admission(true)).status, 200);
    assert.equal((await (await get('/channels')).json()).channels[0].auto_admit_new_conversations, true);
    assert.equal((await (await get('/channels')).json()).channels[0].auto_admit_schedule_mode, 'window');
    assert.equal((await admission(false)).status, 200);
    assert.equal((await (await get('/channels')).json()).channels[0].auto_admit_new_conversations, false);
    const updateTeam = await fetch(`${base}/teams/${teamId}`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Comercial', description: 'Locação', aiEnabled: true }) });
    assert.equal((await updateTeam.json()).team.ai_enabled, true);
    const removeTeam = await fetch(`${base}/teams/${teamId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(removeTeam.status, 409, 'Equipe com conversas abertas não pode ser removida');
    const disconnect = await fetch(`${base}/connection/instances/Teste/disconnect`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal((await disconnect.json()).disconnected, true);
    assert.equal(disconnected, true);
    assert.equal((await fetch(`${base}/internal/monitor-connections`)).status, 401);
    const monitor = () => fetch(`${base}/internal/monitor-connections`, { headers: { Authorization: 'Bearer test-monitor-secret' } });
    assert.equal((await (await monitor()).json()).incidents, 0);
    assert.equal((await (await monitor()).json()).incidents, 1, 'Duas verificações confirmam a desconexão');
    const edit = await fetch(`${base}/conversations/${sessionId}/contact`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Cliente Teste', email: 'teste@example.test', notes: 'Importante', fields: { Preferencia: 'Galpão' } }) });
    assert.equal(edit.status, 200);
    const catalog = await (await get('/properties')).json();
    assert.equal(catalog.properties[0].city, 'Goiânia');
    assert.equal(catalog.properties[0].id, 'R-1');
    assert.equal((await (await get('/connection')).json()).data.instance.state, 'open');
    const alerts = await (await get('/alerts')).json();
    assert.equal(alerts.outbound[0].status, 'uncertain');
    assert.equal(alerts.connections[0].incidentOpen, true);
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
    const quotedReply = await post(`/conversations/${sessionId}/reply`, { text: 'Resposta vinculada', requestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', replyToMessageId: textId });
    assert.equal((await quotedReply.json()).status, 'sent');
    assert.equal(quotedId, 'WA-TEXT-1');
    archiveReady = false;
    assert.equal((await post(`/conversations/${sessionId}/messages/${mediaId}/delete`, {})).status, 409, 'Mídia sem arquivo privado não pode ser apagada');
    archiveReady = true;
    const deleteText = await post(`/conversations/${sessionId}/messages/${textId}/delete`, {});
    assert.equal((await deleteText.json()).retained, true);
    assert.equal(deletedText, true);
    assert.equal(originalContent, 'Mensagem original para auditoria');
    const deleteArchivedAudio = await post(`/conversations/${sessionId}/messages/${mediaId}/delete`, {});
    assert.equal((await deleteArchivedAudio.json()).retained, true, 'Áudio arquivado pode ser apagado no WhatsApp sem apagar a cópia privada');
    const transfer = await fetch(`${base}/conversations/${sessionId}/route`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'operator', targetUserId: attendantId }) });
    assert.equal((await transfer.json()).target, 'operator');
    assert.equal(routedTarget, 'operator');
    const evaWithTeam = await fetch(`${base}/conversations/${sessionId}/route`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'eva' }) });
    assert.equal(evaWithTeam.status, 200, 'LIA pode receber atendimento de uma equipe configurada');
    const unreviewed = await fetch(`${base}/conversations/${reviewSessionId}/route`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'eva' }) });
    assert.equal(unreviewed.status, 409);
    const reviewed = await fetch(`${base}/conversations/${reviewSessionId}/route`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'eva', historyReviewed: true }) });
    assert.equal(reviewed.status, 200);
    assert.equal((await reviewed.json()).reply_expected, true);
    assert.equal(routedTarget, 'reviewed_eva');
    const audio = await fetch(`${base}/conversations/${sessionId}/audio`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestKey: '99999999-9999-4999-8999-999999999999', mimeType: 'audio/ogg', base64: Buffer.from('recording').toString('base64') }) });
    assert.equal((await audio.json()).status, 'sent');
    assert.equal(sends, 3);
    const image = await fetch(`${base}/conversations/${sessionId}/file`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'image', mimeType: 'image/png', fileName: 'foto.png', base64: Buffer.from('image').toString('base64') }) });
    assert.equal((await image.json()).status, 'sent');
    assert.equal(sends, 4);
    assert.equal(outboundArchives, 2, 'Áudio e imagem enviados também precisam de cópia privada');
    const attendantLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'attendant@example.test', password: 'test' }) });
    assert.equal(attendantLogin.status, 200);
    const attendantCookie = attendantLogin.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    assert.equal((await admission(true, attendantCookie)).status, 403, 'Só administrador altera a revisão automática');
    const attendantGet = (path) => fetch(`${base}${path}`, { headers: { Cookie: attendantCookie } });
    assert.equal((await attendantGet(`/internal/media/${mediaId}`)).status, 200, 'Membro da equipe pode ouvir o áudio interno');
    assert.equal((await post('/internal/messages', { teamId: otherTeamId, body: 'Sem acesso' }, attendantCookie)).status, 403);
    assert.equal((await attendantGet('/knowledge/gaps')).status, 403, 'Lacunas de conhecimento exigem supervisor ou administrador');
    const forbiddenReset = await fetch(`${base}/operators/${userId}/password`, { method: 'PUT', headers: { Cookie: attendantCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'senha-tentativa-123' }) });
    assert.equal(forbiddenReset.status, 403, 'Atendente não pode definir senha de outro usuário');
    assert.equal((await (await attendantGet('/conversations')).json()).conversations.length, 1, 'Atendente vê só conversas das equipes atribuídas');
    assert.equal((await attendantGet(`/conversations/${otherSessionId}`)).status, 403);
    assert.equal((await post(`/conversations/${otherSessionId}/reply`, { text: 'Não posso enviar' }, attendantCookie)).status, 403);
    assert.equal((await fetch(`${base}/operators/${attendantId}/teams`, { method: 'PUT', headers: { Cookie: attendantCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ teamIds: [otherTeamId] }) })).status, 403);
    assert.equal((await attendantGet(`/conversations/${sessionId}`)).status, 200);
    assert.equal((await fetch(`${base}/conversations/${sessionId}/claim`, { method: 'POST', headers: { Cookie: attendantCookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await attendantGet('/alerts')).status, 403);
    assert.equal((await fetch(`${base}/alerts/outbound/${outboundId}/reconcile`, { method: 'POST', headers: { Cookie: attendantCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'failed' }) })).status, 403);
    assert.equal((await attendantGet('/connection/qr')).status, 403);
    const removeUser = await fetch(`${base}/operators/${attendantId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal((await removeUser.json()).historyPreserved, true);
    assert.equal((await attendantGet('/conversations')).status, 403, 'Acesso removido deve ser bloqueado mesmo com sessão aberta');
    const invitesBeforeRestore = invitationsSent;
    const restore = await fetch(`${base}/operators/invite`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'attendant@example.test', displayName: 'Outra Pessoa', role: 'attendant', teamIds: [teamId] }) });
    assert.equal(restore.status, 200);
    assert.deepEqual(((await restore.json())), { operator: { user_id: attendantId, display_name: 'Outra Pessoa', role: 'attendant', active: true }, invitationSent: false, reactivated: true });
    assert.equal(invitationsSent, invitesBeforeRestore, 'Conta confirmada deve ser reativada sem novo convite');
    assert.equal((await attendantGet('/conversations')).status, 200, 'Conta reativada deve recuperar acesso com o mesmo ID');
    assert.equal((await fetch(`${base}/operators/${attendantId}`, { method: 'DELETE', headers: { Cookie: cookie } })).status, 200);
    const restoreWithPassword = await fetch(`${base}/operators`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'attendant@example.test', displayName: 'Outra Pessoa', role: 'attendant', password: 'nova-senha-inicial-123', teamIds: [teamId] }) });
    assert.equal(restoreWithPassword.status, 200);
    assert.equal((await restoreWithPassword.json()).reactivated, true);
    assert.equal(invitationsSent, invitesBeforeRestore, 'Reativação com senha não envia convite');
    sessionPhone = '5562888888888@s.whatsapp.net';
    profileImageAvailable = false;
    const noPhoto = await get(`/conversations/${sessionId}/avatar?initials=CT`);
    assert.equal(noPhoto.status, 200);
    assert.match(noPhoto.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await noPhoto.text(), />CT<\/text>/);
    const lookupsAfterFallback = profileLookups;
    assert.equal((await get(`/conversations/${sessionId}/avatar?initials=CT`)).status, 200);
    assert.equal(profileLookups, lookupsAfterFallback, 'Ausência de foto deve ser cacheada');
  } finally { child.kill(); await close(upstream); }
});
