const fs = require('fs');
const vm = require('vm');
const path = require('path');
const base = path.join(__dirname, '..', 'workflows-n8n');
const agent = JSON.parse(fs.readFileSync(path.join(base, '04-agente-central.json')));
const search = JSON.parse(fs.readFileSync(path.join(base, '05-busca-imoveis.json')));
const node = (workflow, name) => workflow.nodes.find(n => n.name === name).parameters.jsCode;
const run = (code, vars) => vm.runInNewContext(`(function(){${code}\n})()`, {...vars, console}, {timeout: 1000});
const assert = (value, message) => { if (!value) throw new Error(message); };

const cases = [
  {
    text: 'Gostaria de um galpão acima de 100 metros. Não tenho região específica, pode ser qualquer galpão em Goiânia, quero ver o que tem.',
    old: {}, patch: {tipo_imovel:'galpão',cidade:'Goiânia',regioes:[],area_minima:100},
    expected: 'search_properties', intent:null
  },
  {
    text: 'Quero ver galpoes acima de 100m2, não tenho bairro específico',
    old: {tipo_imovel:'galpao',cidade:'Goiânia',regioes:['Setor Bueno'],quartos:2,banheiros:2,vagas:1,valor_maximo:4000},
    patch: {tipo_imovel:'galpao',cidade:'Goiânia',regioes:['Setor Bueno'],quartos:2,banheiros:2,vagas:1,valor_maximo:4000,area_minima:100},
    expected: 'search_properties', criteria: {regioes:[],quartos:undefined,banheiros:undefined,vagas:undefined,valor_maximo:undefined,area_minima:100,tipo_imovel:'galpão'}
  },
  {
    text: 'Quero um imóvel na região do Bueno.', old: {},
    patch: {tipo_imovel:null,cidade:'Goiânia',regioes:['Setor Bueno']}, expected:'search_properties'
  },
  {
    text: 'Goiânia', old: {tipo_imovel:'galpão'},
    patch: {tipo_imovel:'galpão',cidade:'Goiânia',regioes:[]}, expected:'search_properties'
  },
  {
    text: 'Oi', old: {tipo_imovel:'galpão'},
    patch: {tipo_imovel:'galpão',cidade:null,regioes:[]}, expected:'reply', reply:'Oi! Como posso te ajudar?'
  },
  {
    text: 'Quero falar com uma pessoa', old: {tipo_imovel:'galpão'},
    patch: {tipo_imovel:'galpão',cidade:'Goiânia',regioes:[]}, handoff:true, expected:'handoff'
  },
  {
    text: 'Oi', old: {}, patch: {}, expected:'reply', intent:null, profile:'desconhecido', reply:'Oi! Como posso te ajudar?'
  },
  {
    text: 'Quero ver imóveis para aluguel', old: {}, patch: {}, expected:'ask', intent:null, profile:'inquilino'
  },
  {
    text: 'Quero anunciar meu imóvel', old: {}, patch: {}, expected:'ask', intent:null, profile:'proprietario'
  },
  {
    text: 'Sou proprietário de uma casa no Setor Bueno e quero colocar para alugar', old: {},
    patch: {tipo_imovel:'casa',imovel_endereco:'Setor Bueno'}, expected:'handoff', intent:null, profile:'proprietario'
  },
  {
    text: 'Sou proprietário. Como funciona a administração?', old: {}, patch: {},
    modelReply:'A taxa é 10%.', expected:'handoff', intent:null, profile:'proprietario'
  },
  {
    text: 'Tenho um apartamento no Setor Oeste e quero colocar para alugar. Qual é a taxa de administração?',
    old: {}, patch: {tipo_imovel:'apartamento',regioes:['Setor Oeste']},
    modelReply:'A taxa é 10%.', expected:'handoff', intent:null, profile:'proprietario'
  },
  {
    text: 'Tenho um apartamento no Setor Oeste e quero colocar para alugar. Qual é a taxa de administração?',
    old: {}, patch: {tipo_imovel:'apartamento',regioes:['Setor Oeste']},
    knowledge:[{id:'owner-general',audience:'proprietario',title:'Proprietário direto',content:'Não invente taxas de administração; a equipe confirma.'}],
    modelReply:'Qual é o endereço do imóvel?', expected:'handoff', intent:null, profile:'proprietario'
  },
  {
    text: 'Sou proprietário. Qual é a taxa de administração?',old:{},patch:{},
    knowledge:[{id:'owner-fee',audience:'proprietario',title:'Taxa de administração',content:'Taxa de administração: 8% do aluguel mensal.'}],
    modelReply:'A taxa de administração é 8% do aluguel mensal.',expected:'reply',intent:null,profile:'proprietario'
  },
  {
    text: 'Tenho uma casa no Setor Bueno para alugar', old: {},
    patch: {tipo_imovel:'casa',regioes:['Setor Bueno']}, expected:'handoff',intent:null,profile:'proprietario'
  },
  {
    text: 'Quero agendar visita ao R-20727', old: {tipo_imovel:'galpão'},
    patch: {}, expected:'handoff', memoryProfile:'inquilino', profile:'inquilino', visitCode:'R-20727'
  },
  {
    text: 'Quero agendar uma visita', old: {tipo_imovel:'galpão'},
    patch: {}, expected:'ask', memoryProfile:'inquilino', profile:'inquilino', question:'Qual imóvel você quer visitar?'
  },
  {
    text: 'Quero fazer o agendamento da visita ao R-20727', old: {tipo_imovel:'galpão'},
    patch: {}, expected:'handoff', memoryProfile:'inquilino', profile:'inquilino', visitCode:'R-20727'
  },
  {
    text: 'Sou corretor e gostaria de fazer uma parceria', old: {}, patch: {}, expected:'ask', intent:null, profile:'corretor'
  },
  {
    text: 'Sou corretor. Tenho um cliente procurando apartamento para alugar no Bueno.',
    old: {}, patch: {tipo_imovel:'apartamento',regioes:['Setor Bueno'],indicacao_tipo:'cliente_buscando_locacao'},
    expected:'reply', profile:'corretor', brokerSituation:'cliente_buscando_locacao', brokerUrl:true
  },
  {
    text: 'Sou corretora e meu cliente é proprietário de uma casa para colocar para locação.',
    old: {}, patch: {tipo_imovel:'casa',indicacao_tipo:'proprietario_para_captacao'},
    expected:'ask', profile:'corretor', brokerSituation:'proprietario_para_captacao', commission:'40%'
  },
  {
    text: 'Meu cliente gostou deste anúncio. Segue link, nome e telefone.',
    old: {indicacao_tipo:'cliente_buscando_locacao'},
    patch: {indicacao_tipo:'cliente_buscando_locacao',anuncio_url:'https://www.imoveisgoianiaoficial.com.br/imovel/exemplo',indicado_nome:'Cliente Teste',indicado_telefone:'62999999999'},
    memoryProfile:'corretor',expected:'handoff',profile:'corretor',brokerSituation:'cliente_buscando_locacao'
  },
  {
    text: 'O proprietário é João, telefone 62999999999, galpão no Setor Bueno.',
    old: {indicacao_tipo:'proprietario_para_captacao'},
    patch: {indicacao_tipo:'proprietario_para_captacao',indicado_nome:'João',indicado_telefone:'62999999999',tipo_imovel:'galpão',imovel_endereco:'Setor Bueno'},
    memoryProfile:'corretor',expected:'handoff',profile:'corretor',brokerSituation:'proprietario_para_captacao'
  },
  {
    text: 'Sou corretor. Como funciona a parceria?', old:{}, patch:{},
    expected:'ask',profile:'corretor',question:'Seu cliente está procurando um imóvel para alugar'
  },
  {
    text: 'Sou uma corretora e tenho cliente que quer alugar uma casa.', old:{},
    patch:{tipo_imovel:'casa',indicacao_tipo:'cliente_buscando_locacao'},
    expected:'reply',profile:'corretor',brokerSituation:'cliente_buscando_locacao',brokerUrl:true
  },
  {
    text: 'Qual é a taxa de administração de vocês?', old:{}, patch:{},
    knowledgeGap:true, expected:'handoff', intent:null
  },
  {
    text: 'Qual é a taxa de administração de vocês?', old:{}, patch:{},
    modelReply:'A taxa é 10%.', expected:'handoff', intent:null
  },
  {
    text: 'Vocês atendem aos sábados?', old:{}, patch:{},
    modelReply:'Sim, atendemos aos sábados.', expected:'handoff', intent:null
  },
  {
    text: 'Como ficou aquela visita que combinamos ontem?', old:{}, patch:{},
    expected:'handoff', missingHistory:true, intent:null
  },
  {
    text: 'Já falei com um atendente sobre meu contrato. Tem alguma novidade?', old:{}, patch:{},
    expected:'handoff', missingHistory:true, intent:null
  }
];
for (const item of cases) {
  const source = {session_id:'session',batch_id:'batch',combined_content:item.text,knowledge_entry_ids:(item.knowledge||[]).map(k=>k.id),approved_knowledge:item.knowledge||[],memory:{profile:item.memoryProfile||null,intent:item.intent===null?null:'buscar_imovel',qualification_data:item.old,messages:item.memoryMessages||[]}};
  const decision = {action:item.modelReply?'reply':'ask',reply:item.modelReply||'Pode confirmar?',intent:item.intent===null?null:'buscar_imovel',qualification_patch:item.patch,handoff_required:!!item.handoff,knowledge_gap:!!item.knowledgeGap};
  const output = run(node(agent,'04 Interpretar decisao'), {
    $json:{output:[{content:[{type:'output_text',text:JSON.stringify(decision)}]}]},
    $:name=>({first:()=>({json:source})})
  })[0].json;
  assert(output.action===item.expected, `${item.text}: ${output.action} != ${item.expected}`);
  if (item.profile) assert(output.profile===item.profile, `${item.text}: perfil ${output.profile} != ${item.profile}`);
  if (item.reply) assert(output.reply===item.reply, `${item.text}: saudação inadequada`);
  if (item.brokerSituation) assert(output.qualification_patch.indicacao_tipo===item.brokerSituation, `${item.text}: tipo de indicação incorreto`);
  if (item.brokerUrl) assert(output.reply.includes('https://www.imoveisgoianiaoficial.com.br/imoveis/aluguel') && output.reply.includes('25%'), `${item.text}: orientação ao corretor incompleta`);
  if (item.commission) assert(output.reply.includes(item.commission), `${item.text}: comissão incorreta`);
  if (item.question) assert(output.reply.includes(item.question), `${item.text}: pergunta de triagem ausente`);
  if (item.visitCode) assert(output.qualification_patch.imovel_codigo===item.visitCode && /agendar visita/.test(output.handoff_reason), `${item.text}: visita sem imóvel identificado`);
  if (item.profile==='corretor') assert(output.intent==='parceria_corretor' && output.action!=='search_properties', `${item.text}: corretor não pode disparar busca de inquilino`);
  if (item.criteria) for (const [key,value] of Object.entries(item.criteria)) assert(JSON.stringify(output.qualification_patch[key])===JSON.stringify(value), `${item.text}: critério ${key} herdado indevidamente`);
  if (item.expected==='search_properties') assert(output.reply==='', 'A busca não deve enviar confirmação antes dos resultados');
  if (item.knowledgeGap) assert(output.handoff_required && /informação certa/.test(output.reply), 'Lacuna na base deve ser transferida sem inventar resposta');
  if (item.missingHistory) assert(output.handoff_required && /histórico disponível/.test(output.handoff_reason) && /equipe/.test(output.reply), 'Retomada sem histórico deve ser encaminhada à equipe');
  if (item.modelReply && item.expected==='handoff') assert(output.handoff_required && !output.reply.includes(item.modelReply), 'Resposta sem fonte aprovada não pode ser enviada');
}
const knowledgeInput = {session_id:'session',batch_id:'batch',combined_content:'Como funciona?',memory:{messages:[]}};
const context = run(node(agent,'02 Preparar contexto'), {$json:{entries:[{id:'approved-1',title:'Atendimento',content:'Regra aprovada'}]},$:name=>({first:()=>({json:knowledgeInput})})})[0].json;
assert(context.request_body.instructions.includes('Regra aprovada') && context.request_body.instructions.includes('não invente'), 'Conhecimento aprovado precisa chegar ao modelo com a política de não invenção');
assert(context.knowledge_entry_ids.includes('approved-1'), 'IDs de fontes aprovadas precisam seguir para a validação da resposta');
assert(context.approved_knowledge.some((entry) => entry.id === 'approved-1' && entry.content === 'Regra aprovada'), 'A validação comercial precisa receber o texto da fonte aprovada');
const input = {qualification:{tipo_imovel:'galpão',cidade:'Goiânia',regioes:[],area_minima:100}};
const prepared = run(node(search,'02 Preparar filtros'), {$json:input})[0].json;
const properties = [
  {source_property_id:'OK-1',property_type:'Shed_deposit_warehouse',transaction_type:'Aluguel',city:'Goiânia',area:150,rental_price:8000,title:'Galpão 150 m²'},
  {source_property_id:'SMALL',property_type:'Shed_deposit_warehouse',transaction_type:'Aluguel',city:'Goiânia',area:80,rental_price:5000,title:'Galpão 80 m²'},
  {source_property_id:'OTHER-CITY',property_type:'Shed_deposit_warehouse',transaction_type:'Aluguel',city:'Aparecida de Goiânia',area:300,rental_price:7500,title:'Galpão 300 m²'},
  {source_property_id:'SALE',property_type:'Shed_deposit_warehouse',transaction_type:'Venda',city:'Goiânia',area:200,rental_price:null,price:900000,title:'Galpão à venda'}
];
const ranked = run(node(search,'04 Filtrar e ranquear'), {
  $:name=>({first:()=>({json:prepared})}),
  $input:{all:()=>properties.map(json=>({json}))}
})[0].json;
assert(ranked.count===1 && ranked.properties[0].source_property_id==='OK-1','Filtro de galpão/metragem/cidade/transação falhou');
const result = run(node(search,'05 Montar resposta'), {$json:ranked})[0].json;
assert(result.reply.includes('Galpão 150 m²') && !result.reply.includes('opção(ões)'), 'Resposta de imóveis não está natural');
assert(prepared.search_filters.limit===5 && result.reply.includes('\n\n'), 'Resposta deve vir em blocos curtos');
const empty = run(node(search,'05 Montar resposta'), {$json:{...ranked,properties:[]}})[0].json;
assert(!empty.reply.includes('regiões próximas') && empty.reply.includes('Goiânia'), 'Sem bairro informado, a resposta não deve pedir ampliação de região');
const actualOptions = [
  {source_property_id:'R-20727',property_type:'Shed_deposit_warehouse',transaction_type:'Aluguel',city:'Goiânia',neighborhood:'Setor Leste Universitário',area:200,rental_price:3000,title:'Galpão - 200m² | Setor Universitário.'},
  {source_property_id:'R-9356',property_type:'Shed_deposit_warehouse',transaction_type:'Aluguel',city:'Goiânia',neighborhood:'Moinho dos Ventos',area:600,rental_price:25000,title:'Galpão para alugar, 600 m² - Moinho dos Ventos'}
];
const realRanked = run(node(search,'04 Filtrar e ranquear'), {
  $:name=>({first:()=>({json:prepared})}),
  $input:{all:()=>actualOptions.map(json=>({json}))}
})[0].json;
assert(realRanked.count===2, 'Busca realista deveria encontrar dois galpões');
const realReply = run(node(search,'05 Montar resposta'), {$json:realRanked})[0].json.reply;
assert(realReply.includes('Setor Universitário') && realReply.includes('Moinho dos Ventos') && realReply.includes('\n\n'), 'Duas opções devem ser apresentadas em blocos');
console.log(`${cases.length} cenários de decisão, perfil e parceria + busca de imóveis: OK`);
