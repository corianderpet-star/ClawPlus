import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  ChevronRight,
  Cpu,
  Gauge,
  Layers3,
  MessageSquareText,
  MoonStar,
  RadioTower,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Workflow,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TitleBar } from '@/components/layout/TitleBar';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { brandLogo, APP_NAME, APP_NAME_DISPLAY } from '@/lib/brand';
import minimaxIcon from '@/assets/providers/minimax.svg';
import moonshotIcon from '@/assets/providers/moonshot.svg';
import openaiIcon from '@/assets/providers/openai.svg';
import telegramIcon from '@/assets/channels/telegram.svg';
import qqbotIcon from '@/assets/channels/qqbot.svg';
import dingtalkIcon from '@/assets/channels/dingtalk.svg';
import './landing.css';

type LandingLocale = 'zh' | 'en';

type LandingCopy = (typeof LANDING_COPY)[LandingLocale];

const VALUE_ICONS = [Layers3, RadioTower, Sparkles] as const;
const FEATURE_ICONS = [Cpu, MessageSquareText, Bot, CalendarClock, Gauge, ShieldCheck] as const;
const PERSONA_ICONS = [Sparkles, RadioTower, Workflow] as const;

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.56,
    },
  },
};

const staggerCards = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const LANDING_COPY = {
  zh: {
    header: {
      nav: [
        { label: '价值主张', target: 'landing-value' },
        { label: '核心功能', target: 'landing-features' },
        { label: '工作流', target: 'landing-workflow' },
        { label: '适用场景', target: 'landing-audience' },
        { label: '常见问题', target: 'landing-faq' },
      ],
      workspace: '进入工作台',
      setup: '开始配置',
      themeLabel: '切换主题',
      localeLabel: '切换语言',
    },
    hero: {
      badge: 'Desktop Interface for OpenClaw',
      titleLead: '把 AI 入口从命令行',
      titleAccent: '搬回桌面',
      description:
        `${APP_NAME_DISPLAY} 把模型接入、消息频道、智能体协作、定时任务和 Token 观察整合进一个温和但强悍的桌面中控。你不用记住脚本和 YAML，也能把 OpenClaw 跑得井井有条。`,
      primaryReady: '进入工作台',
      primarySetup: '开始配置',
      secondary: '浏览能力模块',
      signalCards: [
        {
          eyebrow: '模型中控',
          title: '一个面板管理多家模型提供商',
          text: 'MiniMax、Moonshot、OpenAI、Ollama 等连接状态与默认模型集中展示，不再在多个页面来回确认。',
        },
        {
          eyebrow: '消息频道',
          title: '把入口统一到一个消息中枢',
          text: 'Telegram、QQ、钉钉等频道可以并行运行，并为不同智能体绑定不同渠道职责。',
        },
        {
          eyebrow: '自动化值班',
          title: '让智能体持续工作而不是只会聊天',
          text: '日报、巡检、内容整理与分发都能挂到 Cron，让 AI 从对话界面走向稳定执行。',
        },
      ],
      proofItems: [
        { label: '桌面技术栈', value: 'Electron 40 + React 19' },
        { label: '运行方式', value: 'Gateway 自动拉起' },
        { label: '安全存储', value: '本地设置 + 系统钥匙串' },
      ],
      console: {
        eyebrow: 'Live Workspace',
        title: '模型、频道、智能体与任务，在一页里协同',
        transport: 'WS -> HTTP -> IPC',
        status: 'Ready',
        metrics: [
          { label: '已连接模型', value: '12+', hint: '含本地回退' },
          { label: '在线频道', value: '6', hint: '多机器人并发' },
          { label: '值班智能体', value: '4', hint: '分层角色协作' },
          { label: 'Token 回放', value: '28', hint: '结构化记录' },
        ],
        lanes: [
          {
            title: '模型层',
            note: 'Provider routing',
            badge: 'Default chain',
            items: [
              {
                icon: minimaxIcon,
                invert: true,
                name: 'MiniMax (Global)',
                tag: 'Default',
                text: 'OAuth 设备登录 · MiniMax-M2.5',
              },
              {
                icon: moonshotIcon,
                invert: true,
                name: 'Moonshot (CN)',
                tag: 'Context',
                text: '中文长上下文与资料整理',
              },
              {
                icon: openaiIcon,
                invert: true,
                name: 'OpenAI',
                tag: 'Fallback',
                text: '浏览器 OAuth 或 API Key 双模式',
              },
            ],
          },
          {
            title: '渠道层',
            note: 'Channel bindings',
            badge: 'Live routes',
            items: [
              {
                icon: telegramIcon,
                invert: false,
                name: 'Telegram',
                tag: 'assistant',
                text: '代码助手与总控机器人并行在线',
              },
              {
                icon: qqbotIcon,
                invert: false,
                name: 'QQ Bot',
                tag: 'community',
                text: '用插件连接群聊与运营入口',
              },
              {
                icon: dingtalkIcon,
                invert: false,
                name: 'DingTalk',
                tag: 'ops',
                text: '适合日报投递与内部提醒',
              },
            ],
          },
          {
            title: '任务层',
            note: 'Automation queue',
            badge: '24h running',
            items: [
              {
                icon: brandLogo,
                invert: false,
                name: '09:00 日报汇总',
                tag: 'cron',
                text: '按智能体分发站会摘要与待办',
              },
              {
                icon: brandLogo,
                invert: false,
                name: '渠道巡检',
                tag: 'watch',
                text: '失败任务保留状态与下次运行时间',
              },
              {
                icon: brandLogo,
                invert: false,
                name: '模型健康检查',
                tag: 'guard',
                text: '保留运行日志并准备切换回退链路',
              },
            ],
          },
        ],
        summary: [
          { label: '可视化控制面', value: '新对话、频道、仪表盘统一入口' },
          { label: 'Transport policy', value: '主进程固定兜底策略，前端不直接切换协议' },
          { label: '桌面体验', value: '首次引导、背景主题与多语言设置一体化' },
        ],
      },
    },
    value: {
      kicker: `Why ${APP_NAME}`,
      title: '不是再包一层 UI，而是把 AI 工作流真正变成桌面产品',
      description:
        `参考站点那种轻盈、可信、层次清晰的落地页节奏，我们把文案落回到 ${APP_NAME_DISPLAY} 的真实能力上：不吹概念，直接讲模型、频道、智能体、任务和观测怎么协同。`,
      items: [
        {
          title: '看得见的状态',
          text: '默认模型、渠道在线状态、任务结果与 Token 记录都可视化，不必再从日志里猜系统现在跑到哪一步。',
        },
        {
          title: '能编排的智能体',
          text: `${APP_NAME} 不止是聊天窗口。它把 agent 角色、渠道绑定与定时任务放在同一套桌面操作流里。`,
        },
        {
          title: '适合长期使用',
          text: '从 setup 引导到主题、背景、语言和凭据管理，这套界面是给每天都会打开的人准备的。',
        },
      ],
    },
    features: {
      kicker: 'Capabilities',
      title: '围绕真实使用场景设计，而不是只展示一次性对话',
      items: [
        {
          title: '模型提供商管理',
          text: '统一维护 OpenAI、Anthropic、Google、Moonshot、MiniMax、Ollama 与自定义兼容接口。',
        },
        {
          title: '多频道连接',
          text: '消息入口不再分散在脚本里。每个频道都可以单独绑定机器人账号和目标智能体。',
        },
        {
          title: '智能体组织图',
          text: '从单个工作助手到 lead/sub 层级协作，智能体结构能被看见，也能被配置。',
        },
        {
          title: '定时任务排程',
          text: '把日报、巡检、内容分发、状态同步放进 Cron，让 AI 真正接手重复劳动。',
        },
        {
          title: 'Token 仪表盘',
          text: '基于 structured transcript 汇总输入、输出、缓存与成本，不靠扒控制台文本。',
        },
        {
          title: '引导式 Setup',
          text: '首次进入时用图形界面完成运行时检查、Provider 配置与环境准备，降低 CLI 门槛。',
        },
      ],
    },
    workflow: {
      kicker: 'Workflow',
      title: '从接入到自动运行，四步就能成形',
      description: `页面是营销面的，但内容和路径必须真实可落地。下面这条链路就是 ${APP_NAME_DISPLAY} 在项目里已经成立的核心叙事。`,
      steps: [
        {
          title: '连接模型提供商',
          text: '在模型面板里选择默认模型、保存凭据并验证状态，支持本地模型与 OAuth 登录。',
        },
        {
          title: '挂上消息频道',
          text: '接入 Telegram、QQ 或企业沟通入口，让消息不再被散落在多个 bot 配置文件中。',
        },
        {
          title: '组织智能体角色',
          text: '为 coding、ops、director 等角色配置职责与层级，让一个项目里不只存在一个 AI 身份。',
        },
        {
          title: '交给定时任务和值班机制',
          text: '把日报、巡检、同步与补救动作放入 Cron，让代理持续执行并在仪表盘里可追踪。',
        },
      ],
    },
    audience: {
      kicker: 'Built for',
      title: '同一个界面，覆盖开发、运营与自动化值班',
      cards: [
        {
          badge: 'Code / Research',
          title: '开发者桌面',
          description: '适合把聊天、模型切换、技能安装和多智能体实验放在一个地方的人。',
          points: ['用多个 provider 对比同一任务', '把 coding agent 单独绑定到专属频道', '保留聊天历史与运行状态'],
        },
        {
          badge: 'Ops / Community',
          title: '运营中控台',
          description: '适合同时管理社区、群聊、投递与协作机器人的团队。',
          points: ['按频道绑定不同机器人账号', '让 director agent 负责总控调度', '把日报与提醒自动投递到内部渠道'],
        },
        {
          badge: 'Cron / Monitoring',
          title: '自动化岗哨',
          description: '适合长期值守的检查、汇总和应答任务，而不是只做单轮提问。',
          points: ['定时巡检模型可用性', '汇总 transcript 中的 Token 与成本', '失败任务保留状态方便回看'],
        },
      ],
    },
    faq: {
      kicker: 'FAQ',
      title: '常见问题',
      items: [
        {
          question: '一定要先配置 API Key 吗？',
          answer: '不一定。像 MiniMax、OpenAI、Google 这类提供商支持浏览器 OAuth；如果你使用 Ollama，本地模式也能先跑起来。',
        },
        {
          question: '没有 OpenClaw 经验也能上手吗？',
          answer: `可以。${APP_NAME_DISPLAY} 把首次引导、环境检查和 Provider 配置做成了 setup 流程，目标就是让命令行经验不再成为门槛。`,
        },
        {
          question: '前端会直接请求 Gateway 或频道接口吗？',
          answer: '不会。项目把调用入口固定在 host-api 与 main 进程代理上，尽量避免 CORS、环境漂移和协议切换逻辑散落到页面里。',
        },
        {
          question: '设置和凭据会存在哪里？',
          answer: '界面设置走 electron-store，本地凭据优先放进系统钥匙串；这也是桌面端比临时脚本更适合长期使用的原因之一。',
        },
      ],
    },
    cta: {
      kicker: 'Ready',
      title: '让你的 AI 配置、渠道和自动化，从零散脚本变成一块干净的桌面面板',
      description:
        `如果你已经在用 OpenClaw，${APP_NAME_DISPLAY} 会是更适合长期协作的那层界面；如果你刚准备开始，它也能把第一步做得更轻。`,
      primaryReady: '打开工作台',
      primarySetup: '进入向导',
      secondary: '回到顶部',
    },
    footer: {
      brandLine: `${APP_NAME} · The Desktop Interface for OpenClaw AI Agents`,
      note: `落地页结构参考了你提供的营销站点，但内容、信息层级和视觉组件都已经替换成适合 ${APP_NAME_DISPLAY} 的表达。`,
      top: '顶部',
    },
  },
  en: {
    header: {
      nav: [
        { label: 'Value', target: 'landing-value' },
        { label: 'Features', target: 'landing-features' },
        { label: 'Workflow', target: 'landing-workflow' },
        { label: 'Use Cases', target: 'landing-audience' },
        { label: 'FAQ', target: 'landing-faq' },
      ],
      workspace: 'Open Workspace',
      setup: 'Start Setup',
      themeLabel: 'Toggle theme',
      localeLabel: 'Toggle language',
    },
    hero: {
      badge: 'Desktop Interface for OpenClaw',
      titleLead: 'Bring your AI stack',
      titleAccent: 'back to the desktop',
      description:
        `${APP_NAME_DISPLAY} turns model setup, channel routing, agent coordination, scheduled tasks, and token visibility into one warm but capable control surface. No script juggling, no YAML hunting.`,
      primaryReady: 'Open Workspace',
      primarySetup: 'Start Setup',
      secondary: 'See capabilities',
      signalCards: [
        {
          eyebrow: 'Model control',
          title: 'Manage multiple providers from one calm panel',
          text: 'MiniMax, Moonshot, OpenAI, Ollama and more show their default routing and readiness in one place.',
        },
        {
          eyebrow: 'Message hub',
          title: 'Unify your inbound channels',
          text: 'Telegram, QQ, and internal messaging routes can run side by side while keeping agent bindings explicit.',
        },
        {
          eyebrow: 'Automation desk',
          title: 'Move from chat to repeatable execution',
          text: 'Daily reports, inspections, content passes, and agent handoffs can all live on a Cron-driven workflow.',
        },
      ],
      proofItems: [
        { label: 'Desktop stack', value: 'Electron 40 + React 19' },
        { label: 'Runtime', value: 'Gateway auto-start' },
        { label: 'Storage', value: 'Local settings + keychain' },
      ],
      console: {
        eyebrow: 'Live Workspace',
        title: 'Models, channels, agents, and tasks aligned in one surface',
        transport: 'WS -> HTTP -> IPC',
        status: 'Ready',
        metrics: [
          { label: 'Connected models', value: '12+', hint: 'with local fallback' },
          { label: 'Active channels', value: '6', hint: 'parallel bots' },
          { label: 'On-duty agents', value: '4', hint: 'layered roles' },
          { label: 'Token replays', value: '28', hint: 'structured usage data' },
        ],
        lanes: [
          {
            title: 'Model lane',
            note: 'Provider routing',
            badge: 'Default chain',
            items: [
              {
                icon: minimaxIcon,
                invert: true,
                name: 'MiniMax (Global)',
                tag: 'Default',
                text: 'OAuth device flow · MiniMax-M2.5',
              },
              {
                icon: moonshotIcon,
                invert: true,
                name: 'Moonshot (CN)',
                tag: 'Context',
                text: 'Long-context Chinese workflows',
              },
              {
                icon: openaiIcon,
                invert: true,
                name: 'OpenAI',
                tag: 'Fallback',
                text: 'Browser OAuth or API key mode',
              },
            ],
          },
          {
            title: 'Channel lane',
            note: 'Channel bindings',
            badge: 'Live routes',
            items: [
              {
                icon: telegramIcon,
                invert: false,
                name: 'Telegram',
                tag: 'assistant',
                text: 'Dedicated bots for coding and director roles',
              },
              {
                icon: qqbotIcon,
                invert: false,
                name: 'QQ Bot',
                tag: 'community',
                text: 'Plugin-driven community and ops entry',
              },
              {
                icon: dingtalkIcon,
                invert: false,
                name: 'DingTalk',
                tag: 'ops',
                text: 'Internal digests and operational alerts',
              },
            ],
          },
          {
            title: 'Task lane',
            note: 'Automation queue',
            badge: '24h running',
            items: [
              {
                icon: brandLogo,
                invert: false,
                name: '09:00 Daily digest',
                tag: 'cron',
                text: 'Distribute summaries through the assigned agent',
              },
              {
                icon: brandLogo,
                invert: false,
                name: 'Channel inspection',
                tag: 'watch',
                text: 'Keep failures visible with next-run timing',
              },
              {
                icon: brandLogo,
                invert: false,
                name: 'Provider health check',
                tag: 'guard',
                text: 'Logs stay available before fallback takes over',
              },
            ],
          },
        ],
        summary: [
          { label: 'Visual control', value: 'Chat, channels, dashboards, and settings stay connected' },
          { label: 'Transport policy', value: 'Main-owned fallback keeps protocol logic out of the UI' },
          { label: 'Desktop polish', value: 'Setup, theming, backgrounds, and language settings included' },
        ],
      },
    },
    value: {
      kicker: `Why ${APP_NAME}`,
      title: 'This is not just another shell over AI tools. It is a desktop workflow surface.',
      description:
        `The structure is inspired by your reference landing page, but every message here is grounded in what ${APP_NAME_DISPLAY} already does: providers, channels, agents, scheduling, and usage visibility.`,
      items: [
        {
          title: 'Visible system state',
          text: 'Default models, channel readiness, task outcomes, and token usage are inspectable without diving into logs first.',
        },
        {
          title: 'Agent orchestration',
          text: `${APP_NAME_DISPLAY} is more than a chat window. It puts roles, bindings, and scheduled execution into the same interface flow.`,
        },
        {
          title: 'Built for repeated use',
          text: 'Setup, theming, language, background, and secure credential handling make sense for a tool you open every day.',
        },
      ],
    },
    features: {
      kicker: 'Capabilities',
      title: 'Designed for repeatable work, not just one-off prompts',
      items: [
        {
          title: 'Provider management',
          text: 'Handle OpenAI, Anthropic, Google, Moonshot, MiniMax, Ollama, and custom compatible endpoints from one view.',
        },
        {
          title: 'Multi-channel connections',
          text: 'Message routes stop living in isolated scripts. Each channel can own its own account and assigned agent.',
        },
        {
          title: 'Agent org chart',
          text: 'Go from a single helper to lead/sub role hierarchies that are visible, configurable, and operational.',
        },
        {
          title: 'Cron scheduling',
          text: 'Move reports, inspections, content distribution, and syncing into scheduled agent workflows.',
        },
        {
          title: 'Token dashboard',
          text: 'Aggregate input, output, cache, and cost data from structured transcripts instead of fragile console parsing.',
        },
        {
          title: 'Guided setup',
          text: 'First-run onboarding handles runtime checks, provider selection, and environment prep through a UI flow.',
        },
      ],
    },
    workflow: {
      kicker: 'Workflow',
      title: 'From connection to automation in four steps',
      description: 'The page is marketing-facing, but the narrative stays truthful to what the product already supports today.',
      steps: [
        {
          title: 'Connect providers',
          text: 'Choose a default model, store credentials, and validate readiness with OAuth or local model support.',
        },
        {
          title: 'Attach channels',
          text: 'Bring Telegram, QQ, or internal messaging routes into the same workspace instead of isolated bot configs.',
        },
        {
          title: 'Shape agent roles',
          text: 'Set up coding, ops, director, or research personas so your project has more than one AI identity.',
        },
        {
          title: 'Hand work to schedules',
          text: 'Let Cron handle daily digests, inspections, and sync tasks while keeping outcomes visible in the app.',
        },
      ],
    },
    audience: {
      kicker: 'Built for',
      title: 'One interface for builders, operators, and automation duty',
      cards: [
        {
          badge: 'Code / Research',
          title: 'Builder desktop',
          description: 'Good for people who want chat, model switching, skill setup, and multi-agent experiments in one place.',
          points: ['Compare providers against the same task', 'Bind a coding agent to a dedicated channel', 'Keep runtime state and history visible'],
        },
        {
          badge: 'Ops / Community',
          title: 'Operations console',
          description: 'Fits teams managing communities, internal delivery, and message robots at the same time.',
          points: ['Bind distinct bot accounts per channel', 'Use a director agent for orchestration', 'Deliver digests automatically into internal routes'],
        },
        {
          badge: 'Cron / Monitoring',
          title: 'Automation watchtower',
          description: 'Works well for long-running checks, summaries, and response loops that should stay on duty.',
          points: ['Schedule provider health checks', 'Roll up transcript-based token and cost data', 'Keep failed jobs visible for review'],
        },
      ],
    },
    faq: {
      kicker: 'FAQ',
      title: 'Common questions',
      items: [
        {
          question: 'Do I need an API key before I can try it?',
          answer: 'Not always. Providers such as MiniMax, OpenAI, and Google can use OAuth flows, and Ollama can start in local mode first.',
        },
        {
          question: 'Can I use it without OpenClaw CLI experience?',
          answer: 'Yes. The setup flow covers runtime checks, provider choice, and environment prep so terminal experience is no longer the entry barrier.',
        },
        {
          question: 'Does the renderer call Gateway or channels directly?',
          answer: 'No. The project keeps renderer access behind host-api and main-process proxies to reduce CORS drift and protocol branching in UI code.',
        },
        {
          question: 'Where do settings and credentials live?',
          answer: 'UI settings live in electron-store while credentials are intended for the OS keychain, which makes the desktop app better for long-term use.',
        },
      ],
    },
    cta: {
      kicker: 'Ready',
      title: 'Turn scattered scripts, channels, and AI configuration into one composed desktop surface',
      description:
        `If you already use OpenClaw, ${APP_NAME_DISPLAY} gives that workflow a calmer long-term interface. If you are just starting, it makes the first mile much lighter.`,
      primaryReady: 'Open Workspace',
      primarySetup: 'Enter Setup',
      secondary: 'Back to top',
    },
    footer: {
      brandLine: `${APP_NAME} · The Desktop Interface for OpenClaw AI Agents`,
      note: `The overall pacing borrows from your reference site, but the copy, hierarchy, and components are rebuilt to fit ${APP_NAME_DISPLAY}.`,
      top: 'Top',
    },
  },
} as const;

function getLocale(language: string): LandingLocale {
  return language === 'zh' ? 'zh' : 'en';
}

function LandingSectionHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.35 }}>
      <div className="landing-kicker">{kicker}</div>
      <h2 className="landing-display mt-5 max-w-4xl text-4xl leading-tight tracking-tight text-[var(--landing-ink)] md:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="landing-section-copy mt-5 max-w-3xl text-base leading-8 md:text-lg">{description}</p>
      ) : null}
    </motion.div>
  );
}
export function Landing() {
  const navigate = useNavigate();
  const scrollRootRef = useRef<HTMLDivElement>(null);

  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setupComplete = useSettingsStore((state) => state.setupComplete);

  const locale = getLocale(language);
  const content: LandingCopy = LANDING_COPY[locale];
  const isDark = useMemo(
    () => theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
    [theme],
  );

  useEffect(() => {
    scrollRootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const openWorkspace = () => {
    navigate(setupComplete ? '/' : '/setup');
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const toggleLanguage = () => {
    setLanguage(locale === 'zh' ? 'en' : 'zh');
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div ref={scrollRootRef} className="landing-shell flex-1 overflow-y-auto overflow-x-hidden">
        <div className="landing-grid isolate min-h-full">
          <div className="landing-orb landing-orb--left" />
          <div className="landing-orb landing-orb--right" />

          <header className="landing-header sticky top-0 z-30">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
              <button
                type="button"
                onClick={() => scrollToSection('landing-top')}
                className="flex items-center gap-3 text-left"
              >
                <div className="landing-panel-strong flex h-11 w-11 items-center justify-center rounded-2xl p-2 shadow-sm">
                  <img src={brandLogo} alt={APP_NAME_DISPLAY} className="h-7 w-7 object-contain" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--landing-coral)]">{APP_NAME_DISPLAY}</div>
                  <div className="text-sm font-semibold text-[var(--landing-ink)]">{content.footer.brandLine}</div>
                </div>
              </button>

              <nav className="hidden items-center gap-6 md:flex">
                {content.header.nav.map((item) => (
                  <button
                    key={item.target}
                    type="button"
                    onClick={() => scrollToSection(item.target)}
                    className="text-sm font-medium text-[var(--landing-ink-muted)] transition-colors hover:text-[var(--landing-ink)]"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  aria-label={content.header.themeLabel}
                  className="landing-chip h-10 w-10 p-0"
                  onClick={toggleTheme}
                >
                  {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  aria-label={content.header.localeLabel}
                  className="landing-chip px-3"
                  onClick={toggleLanguage}
                >
                  {locale === 'zh' ? 'EN' : '中文'}
                </button>
                <button type="button" className="landing-primary-button hidden sm:inline-flex" onClick={openWorkspace}>
                  {setupComplete ? content.header.workspace : content.header.setup}
                </button>
              </div>
            </div>
          </header>

          <main>
            <section id="landing-top" className="relative">
              <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-start lg:pb-24 lg:pt-20">
                <motion.div initial="hidden" animate="visible" variants={staggerCards} className="relative z-10">
                  <motion.div variants={fadeInUp} className="landing-badge">
                    <Sparkles className="h-4 w-4" />
                    {content.hero.badge}
                  </motion.div>

                  <motion.h1
                    variants={fadeInUp}
                    className="landing-display mt-8 max-w-5xl text-5xl leading-[0.95] tracking-tight text-[var(--landing-ink)] md:text-7xl"
                  >
                    {content.hero.titleLead}{' '}
                    <span className="landing-text-gradient">{content.hero.titleAccent}</span>
                  </motion.h1>

                  <motion.p variants={fadeInUp} className="landing-section-copy mt-6 max-w-2xl text-lg leading-8 md:text-xl">
                    {content.hero.description}
                  </motion.p>

                  <motion.div variants={fadeInUp} className="mt-10 flex flex-col gap-4 sm:flex-row">
                    <button type="button" className="landing-primary-button" onClick={openWorkspace}>
                      {setupComplete ? content.hero.primaryReady : content.hero.primarySetup}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="landing-secondary-button"
                      onClick={() => scrollToSection('landing-features')}
                    >
                      {content.hero.secondary}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </motion.div>

                  <motion.div variants={staggerCards} className="mt-12 grid gap-4 md:grid-cols-3">
                    {content.hero.proofItems.map((item) => (
                      <motion.article
                        key={item.label}
                        variants={fadeInUp}
                        className="landing-stat-card rounded-[1.6rem] p-5"
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--landing-ink-muted)]">
                          {item.label}
                        </div>
                        <strong className="mt-3 text-2xl font-semibold">{item.value}</strong>
                      </motion.article>
                    ))}
                  </motion.div>

                  <motion.div variants={staggerCards} className="mt-8 grid gap-4 lg:grid-cols-3">
                    {content.hero.signalCards.map((item) => (
                      <motion.article key={item.title} variants={fadeInUp} className="landing-card rounded-[1.75rem] p-6">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--landing-coral)]">
                          {item.eyebrow}
                        </div>
                        <h3 className="mt-4 text-xl font-semibold leading-8 text-[var(--landing-ink)]">{item.title}</h3>
                        <p className="landing-muted mt-3 text-sm leading-7">{item.text}</p>
                      </motion.article>
                    ))}
                  </motion.div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.08 }}
                  className="relative z-10"
                >
                  <div className="landing-console rounded-[2.15rem] p-5 md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5 landing-divider">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--landing-coral)]">
                          {content.hero.console.eyebrow}
                        </div>
                        <h2 className="mt-3 max-w-xl text-2xl font-semibold leading-tight text-[var(--landing-ink)] md:text-3xl">
                          {content.hero.console.title}
                        </h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="landing-chip landing-chip--accent">{content.hero.console.transport}</div>
                        <div className="landing-chip landing-chip--success">
                          <span className="landing-dot" />
                          {content.hero.console.status}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {content.hero.console.metrics.map((metric) => (
                        <article key={metric.label} className="landing-console-card rounded-[1.5rem] p-4 md:p-5">
                          <div className="text-sm text-[var(--landing-ink-muted)]">{metric.label}</div>
                          <div className="mt-3 text-3xl font-semibold text-[var(--landing-ink)]">{metric.value}</div>
                          <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--landing-coral)]">
                            {metric.hint}
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="mt-5 space-y-4">
                      {content.hero.console.lanes.map((lane) => (
                        <section key={lane.title} className="landing-console-card rounded-[1.75rem] p-4 md:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-[var(--landing-ink)]">{lane.title}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--landing-ink-muted)]">
                                {lane.note}
                              </div>
                            </div>
                            <div className="landing-chip">{lane.badge}</div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {lane.items.map((item) => (
                              <article
                                key={item.name}
                                className="flex items-start gap-3 rounded-[1.25rem] border border-[var(--landing-line)] bg-[var(--landing-panel)] p-3"
                              >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10">
                                  <img
                                    src={item.icon}
                                    alt={item.name}
                                    className={cn('landing-provider-icon', item.invert && 'landing-provider-icon--invert')}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="font-semibold text-[var(--landing-ink)]">{item.name}</div>
                                    <div className="rounded-full bg-[var(--landing-coral-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--landing-coral)]">
                                      {item.tag}
                                    </div>
                                  </div>
                                  <p className="landing-muted mt-1 text-sm leading-6">{item.text}</p>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {content.hero.console.summary.map((item) => (
                        <article key={item.label} className="landing-console-card rounded-[1.35rem] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-[var(--landing-ink-muted)]">{item.label}</div>
                          <div className="mt-2 text-sm font-semibold leading-6 text-[var(--landing-ink)]">{item.value}</div>
                        </article>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
            </section>

            <section id="landing-value" className="mx-auto max-w-7xl px-6 py-20">
              <LandingSectionHeading
                kicker={content.value.kicker}
                title={content.value.title}
                description={content.value.description}
              />

              <motion.div
                variants={staggerCards}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                className="mt-12 grid gap-5 md:grid-cols-3"
              >
                {content.value.items.map((item, index) => {
                  const Icon = VALUE_ICONS[index] ?? Layers3;
                  return (
                    <motion.article key={item.title} variants={fadeInUp} className="landing-card rounded-[1.9rem] p-7">
                      <div className="landing-icon-wrap">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-6 text-2xl font-semibold text-[var(--landing-ink)]">{item.title}</h3>
                      <p className="landing-muted mt-4 text-base leading-8">{item.text}</p>
                    </motion.article>
                  );
                })}
              </motion.div>
            </section>

            <section id="landing-features" className="mx-auto max-w-7xl px-6 py-20">
              <LandingSectionHeading kicker={content.features.kicker} title={content.features.title} />

              <motion.div
                variants={staggerCards}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
              >
                {content.features.items.map((item, index) => {
                  const Icon = FEATURE_ICONS[index] ?? Cpu;
                  return (
                    <motion.article key={item.title} variants={fadeInUp} className="landing-card rounded-[1.9rem] p-7">
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--landing-coral)]">
                          {String(index + 1).padStart(2, '0')}
                        </div>
                        <div className="landing-icon-wrap">
                          <Icon className="h-5 w-5" />
                        </div>
                      </div>
                      <h3 className="mt-6 text-2xl font-semibold text-[var(--landing-ink)]">{item.title}</h3>
                      <p className="landing-muted mt-4 text-base leading-8">{item.text}</p>
                    </motion.article>
                  );
                })}
              </motion.div>
            </section>

            <section id="landing-workflow" className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[0.88fr_1.12fr]">
              <LandingSectionHeading
                kicker={content.workflow.kicker}
                title={content.workflow.title}
                description={content.workflow.description}
              />

              <motion.div
                variants={staggerCards}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="space-y-5"
              >
                {content.workflow.steps.map((step, index) => (
                  <motion.article key={step.title} variants={fadeInUp} className="landing-card rounded-[1.85rem] p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--landing-coral)] text-lg font-semibold text-white shadow-lg shadow-orange-500/20">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold text-[var(--landing-ink)]">{step.title}</h3>
                        <p className="landing-muted mt-3 text-base leading-8">{step.text}</p>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            </section>

            <section id="landing-audience" className="mx-auto max-w-7xl px-6 py-20">
              <LandingSectionHeading kicker={content.audience.kicker} title={content.audience.title} />

              <motion.div
                variants={staggerCards}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="mt-12 grid gap-5 xl:grid-cols-3"
              >
                {content.audience.cards.map((item, index) => {
                  const Icon = PERSONA_ICONS[index] ?? Sparkles;
                  return (
                    <motion.article key={item.title} variants={fadeInUp} className="landing-card landing-persona-card rounded-[2rem] p-7">
                      <div className="flex items-center justify-between gap-4">
                        <div className="landing-chip landing-chip--accent">{item.badge}</div>
                        <div className="landing-icon-wrap">
                          <Icon className="h-5 w-5" />
                        </div>
                      </div>
                      <h3 className="mt-6 text-3xl font-semibold text-[var(--landing-ink)]">{item.title}</h3>
                      <p className="landing-muted mt-4 text-base leading-8">{item.description}</p>
                      <div className="mt-8 space-y-3">
                        {item.points.map((point) => (
                          <div
                            key={point}
                            className="flex items-start gap-3 rounded-[1.2rem] border border-[var(--landing-line)] bg-[var(--landing-panel)] px-4 py-3 text-sm leading-7 text-[var(--landing-ink-soft)]"
                          >
                            <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--landing-coral)]" />
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    </motion.article>
                  );
                })}
              </motion.div>
            </section>

            <section id="landing-faq" className="mx-auto max-w-7xl px-6 py-20">
              <LandingSectionHeading kicker={content.faq.kicker} title={content.faq.title} />

              <motion.div
                variants={staggerCards}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="mt-12 grid gap-5 md:grid-cols-2"
              >
                {content.faq.items.map((item) => (
                  <motion.article key={item.question} variants={fadeInUp} className="landing-card landing-faq-card rounded-[1.85rem] p-7">
                    <h3 className="text-2xl font-semibold text-[var(--landing-ink)]">{item.question}</h3>
                    <p className="landing-muted mt-4 text-base leading-8">{item.answer}</p>
                  </motion.article>
                ))}
              </motion.div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-20">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.35 }}
                variants={fadeInUp}
                className="landing-cta-panel rounded-[2.25rem] px-8 py-12 md:px-12 md:py-16"
              >
                <div className="max-w-4xl">
                  <div className="landing-kicker">{content.cta.kicker}</div>
                  <h2 className="landing-display mt-5 text-4xl leading-tight tracking-tight text-[var(--landing-ink)] md:text-5xl">
                    {content.cta.title}
                  </h2>
                  <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--landing-ink-soft)] md:text-lg">
                    {content.cta.description}
                  </p>
                  <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                    <button type="button" className="landing-primary-button" onClick={openWorkspace}>
                      {setupComplete ? content.cta.primaryReady : content.cta.primarySetup}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="landing-secondary-button"
                      onClick={() => scrollToSection('landing-top')}
                    >
                      {content.cta.secondary}
                    </button>
                  </div>
                </div>
              </motion.div>
            </section>
          </main>

          <footer className="border-t landing-divider">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-[var(--landing-ink)]">{content.footer.brandLine}</div>
                <p className="landing-muted mt-2 max-w-3xl text-sm leading-7">{content.footer.note}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" className="landing-ghost-button px-5 py-3 text-sm" onClick={() => scrollToSection('landing-top')}>
                  {content.footer.top}
                </button>
                <button type="button" className="landing-primary-button px-5 py-3 text-sm" onClick={openWorkspace}>
                  {setupComplete ? content.header.workspace : content.header.setup}
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default Landing;



