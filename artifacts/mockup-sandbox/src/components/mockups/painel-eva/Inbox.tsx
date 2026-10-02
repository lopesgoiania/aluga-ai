import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowUpRight, AudioLines, Bot, Building2, Check, CheckCheck,
  ChevronDown, ChevronRight, CircleHelp, Clock3, FileText, Filter, Headphones, Home, Inbox as InboxIcon,
  Info, LayoutDashboard, Link2, ListFilter, MoreHorizontal, Paperclip, Search, Send, Settings2,
  ShieldCheck, Sparkles, Tag, User, UserRound, Users, X,
} from "lucide-react";

type ThreadState = "Eva ativa" | "Aguardando atendimento" | "Humano assumiu" | "Encerrada";
type Message = { from: "client" | "eva" | "human" | "system"; text: string; time: string; kind?: "audio" | "property" };
type Thread = { id: number; name: string; initials: string; neighborhood: string; preview: string; time: string; unread: number; state: ThreadState; priority: string; tags: string[]; phone: string; messages: Message[] };

const initialThreads: Thread[] = [
  { id: 1, name: "Marina Vasconcelos", initials: "MV", neighborhood: "Funcionários · Belo Horizonte", preview: "Gostei do apartamento da Rua Aimorés", time: "há 4 min", unread: 2, state: "Eva ativa", priority: "Normal", tags: ["Novo lead", "Locação"], phone: "(31) 99124-6807", messages: [
    { from: "system", text: "Conversa iniciada pelo WhatsApp · hoje, 10:18", time: "10:18" },
    { from: "client", text: "Oi, estou procurando um apartamento de 2 quartos em BH. Vocês têm algo perto do centro?", time: "10:18" },
    { from: "eva", text: "Oi, Marina! Temos algumas opções que podem combinar com o que você procura. Qual faixa de aluguel mensal seria confortável para você?", time: "10:19" },
    { from: "client", text: "Até uns R$ 3.200, se tiver garagem.", time: "10:20" },
    { from: "eva", text: "Encontrei uma opção no Funcionários com 2 quartos e 1 vaga, dentro dessa faixa. Vou te mandar os detalhes.", time: "10:21" },
    { from: "eva", text: "Apartamento · LA-2841\nRua Aimorés, 1840 — Funcionários\n2 quartos · 68 m² · 1 vaga\nR$ 2.890/mês + encargos", time: "10:21", kind: "property" },
    { from: "client", text: "Gostei do apartamento da Rua Aimorés. Queria saber se aceita pet e se posso visitar amanhã.", time: "10:24" },
  ] },
  { id: 2, name: "Rafael Mendes", initials: "RM", neighborhood: "Savassi · Belo Horizonte", preview: "Preciso falar com uma pessoa, por favor", time: "há 7 min", unread: 1, state: "Aguardando atendimento", priority: "Alta", tags: ["Aguardando", "Locação"], phone: "(31) 98803-1542", messages: [
    { from: "client", text: "O boleto veio com um valor diferente do contrato.", time: "10:11" },
    { from: "eva", text: "Entendo, Rafael. Vou chamar uma pessoa da equipe para conferir isso com você.", time: "10:12" },
    { from: "system", text: "Eva solicitou atendimento humano · 10:12", time: "10:12" },
    { from: "client", text: "Preciso falar com uma pessoa, por favor", time: "10:13" },
  ] },
  { id: 3, name: "Bianca Oliveira", initials: "BO", neighborhood: "Lourdes · Belo Horizonte", preview: "Pode me enviar o áudio novamente?", time: "há 18 min", unread: 0, state: "Humano assumiu", priority: "Normal", tags: ["Em atendimento", "Proprietária"], phone: "(31) 99752-0314", messages: [
    { from: "client", text: "Queria entender como funciona a vistoria de saída.", time: "09:48" },
    { from: "human", text: "Claro, Bianca. Vou te explicar as etapas e já verifico a agenda para você.", time: "09:51" },
    { from: "client", text: "Pode me enviar o áudio novamente?", time: "10:06", kind: "audio" },
  ] },
  { id: 4, name: "André Luiz", initials: "AL", neighborhood: "Buritis · Belo Horizonte", preview: "Obrigado, vou pensar e retorno.", time: "há 36 min", unread: 0, state: "Eva ativa", priority: "Baixa", tags: ["Novo lead"], phone: "(31) 98416-2270", messages: [
    { from: "client", text: "Procuro uma casa com quintal no Buritis.", time: "09:32" },
    { from: "eva", text: "Entendi, André. Você tem uma previsão de mudança?", time: "09:34" },
    { from: "client", text: "Obrigado, vou pensar e retorno.", time: "09:42" },
  ] },
  { id: 5, name: "Camila Rocha", initials: "CR", neighborhood: "Pampulha · Belo Horizonte", preview: "Comprovante de renda.pdf", time: "ontem", unread: 0, state: "Encerrada", priority: "Normal", tags: ["Documentação"], phone: "(31) 99300-6118", messages: [
    { from: "client", text: "Comprovante de renda.pdf", time: "ontem", kind: "audio" },
    { from: "system", text: "Atendimento encerrado por Júlia · ontem, 16:42", time: "16:42" },
  ] },
];

const navItems = [
  { name: "Visão geral", icon: LayoutDashboard }, { name: "Atendimentos", icon: InboxIcon, count: "18" },
  { name: "Fila humana", icon: Headphones, count: "4" }, { name: "Leads / CRM", icon: Users },
  { name: "Imóveis", icon: Building2 }, { name: "Alertas", icon: AlertCircle, count: "2" },
];

function StatePill({ state }: { state: ThreadState }) {
  const styles: Record<ThreadState, string> = {
    "Eva ativa": "border-indigo-200 bg-indigo-50 text-indigo-700",
    "Aguardando atendimento": "border-amber-200 bg-amber-50 text-amber-800",
    "Humano assumiu": "border-blue-200 bg-blue-50 text-blue-700",
    "Encerrada": "border-slate-200 bg-slate-100 text-slate-600",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[state]}`}>
    {state === "Eva ativa" ? <Sparkles size={12} /> : state === "Humano assumiu" ? <UserRound size={12} /> : state === "Aguardando atendimento" ? <Clock3 size={12} /> : <Check size={12} />}
    {state}
  </span>;
}

function Avatar({ initials, large = false }: { initials: string; large?: boolean }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-full bg-[#e7effa] font-semibold text-[#315b88] ${large ? "h-11 w-11 text-sm" : "h-10 w-10 text-xs"}`}>{initials}</div>;
}

export function Inbox() {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState(1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todas");
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState<"return" | "close" | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "chat" | "context">("chat");
  const [showContext, setShowContext] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const latestMessageRef = useRef<HTMLDivElement>(null);

  const selected = threads.find((thread) => thread.id === selectedId) ?? threads[0];
  const filteredThreads = useMemo(() => threads.filter((thread) => {
    const matchesQuery = `${thread.name} ${thread.preview} ${thread.neighborhood}`.toLowerCase().includes(query.toLowerCase());
    const matchesState = filter === "Todas" || thread.state === filter;
    return matchesQuery && matchesState;
  }), [threads, query, filter]);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: "end" });
  }, [selected.id, selected.messages.length]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const updateThread = (id: number, changes: Partial<Thread>) => setThreads((current) => current.map((thread) => thread.id === id ? { ...thread, ...changes } : thread));
  const takeOver = () => {
    updateThread(selected.id, { state: "Humano assumiu", tags: [...new Set([...selected.tags.filter((tag) => tag !== "Aguardando"), "Em atendimento"])] });
    notify("Atendimento assumido por você. Eva pausada.");
  };
  const sendMessage = () => {
    if (!draft.trim()) return;
    const nextMessage: Message = { from: internal ? "system" : "human", text: internal ? `Nota interna: ${draft.trim()}` : draft.trim(), time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    updateThread(selected.id, { messages: [...selected.messages, nextMessage], preview: internal ? "Nota interna adicionada" : draft.trim(), time: "agora", state: internal ? selected.state : "Humano assumiu" });
    setDraft("");
    if (internal) notify("Nota interna registrada nesta demonstração.");
    else notify("Mensagem enviada nesta demonstração. Entrega não confirmada.");
  };
  const chooseThread = (id: number) => {
    setSelectedId(id);
    setMobilePane("chat");
    const next = threads.find((thread) => thread.id === id);
    if (next?.unread) updateThread(id, { unread: 0 });
  };
  const closeConversation = () => {
    if (confirm === "return") {
      updateThread(selected.id, { state: "Eva ativa", tags: selected.tags.filter((tag) => tag !== "Em atendimento" && tag !== "Aguardando") });
      notify("Conversa devolvida à Eva. A IA está ativa novamente.");
    } else if (confirm === "close") {
      updateThread(selected.id, { state: "Encerrada" });
      notify("Conversa encerrada nesta demonstração.");
    }
    setConfirm(null);
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] overflow-hidden bg-[#f3f6fa] text-[#1c2b33] [font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]">
      <div className="flex h-full min-h-0">
        <aside className={`${mobileNav ? "fixed inset-y-0 left-0 z-40 flex w-[250px]" : "hidden"} w-[230px] shrink-0 flex-col border-r border-[#e3e9f0] bg-[#fbfcfe] px-4 py-5 md:flex`}>
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#0669e1] text-white shadow-[0_5px_12px_rgba(6,105,225,.22)]">
              <Home size={19} strokeWidth={2.2} /><span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#4f46e5]" />
            </div>
            <div><div className="text-[16px] font-bold tracking-[-.04em]">Painel Eva</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#77879a]">Lopes Aluga</div></div>
          </div>
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#91a0b2]">Operação</div>
          <nav className="space-y-1">
            {navItems.map(({ name, icon: Icon, count }) => {
              const active = name === "Atendimentos";
              return <button key={name} onClick={() => name !== "Atendimentos" && notify(`${name} estará disponível nesta demonstração.`)} className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium transition-colors ${active ? "bg-[#eaf3ff] text-[#075fc7] shadow-[inset_3px_0_0_#0669e1]" : "text-[#617286] hover:bg-[#f0f4f8] hover:text-[#253747]"}`}>
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} /><span className="flex-1">{name}</span>{count && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white text-[#0669e1]" : "bg-[#eef2f6] text-[#74849a]"}`}>{count}</span>}
              </button>;
            })}
          </nav>
          <div className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#91a0b2]">Administração</div>
          <nav className="space-y-1">
            {[["Relatórios", LayoutDashboard], ["Equipe", Users], ["Configurações", Settings2]].map(([name, Icon]) => {
              const NavIcon = Icon as typeof Settings2;
              return <button key={name as string} onClick={() => notify(`${name} estará disponível nesta demonstração.`)} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium text-[#617286] transition-colors hover:bg-[#f0f4f8]"><NavIcon size={17} strokeWidth={1.8} /><span>{name as string}</span></button>;
            })}
          </nav>
          <div className="mt-auto">
            <div className="mb-4 rounded-xl border border-[#dce9f0] bg-[#f4faf9] p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#176858]"><span className="h-2 w-2 rounded-full bg-[#1da77b]" /> WhatsApp conectado</div>
              <div className="mt-1.5 pl-4 text-[10px] text-[#78918b]">Instância Lopes Aluga · há 2 min</div>
            </div>
            <button onClick={() => notify("Perfil de Júlia Martins · Atendente")} className="flex w-full items-center gap-3 border-t border-[#e9edf2] pt-4 text-left">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dfe9f6] text-xs font-bold text-[#365b84]">JM</div>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">Júlia Martins</span><span className="text-[10px] text-[#8391a2]">Atendente</span></span><MoreHorizontal size={17} className="text-[#8795a6]" />
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[62px] shrink-0 items-center gap-3 border-b border-[#e1e7ee] bg-[#fbfcfe] px-4 md:px-7">
            <button className="rounded-lg p-2 text-[#64748b] hover:bg-[#eff3f7] md:hidden" onClick={() => setMobileNav((value) => !value)} aria-label="Abrir navegação"><ListFilter size={18} /></button>
            <div className="hidden items-center gap-2 text-[12px] text-[#8492a3] sm:flex"><span>Operação</span><ChevronRight size={14} /><span className="font-semibold text-[#35485b]">Atendimentos</span></div>
            <div className="ml-auto flex items-center gap-2">
              <div className={`${searchOpen ? "flex" : "hidden"} absolute left-4 right-16 top-[70px] z-20 sm:static sm:flex sm:w-[250px]`}>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90a0b1]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar em atendimentos..." className="h-9 w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] pl-9 pr-3 text-xs outline-none placeholder:text-[#a2adba] focus:border-[#7eb3ef] focus:bg-white focus:ring-2 focus:ring-[#0669e1]/10" />
              </div>
              <button onClick={() => setSearchOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6c7b8d] hover:bg-[#eff3f7] sm:hidden" aria-label="Buscar"><Search size={17} /></button>
              <button onClick={() => notify("Central de ajuda da operação")} className="hidden h-9 w-9 items-center justify-center rounded-lg text-[#718196] hover:bg-[#eff3f7] sm:flex" aria-label="Ajuda"><CircleHelp size={17} /></button>
              <div className="hidden h-8 items-center gap-2 rounded-lg border border-[#e6ebf1] bg-white px-2.5 text-[11px] font-medium text-[#617286] md:flex"><span className="h-2 w-2 rounded-full bg-[#20a574]" /> Ambiente de demonstração <ChevronDown size={13} /></div>
            </div>
          </header>

          <section className="flex min-h-0 flex-1 flex-col p-3 md:p-5">
            <div className="mb-4 flex shrink-0 items-end justify-between gap-3 px-1">
              <div><div className="flex items-center gap-2"><h1 className="text-[22px] font-bold tracking-[-.04em] text-[#203243]">Atendimentos</h1><span className="rounded-md bg-[#e9eef4] px-2 py-1 text-[10px] font-semibold text-[#647589]">18 ativos</span></div>
                <p className="mt-1 text-[12px] text-[#7a8a9c]">Acompanhe a Eva e entre na conversa quando precisar.</p></div>
              <button onClick={() => notify("Os filtros avançados estão prontos para configuração.")} className="hidden h-9 items-center gap-2 rounded-lg border border-[#dce4ec] bg-white px-3 text-[11px] font-semibold text-[#5e7186] shadow-sm transition hover:bg-[#f8fafc] sm:flex"><Filter size={14} /> Filtros <span className="rounded-full bg-[#e9f2fe] px-1.5 py-0.5 text-[9px] text-[#0669e1]">2</span></button>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden rounded-[16px] border border-[#dde5ed] bg-white shadow-[0_5px_20px_rgba(36,60,83,.055)]">
              <section className={`${mobilePane === "list" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-[#e7edf3] md:flex md:w-[280px] lg:w-[300px]`}>
                <div className="border-b border-[#e9eef4] px-4 pb-3 pt-4">
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-bold">Caixa de entrada</h2><button onClick={() => notify("Lista atualizada nesta demonstração.")} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8090a1] hover:bg-[#f2f5f8]" aria-label="Atualizar lista"><ArrowDown size={15} /></button></div>
                  <div className="mb-3 flex rounded-lg bg-[#f1f4f8] p-1">
                    {["Todas", "Eva ativa", "Aguardando atendimento"].map((item) => <button key={item} onClick={() => setFilter(item)} className={`flex-1 rounded-md px-1 py-1.5 text-[10px] font-semibold transition ${filter === item ? "bg-white text-[#315d89] shadow-sm" : "text-[#8492a3] hover:text-[#41556b]"}`}>{item === "Aguardando atendimento" ? "Fila humana" : item}</button>)}
                  </div>
                  <div className="flex items-center justify-between px-0.5 text-[10px] text-[#8b99a9]"><span>{filteredThreads.length} conversas</span><button onClick={() => setFilter(filter === "Todas" ? "Aguardando atendimento" : "Todas")} className="inline-flex items-center gap-1 hover:text-[#0669e1]"><ListFilter size={13} /> Estado <ChevronDown size={12} /></button></div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {filteredThreads.map((thread) => <button key={thread.id} onClick={() => chooseThread(thread.id)} className={`relative flex w-full gap-3 border-b border-[#f0f3f6] px-4 py-3.5 text-left transition-colors hover:bg-[#f8fafc] ${selected.id === thread.id ? "bg-[#f0f6ff]" : ""}`}>
                    {selected.id === thread.id && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[#0669e1]" />}
                    <div className="relative"><Avatar initials={thread.initials} />{thread.state === "Eva ativa" && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[#5c52dd] text-white"><Sparkles size={8} /></span>}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-[12px] font-semibold text-[#2c3d4f]">{thread.name}</span><span className="shrink-0 text-[9px] text-[#9aa6b4]">{thread.time}</span></div>
                      <p className="mt-0.5 truncate text-[10px] text-[#8a98a8]">{thread.neighborhood}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2"><p className="truncate text-[11px] text-[#687b8e]">{thread.preview}</p>{thread.unread > 0 && <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#0669e1] px-1 text-[9px] font-bold text-white">{thread.unread}</span>}</div>
                      <div className="mt-2 flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${thread.state === "Eva ativa" ? "bg-[#6559df]" : thread.state === "Aguardando atendimento" ? "bg-[#e4a325]" : thread.state === "Humano assumiu" ? "bg-[#3983d5]" : "bg-[#a8b3bf]"}`} /><span className="truncate text-[9px] font-medium text-[#8291a1]">{thread.state}</span>{thread.priority === "Alta" && <span className="ml-auto rounded bg-[#fff2df] px-1.5 py-0.5 text-[9px] font-semibold text-[#a4610d]">Prioridade alta</span>}</div>
                    </div>
                  </button>)}
                  {filteredThreads.length === 0 && <div className="mx-4 my-6 rounded-xl border border-dashed border-[#d9e2eb] bg-[#f8fafc] p-5 text-center"><Search className="mx-auto mb-2 text-[#9baaba]" size={19} /><p className="text-xs font-semibold text-[#506276]">Nenhuma conversa encontrada</p><p className="mt-1 text-[10px] text-[#8998a9]">Tente outro nome ou filtro.</p></div>}
                </div>
                <div className="border-t border-[#e9eef4] px-4 py-2.5 text-[10px] text-[#94a1b0]">Atualizado há 30 segundos <span className="float-right inline-flex items-center gap-1 text-[#278563]"><span className="h-1.5 w-1.5 rounded-full bg-[#23a675]" /> ao vivo</span></div>
              </section>

              <section className={`${mobilePane === "chat" ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-[#f9fbfd] md:flex`}>
                <div className="flex min-h-[66px] shrink-0 items-center gap-3 border-b border-[#e6ecf2] bg-white px-4 py-3 md:px-5">
                  <button onClick={() => setMobilePane("list")} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#708196] hover:bg-[#f2f5f8] md:hidden" aria-label="Voltar para lista"><ArrowLeft size={17} /></button>
                  <Avatar initials={selected.initials} />
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h2 className="text-[13px] font-bold text-[#233548]">{selected.name}</h2><span className="hidden text-[10px] text-[#9aa6b4] sm:inline">·</span><span className="hidden text-[10px] text-[#8291a2] sm:inline">{selected.phone}</span></div><div className="mt-1 flex flex-wrap items-center gap-2"><StatePill state={selected.state} /><span className="hidden text-[10px] text-[#95a2b1] sm:inline">{selected.neighborhood}</span></div></div>
                  <button onClick={() => setShowContext((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e4eaf0] text-[#6c7f93] hover:bg-[#f5f8fb] lg:hidden" aria-label="Mostrar contexto"><Info size={16} /></button>
                  <button onClick={() => setAssignOpen((value) => !value)} className="hidden h-9 items-center gap-1.5 rounded-lg border border-[#e1e7ed] bg-white px-3 text-[11px] font-semibold text-[#52667b] hover:bg-[#f8fafc] sm:flex"><UserRound size={14} /> Atribuir <ChevronDown size={12} /></button>
                  <button onClick={() => notify("Mais opções de conversa")} className="flex h-9 w-8 items-center justify-center rounded-lg text-[#718196] hover:bg-[#f2f5f8]" aria-label="Mais opções"><MoreHorizontal size={18} /></button>
                </div>
                {assignOpen && <div className="relative z-10 mx-auto mt-2 w-[240px] rounded-xl border border-[#dce5ed] bg-white p-2 shadow-[0_12px_28px_rgba(30,55,80,.14)]"><div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8997a7]">Atribuir conversa</div>{["Júlia Martins · você", "Pedro Azevedo · Atendente", "Equipe de locação"].map((person) => <button key={person} onClick={() => { setAssignOpen(false); notify(`Conversa atribuída: ${person.split(" · ")[0]}.`); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-[#465b70] hover:bg-[#f2f6fa]"><UserRound size={14} className="text-[#7890a8]" />{person}</button>)}</div>}

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-7">
                  <div className="mb-5 flex items-center justify-center"><div className="rounded-full border border-[#e6ebf0] bg-white px-3 py-1 text-[9px] font-medium text-[#94a0ad] shadow-sm">Hoje · Atendimento pelo WhatsApp</div></div>
                  <div className="space-y-4">
                    {selected.messages.map((message, index) => {
                      if (message.from === "system") return <div key={`${index}-${message.time}`} className="flex justify-center"><div className="flex max-w-[90%] items-center gap-2 rounded-full border border-[#e6ebf0] bg-white px-3 py-1.5 text-[9px] text-[#8a98a7]"><ShieldCheck size={12} className="text-[#94a3b8]" />{message.text}</div></div>;
                      const isClient = message.from === "client";
                      const isEva = message.from === "eva";
                      return <div key={`${index}-${message.time}`} className={`flex ${isClient ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[88%] sm:max-w-[76%] ${isClient ? "" : "items-end"}`}>
                          <div className={`mb-1 flex items-center gap-1.5 px-1 text-[9px] font-semibold ${isClient ? "text-[#8190a0]" : "justify-end text-[#8190a0]"}`}>
                            {isClient ? <><span>{selected.name.split(" ")[0]}</span></> : <>{isEva ? <><Sparkles size={10} className="text-[#6559dc]" /><span className="text-[#5c52c9]">Eva</span></> : <><UserRound size={10} className="text-[#176db9]" /><span className="text-[#176db9]">Júlia · Atendente</span></>}</>}
                            <span className="font-normal text-[#a3aeb9]">· {message.time}</span>
                          </div>
                          {message.kind === "audio" ? <div className={`flex min-w-[220px] items-center gap-3 rounded-[14px] border px-3.5 py-3 ${isClient ? "border-[#e3e9ef] bg-white" : "border-[#dbe8f7] bg-[#edf5ff]"}`}><button onClick={() => notify("Reprodução de áudio ilustrativa.")} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f1fb] text-[#3e719f]" aria-label="Reproduzir áudio"><AudioLines size={15} /></button><div className="flex-1"><div className="h-[3px] rounded bg-[#d9e3ed]"><div className="h-full w-[35%] rounded bg-[#76a8d8]" /></div><span className="mt-1 block text-[9px] text-[#8d9bab]">Áudio · 0:18</span></div></div> :
                          message.kind === "property" ? <div className="max-w-[340px] rounded-[14px] border border-[#dfe8f1] bg-white p-3.5 shadow-[0_2px_8px_rgba(30,55,80,.04)]"><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.08em] text-[#657b91]"><Building2 size={13} className="text-[#0669e1]" /> Imóvel apresentado pela Eva</div><div className="rounded-lg bg-[#f1f5f8] p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-bold text-[#2d4052]">Apartamento · LA-2841</div><div className="mt-1 text-[10px] text-[#748599]">Rua Aimorés, 1840 — Funcionários</div></div><ArrowUpRight size={14} className="text-[#8b9aac]" /></div><div className="mt-2 flex items-center gap-2 text-[10px] text-[#728398]"><span>2 quartos</span><span className="text-[#c0c9d2]">·</span><span>68 m²</span><span className="text-[#c0c9d2]">·</span><span>1 vaga</span></div><div className="mt-2 text-[13px] font-bold text-[#245d96]">R$ 2.890<span className="text-[9px] font-normal text-[#8291a1]"> / mês + encargos</span></div></div><div className="mt-2 flex items-center gap-1 text-[9px] text-[#91a0af]"><CheckCheck size={12} className="text-[#6e9ac4]" /> Enviado · entrega não confirmada</div></div> :
                          <div className={`whitespace-pre-line rounded-[14px] px-3.5 py-2.5 text-[12px] leading-[1.55] shadow-[0_1px_2px_rgba(30,55,80,.04)] ${isClient ? "rounded-tl-[5px] bg-white text-[#405368] ring-1 ring-[#e8edf2]" : isEva ? "rounded-tr-[5px] bg-[#efefff] text-[#3f4270]" : "rounded-tr-[5px] bg-[#eaf3ff] text-[#315371]"}`}>{message.text}<div className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${isClient ? "text-[#a0acb9]" : "text-[#91a6bc]"}`}>{message.time}{!isClient && <CheckCheck size={12} />}</div></div>}
                        </div>
                      </div>;
                    })}
                    <div ref={latestMessageRef} />
                  </div>
                  {selected.state === "Eva ativa" && <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#dedcf9] bg-[#f4f3ff] px-3 py-2.5"><div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#e7e5ff] text-[#5d55cf]"><Bot size={14} /></div><div><div className="text-[10px] font-semibold text-[#514ca5]">Eva está conduzindo esta conversa</div><p className="mt-0.5 text-[9px] leading-relaxed text-[#7775a8]">Assuma para responder manualmente. A Eva será pausada automaticamente.</p></div></div>}
                </div>

                <div className="shrink-0 border-t border-[#e4eaf0] bg-white p-3 md:px-5 md:py-3.5">
                  {selected.state === "Humano assumiu" ?
                    <><div className="mb-2 flex items-center justify-between"><span className={`flex items-center gap-1.5 text-[10px] font-semibold ${internal ? "text-[#946215]" : "text-[#687b8e]"}`}>{internal ? <><FileText size={12} /> Nota interna · só equipe vê</> : <><UserRound size={12} /> Respondendo como Júlia</>}</span><button onClick={() => setInternal((value) => !value)} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${internal ? "bg-[#fff4dd] text-[#95600e]" : "text-[#76889b] hover:bg-[#f1f5f8]"}`}>{internal ? "Voltar à resposta" : "Nota interna"}</button></div>
                      <div className={`rounded-xl border p-2 transition focus-within:ring-2 ${internal ? "border-[#ecd9ad] bg-[#fffdf7] focus-within:ring-[#d8a744]/15" : "border-[#dfe6ed] bg-[#fbfcfd] focus-within:border-[#9bc3ed] focus-within:ring-[#0669e1]/10"}`}>
                        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} rows={2} placeholder={internal ? "Escreva uma nota para a equipe..." : "Digite sua resposta. Enter para enviar."} className="max-h-24 min-h-[46px] w-full resize-none bg-transparent px-2 py-1 text-[12px] leading-relaxed text-[#344b60] outline-none placeholder:text-[#a0acb8]" />
                        <div className="flex items-center justify-between px-1 pb-0.5"><div className="flex gap-1"><button onClick={() => notify("Anexos disponíveis após integração.")} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8b9aaa] hover:bg-[#eef3f7]" aria-label="Anexar arquivo"><Paperclip size={15} /></button><button onClick={() => notify("Atalho de respostas rápidas em configuração.")} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8b9aaa] hover:bg-[#eef3f7]" aria-label="Respostas rápidas"><ChevronDown size={15} /></button></div><button onClick={sendMessage} disabled={!draft.trim()} className={`flex h-8 items-center gap-2 rounded-lg px-3 text-[10px] font-semibold transition ${draft.trim() ? "bg-[#0669e1] text-white hover:bg-[#0557bb]" : "cursor-not-allowed bg-[#edf1f5] text-[#aab5c0]"}`}>{internal ? "Salvar nota" : "Enviar"} {!internal && <Send size={12} />}</button></div>
                      </div><div className="mt-1.5 text-right text-[9px] text-[#a0aab5]">Mensagem demonstrativa · sem envio real pelo WhatsApp</div>
                    </> :
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2 text-[10px] leading-relaxed text-[#8190a0]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#94a4b4]" /><span>{selected.state === "Aguardando atendimento" ? "Cliente aguardando uma pessoa da equipe." : selected.state === "Encerrada" ? "Esta conversa foi encerrada." : "A Eva está ativa. Assuma para habilitar a resposta humana."}</span></div>
                      {selected.state === "Encerrada" ? <button onClick={() => { updateThread(selected.id, { state: "Eva ativa" }); notify("Conversa reaberta com Eva ativa."); }} className="h-9 rounded-lg border border-[#dce4ec] px-3 text-[10px] font-semibold text-[#5b7085] hover:bg-[#f6f8fa]">Reabrir conversa</button> : <button onClick={takeOver} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0669e1] px-4 text-[11px] font-semibold text-white shadow-[0_3px_8px_rgba(6,105,225,.17)] transition hover:bg-[#0557bb] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0669e1]/20"><UserRound size={14} /> Assumir atendimento</button>}
                    </div>}
                </div>
              </section>

              {showContext && <aside className={`${mobilePane === "context" ? "flex" : "hidden"} w-full shrink-0 flex-col border-l border-[#e7edf3] bg-white md:hidden lg:flex lg:w-[270px] xl:w-[290px]`}>
                <div className="flex h-[66px] shrink-0 items-center justify-between border-b border-[#e8edf2] px-4"><h2 className="text-[12px] font-bold text-[#364a5f]">Contexto do atendimento</h2><button onClick={() => setShowContext(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8291a1] hover:bg-[#f2f5f8] lg:hidden" aria-label="Fechar contexto"><X size={15} /></button></div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
                  <div className="flex flex-col items-center border-b border-[#edf1f5] py-5 text-center"><Avatar initials={selected.initials} large /><h3 className="mt-2.5 text-[13px] font-bold">{selected.name}</h3><p className="mt-1 text-[10px] text-[#8795a4]">{selected.phone}</p><button onClick={() => notify("Perfil completo disponível na ficha do lead.")} className="mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-[#e3e9ef] px-3 text-[10px] font-semibold text-[#5f7286] hover:bg-[#f8fafc]">Ver ficha do lead <ArrowUpRight size={12} /></button></div>
                  <div className="border-b border-[#edf1f5] py-4"><div className="mb-2.5 flex items-center justify-between"><h3 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#8190a0]">Etiquetas</h3><button onClick={() => notify("Gerenciamento de etiquetas de demonstração.")} className="text-[10px] font-semibold text-[#0669e1]">Editar</button></div><div className="flex flex-wrap gap-1.5">{selected.tags.map((tagName) => <span key={tagName} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold ${tagName === "Aguardando" ? "bg-[#fff4de] text-[#976318]" : tagName === "Em atendimento" ? "bg-[#e9f3ff] text-[#2369ad]" : tagName === "Novo lead" ? "bg-[#eaf6f2] text-[#337861]" : "bg-[#f0f2f6] text-[#68798c]"}`}><Tag size={10} />{tagName}</span>)}</div></div>
                  <div className="border-b border-[#edf1f5] py-4"><div className="mb-2.5 flex items-center gap-2"><Sparkles size={13} className="text-[#5b53d0]" /><h3 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#8190a0]">Resumo da Eva</h3></div><p className="text-[11px] leading-[1.65] text-[#607387]">Busca apartamento de 2 quartos na região central de BH, com garagem. Orçamento de até R$ 3.200. Demonstrou interesse no imóvel da Rua Aimorés e perguntou sobre pets e visita.</p><div className="mt-2 text-[9px] text-[#a0abb7]">Atualizado às 10:22 · gerado pela Eva</div></div>
                  <div className="border-b border-[#edf1f5] py-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.1em] text-[#8190a0]">Critérios de busca</h3><div className="space-y-2 text-[10px]"><div className="flex justify-between"><span className="text-[#8997a6]">Tipo</span><span className="font-medium text-[#52677b]">Apartamento</span></div><div className="flex justify-between"><span className="text-[#8997a6]">Região</span><span className="font-medium text-[#52677b]">Centro / Funcionários</span></div><div className="flex justify-between"><span className="text-[#8997a6]">Quartos</span><span className="font-medium text-[#52677b]">2</span></div><div className="flex justify-between"><span className="text-[#8997a6]">Aluguel até</span><span className="font-semibold text-[#3e688e]">R$ 3.200</span></div><div className="flex justify-between"><span className="text-[#8997a6]">Garagem</span><span className="font-medium text-[#52677b]">Sim</span></div></div></div>
                  <div className="border-b border-[#edf1f5] py-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#8190a0]">Imóveis apresentados</h3><span className="rounded-full bg-[#edf3f9] px-1.5 py-0.5 text-[9px] font-bold text-[#6b8096]">1</span></div><button onClick={() => notify("Imóvel LA-2841 · disponibilidade sujeita a confirmação.")} className="w-full rounded-xl border border-[#e5ebf1] bg-[#fafbfd] p-3 text-left transition hover:border-[#c8d7e6]"><div className="flex items-start justify-between"><span className="text-[10px] font-bold text-[#3d566c]">LA-2841 · Funcionários</span><ArrowUpRight size={12} className="text-[#8293a4]" /></div><div className="mt-1 text-[9px] text-[#8191a1]">2 quartos · 68 m² · 1 vaga</div><div className="mt-1.5 text-[11px] font-bold text-[#376c9e]">R$ 2.890 / mês</div><div className="mt-2 flex items-center gap-1 text-[9px] text-[#929eaa]"><CheckCheck size={11} /> Enviado pela Eva · 10:21</div></button><div className="mt-2 text-[9px] leading-relaxed text-[#98a4b1]">Disponibilidade e condições devem ser confirmadas com a equipe.</div></div>
                  <div className="py-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.1em] text-[#8190a0]">Responsável e histórico</h3><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e7eff8] text-[9px] font-bold text-[#4b6b8b]">JM</div><div><div className="text-[10px] font-semibold text-[#4d6175]">{selected.state === "Humano assumiu" ? "Júlia Martins" : "Sem responsável"}</div><div className="text-[9px] text-[#9aa6b2]">{selected.state === "Humano assumiu" ? "Atendente · você" : "Aguardando atribuição"}</div></div></div>
                    <div className="mt-3 border-l border-[#dfe6ed] pl-3"><div className="relative text-[9px] leading-relaxed text-[#75879a]"><span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full border-2 border-white bg-[#675ddd] ring-1 ring-[#d8d5f7]" />Eva iniciou o atendimento<span className="ml-1 text-[#a2acb8]">10:18</span></div>{selected.state === "Humano assumiu" && <div className="relative mt-2.5 text-[9px] leading-relaxed text-[#75879a]"><span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full border-2 border-white bg-[#3285cd] ring-1 ring-[#d3e7f9]" />Eva pausada · Júlia assumiu<span className="ml-1 text-[#a2acb8]">agora</span></div>}</div>
                  </div>
                </div>
                <div className="shrink-0 border-t border-[#e8edf2] bg-[#fcfdfe] p-3">
                  {selected.state === "Humano assumiu" ? <div className="flex gap-2"><button onClick={() => setConfirm("return")} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#dce5ed] bg-white text-[10px] font-semibold text-[#596f83] hover:bg-[#f4f7f9]"><Bot size={13} /> Devolver à Eva</button><button onClick={() => setConfirm("close")} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#dce5ed] bg-white text-[10px] font-semibold text-[#596f83] hover:bg-[#f4f7f9]"><Check size={13} /> Encerrar</button></div> :
                  selected.state !== "Encerrada" ? <button onClick={() => setConfirm("close")} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#dce5ed] bg-white text-[10px] font-semibold text-[#596f83] hover:bg-[#f4f7f9]"><Check size={13} /> Encerrar conversa</button> : <div className="text-center text-[9px] text-[#94a1ae]">Atendimento encerrado</div>}
                </div>
              </aside>}
            </div>
            <div className="mt-3 flex items-center justify-between px-1 text-[9px] text-[#97a4b1]"><span>Dados fictícios para demonstração · nenhuma mensagem será enviada</span><span className="hidden items-center gap-1 sm:flex"><Link2 size={11} /> Operação Lopes Aluga</span></div>
          </section>
          <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-[#dae3eb] bg-white p-1 shadow-[0_8px_24px_rgba(30,55,80,.16)] md:hidden">
            {([["list", "Conversas"], ["chat", "Mensagens"], ["context", "Contexto"]] as const).map(([pane, label]) => <button key={pane} onClick={() => { setMobilePane(pane); if (pane === "context") setShowContext(true); }} className={`rounded-full px-3 py-2 text-[10px] font-semibold ${mobilePane === pane ? "bg-[#eaf3ff] text-[#0669e1]" : "text-[#718398]"}`}>{label}</button>)}
          </div>
        </main>
      </div>

      {confirm && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#152536]/35 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="w-full max-w-[380px] rounded-2xl border border-[#e2e8ee] bg-white p-5 shadow-[0_20px_60px_rgba(22,39,57,.22)]"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef4fb] text-[#3d719f]">{confirm === "return" ? <Bot size={18} /> : <Check size={18} />}</div><h2 id="confirm-title" className="text-[15px] font-bold text-[#293e52]">{confirm === "return" ? "Devolver conversa à Eva?" : "Encerrar este atendimento?"}</h2><p className="mt-2 text-[11px] leading-relaxed text-[#75869a]">{confirm === "return" ? "A Eva voltará a responder automaticamente. O histórico da conversa será mantido." : "O atendimento será marcado como encerrado. Você poderá reabri-lo depois."} Esta alteração é apenas local nesta demonstração.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirm(null)} className="h-9 rounded-lg border border-[#dfe6ed] px-3.5 text-[10px] font-semibold text-[#617487] hover:bg-[#f5f7f9]">Cancelar</button><button onClick={closeConversation} className="h-9 rounded-lg bg-[#0669e1] px-3.5 text-[10px] font-semibold text-white hover:bg-[#0557bb]">{confirm === "return" ? "Devolver à Eva" : "Encerrar atendimento"}</button></div></div></div>}
      {toast && <div role="status" className="fixed bottom-16 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-[#d9e6df] bg-white px-4 py-3 text-[11px] font-medium text-[#426552] shadow-[0_8px_28px_rgba(28,55,40,.15)] md:bottom-5"><Check size={15} className="text-[#21956b]" />{toast}</div>}
    </div>
  );
}